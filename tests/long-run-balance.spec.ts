import { test, expect } from '@playwright/test';
import {
  BOARD, HOMES, ROAD_CELLS, manhattanDistance, type Cell, type ModelId
} from '../src/game/config';
import { GameStore } from '../src/game/state';
import {
  HOME_DWELL_SECONDS, TRAFFIC_LANE_CHANGE_SECONDS, advanceTraffic,
  canReserveRoad, newCarCycle, passingLaneBlockedAhead, planLaneChanges,
  stepCarCycle, TRAFFIC_MIN_GAP, type CarCycle, type RoadLane, type RoadVehicle
} from '../src/game/traffic';
import { MAX_ENVIRONMENT_EFFECTS, MAX_EFFECTS_BY_KIND } from '../src/game/environment';
import { VINTAGE_BALANCE, summariseRun } from '../src/game/balance';
import { chooseWorkshopMoment } from '../src/game/workbench';
import { bendSpeedMultiplier, drivingProfile, type DrivingProfile } from '../src/game/driving';

type Scenario = 'bare-town' | 'cared-for' | 'minimal-care';
interface TestCar {
  residentId:number;
  startIndex:number;
  cycle:CarCycle;
  tileIndex:number;
  speed:number;
  speedFactor:number;
  driver:DrivingProfile;
  lane:RoadLane;
  changingTo:RoadLane|null;
  laneChangeElapsed:number;
  parkedForActivity:boolean;
}
interface TrialResult {
  seed:number;
  scenario:Scenario;
  phase:string;
  progress:number;
  occupiedHomes:number;
  simulatedSeconds:number;
  balance:number;
  ledger:ReturnType<typeof summariseRun>;
  helpful:number;
  troublesome:number;
  notes:number;
  stuckSeconds:number;
}

const length=ROAD_CELLS.length*BOARD.tile;
const dt=.12;
const plans:Array<{id:ModelId;cell:Cell}>=[
  {id:'tree',cell:{x:6,y:3}},
  {id:'bench',cell:{x:7,y:3}},
  {id:'limit',cell:{x:18,y:3}},
  {id:'bin',cell:{x:4,y:4}}
];

function trial(seed:number,scenario:Scenario,timeout=440):TrialResult {
  const store=new GameStore();
  store.legacy.upgrades={savings:0,patience:0};
  store.newRun(seed);
  if(scenario!=='bare-town'){
    for(const item of plans){
      if(!store.place(item.cell,item.id))throw new Error('Invalid balance scenario placement: '+item.id);
      if(scenario==='minimal-care')store.setModelCare(item.cell,'bare');
    }
  }
  const cars:TestCar[]=HOMES.map(home=>{
    const driver=drivingProfile(home.id);
    return {
      residentId:home.id,
      startIndex:ROAD_CELLS.findIndex(cell=>manhattanDistance(cell,home)===1),
      cycle:newCarCycle(),tileIndex:-1,speed:driver.cruiseSpeed,speedFactor:1,
      driver,lane:'left' as const,changingTo:null,laneChangeElapsed:0,
      parkedForActivity:false
    };
  });
  expect(cars.every(car=>car.startIndex>=0)).toBe(true);
  let clock=0,allStopped=0,worstStall=0;
  while(clock<timeout && store.phase==='playing'){
    store.tickEconomy(dt);
    clock+=dt;
    const vergeObstructions=store.environment.effects
      .filter(effect=>effect.kind==='display'||effect.kind==='litter')
      .map(effect=>effect.cell);
    const vehicles:RoadVehicle[]=[];
    for(const car of cars){
      if(!store.residents[car.residentId].occupied)continue;
      const position=(car.startIndex*BOARD.tile+car.cycle.distance)%length;
      if(car.cycle.phase==='driving' &&
        (car.parkedForActivity || store.activities.forResident(car.residentId))){
        car.parkedForActivity=true;
        continue;
      }
      if(car.cycle.phase==='driving'){
        const index=Math.min(ROAD_CELLS.length-1,Math.floor(position/BOARD.tile));
        const sign=store.speedMultiplierAt(ROAD_CELLS[index]);
        car.speedFactor+=(sign-car.speedFactor)*Math.min(1,dt*7);
        vehicles.push({residentId:car.residentId,position,
          desiredSpeed:store.traffic.shouldStop(car.residentId)||
            (car.lane==='passing'&&passingLaneBlockedAhead(position,vergeObstructions,30))
            ?0:car.speed*car.speedFactor*bendSpeedMultiplier(position,car.driver),
          lane:car.lane,changingTo:car.changingTo,driver:car.driver});
      }else if(car.cycle.phase==='departing'){
        vehicles.push({residentId:car.residentId,
          position:car.startIndex*BOARD.tile,desiredSpeed:0,
          lane:'left',drivewayReservation:true});
      }
    }
    const granted=new Set<number>();
    for(const car of cars){
      if(!store.residents[car.residentId].occupied||
        car.cycle.phase!=='at-home'||car.cycle.timer+dt<HOME_DWELL_SECONDS)continue;
      const position=car.startIndex*BOARD.tile;
      if(!canReserveRoad(position,vehicles,length))continue;
      granted.add(car.residentId);
      vehicles.push({residentId:car.residentId,position,desiredSpeed:0,
        lane:'left',drivewayReservation:true});
    }
    for(const car of cars){
      if(!car.parkedForActivity||store.activities.forResident(car.residentId)||
        !store.residents[car.residentId].occupied||car.cycle.phase!=='driving')continue;
      const position=(car.startIndex*BOARD.tile+car.cycle.distance)%length;
      if(!canReserveRoad(position,vehicles,length))continue;
      car.parkedForActivity=false;
      car.lane='left';car.changingTo=null;car.laneChangeElapsed=0;
      vehicles.push({residentId:car.residentId,position,desiredSpeed:0,
        lane:'left',drivewayReservation:true,driver:car.driver});
    }
    const laneChanges=planLaneChanges(vehicles,length,vergeObstructions);
    for(const car of cars){
      const target=laneChanges.get(car.residentId);
      if(!target||car.changingTo||car.cycle.phase!=='driving')continue;
      car.changingTo=target;
      car.laneChangeElapsed=0;
      const vehicle=vehicles.find(item=>item.residentId===car.residentId);
      if(vehicle)vehicle.changingTo=target;
    }
    const moves=advanceTraffic(vehicles,dt,length);
    const byResident=new Map(moves.map(m=>[m.residentId,m]));
    const queued:Array<{residentId:number;cell:Cell;delaySeconds:number}>=[];
    for(const car of cars){
      const resident=store.residents[car.residentId];
      if(!resident.occupied)continue;
      if(car.parkedForActivity||store.activities.forResident(car.residentId)){
        car.parkedForActivity=true;
        continue;
      }
      const oldPhase=car.cycle.phase;
      const movement=byResident.get(car.residentId);
      if(oldPhase==='driving'){
        const finished=stepCarCycle(car.cycle,dt,movement?.distance??0,length);
        if(finished){
          store.finishLap(car.residentId);
          car.tileIndex=-1;
        } else if(movement?.queued && movement.delaySeconds>0){
          const position=(car.startIndex*BOARD.tile+car.cycle.distance)%length;
          const index=Math.min(ROAD_CELLS.length-1,Math.floor(position/BOARD.tile));
          queued.push({residentId:car.residentId,cell:ROAD_CELLS[index],
            delaySeconds:movement.delaySeconds});
        }
      }else{
        stepCarCycle(car.cycle,dt,0,length,granted.has(car.residentId));
      }
      if(car.cycle.phase==='at-home'){
        car.lane='left';
        car.changingTo=null;
        car.laneChangeElapsed=0;
      }
      if(car.cycle.phase==='driving'){
        if(car.changingTo){
          car.laneChangeElapsed+=dt;
          if(car.laneChangeElapsed>=TRAFFIC_LANE_CHANGE_SECONDS){
            car.lane=car.changingTo;
            car.changingTo=null;
            car.laneChangeElapsed=0;
          }
        }
        const position=(car.startIndex*BOARD.tile+car.cycle.distance)%length;
        const index=Math.min(ROAD_CELLS.length-1,Math.floor(position/BOARD.tile));
        if(index!==car.tileIndex){
          car.tileIndex=index;
          store.passTile(car.residentId,ROAD_CELLS[index],
            car.lane==='left'&&!car.changingTo);
          store.considerRoadsideAccident(car.residentId,ROAD_CELLS[index],
            movement?.speed??0,car.lane,!!car.changingTo);
        }
      }
    }
    store.reportTrafficFlow(queued);

    // Run the same two-lane overtaking decisions as the visible cars:
    // a new passing manoeuvre must never create an unbounded road deadlock.
    const activeCars=vehicles.filter(v=>v.desiredSpeed>1);
    if(store.traffic.activeStop===null && activeCars.length>=2 &&
       moves.every(m=>m.speed<.3)) allStopped+=dt;
    else allStopped=0;
    worstStall=Math.max(worstStall,allStopped);

    if(Math.round(clock*10)%37===0){
      expect(store.money).toBe(
        145+store.ledger.coinsEarned-store.ledger.carePaid-store.ledger.miniaturePurchases);
      expect(store.residents.every(r=>Number.isFinite(r.irritation)&&
        r.irritation>=0&&r.irritation<=100)).toBe(true);
      expect(store.environment.effects.length).toBeLessThanOrEqual(MAX_ENVIRONMENT_EFFECTS);
      expect(store.accidents.active.length).toBeLessThanOrEqual(2);
      expect(store.placements.every(model=>
        ['intact','damaged','broken'].includes(model.condition??'intact'))).toBe(true);
      for(const kind of Object.keys(MAX_EFFECTS_BY_KIND) as Array<keyof typeof MAX_EFFECTS_BY_KIND>){
        expect(store.environment.effects.filter(e=>e.kind===kind).length)
          .toBeLessThanOrEqual(MAX_EFFECTS_BY_KIND[kind]);
      }
      for(const bin of store.placements.filter(x=>x.id==='bin')){
        expect(bin.fill).toBeGreaterThanOrEqual(0);
        expect(bin.fill).toBeLessThanOrEqual(6);
      }
      const positions=vehicles.filter(v=>v.desiredSpeed>0)
        .map(v=>({id:v.residentId,
          position:(cars[v.residentId].startIndex*BOARD.tile+
            cars[v.residentId].cycle.distance)%length}))
        .sort((a,b)=>a.position-b.position);
      // Keep minimum-distance checking in the solver's dedicated property test:
      // here we focus on run-level economy, incident caps and progress.
      expect(positions.every(x=>Number.isFinite(x.position))).toBe(true);
    }
  }
  const report=store.runSummary;
  expect(report.completedLaps).toBe(store.residents.reduce((n,r)=>n+r.laps,0));
  expect(store.ledger.helpfulActions+store.ledger.troublesomeActions)
    .toBeLessThanOrEqual(report.completedLaps+6);
  expect(store.workbenchMoments.length).toBeLessThanOrEqual(3);
  expect(report.maxEnvironmentalPatches).toBeLessThanOrEqual(MAX_ENVIRONMENT_EFFECTS);
  expect(report.peakQueue).toBeLessThanOrEqual(6);
  expect(worstStall).toBeLessThan(12);
  // The original traffic separation constants remain the same.
  expect(TRAFFIC_MIN_GAP).toBe(38);
  return {
    seed,scenario,phase:store.phase,progress:store.progress,
    occupiedHomes:store.occupiedHomes,simulatedSeconds:Math.round(clock),
    balance:store.money,ledger:report,helpful:store.ledger.helpfulActions,
    troublesome:store.ledger.troublesomeActions,notes:store.workbenchMoments.length,
    stuckSeconds:Math.round(worstStall*10)/10
  };
}

test('long seeded runs keep traffic, incidents, money and rewards bounded',()=>{
  const seeds=[11,29,67];
  const summary:TrialResult[]=[];
  for(const seed of seeds){
    for(const scenario of ['bare-town','cared-for','minimal-care'] as const){
      summary.push(trial(seed,scenario));
    }
  }
  console.log('VINTAGE_BALANCE_TRIALS '+JSON.stringify(summary));
  expect(summary.every(row=>row.simulatedSeconds>30)).toBe(true);
  expect(summary.some(row=>row.ledger.incidentCount>=2)).toBe(true);
  expect(summary.some(row=>row.ledger.trafficDelaySeconds>0)).toBe(true);
  expect(summary.every(row=>row.ledger.earnings>=0&&row.ledger.servicing>=0)).toBe(true);
});

test('replaying identical inputs and seed reproduces a full-town outcome',()=>{
  const a=trial(811,'cared-for');
  const b=trial(811,'cared-for');
  expect(a).toEqual(b);
  expect(a.ledger.completedLaps).toBeGreaterThan(5);
});

test('workbench scenes reflect actual building and travel choices, not arbitrary psychology',()=>{
  const blank={completedLaps:0,coinsEarned:0,carePaid:0,miniaturePurchases:0,
    helpfulActions:0,troublesomeActions:0,litterCaught:0,overflowingBins:0,
    manualClearances:0,manualCollections:0,maximumEnvironmentalEffects:0,
    largestQueue:0,secondsLostInTraffic:0};
  const ordinary=chooseWorkshopMoment({
    milestone:1,ledger:blank,models:[],closedHomes:0,coins:145
  });
  const swept=chooseWorkshopMoment({
    milestone:1,ledger:{...blank,litterCaught:3},models:[],closedHomes:0,coins:145
  });
  const busy=chooseWorkshopMoment({
    milestone:2,ledger:{...blank,secondsLostInTraffic:13},
    models:[],closedHomes:0,coins:45
  });
  expect(ordinary.motif).toBe('ordinary');
  expect(swept.motif).toBe('clearing');
  expect(busy.motif).toBe('road');
  expect(swept.line).toContain('paper scrap');
  expect(busy.line).toContain('cars');
  expect(swept.line).not.toBe(ordinary.line);
  expect(chooseWorkshopMoment({milestone:3,ledger:blank,
    models:[],closedHomes:2,coins:0}).motif).toBe('absence');
});

test('pacing constants avoid guaranteed event outcomes and intrusive rapid interruptions',()=>{
  expect(VINTAGE_BALANCE.behaviourOpportunityChance).toBeGreaterThan(.3);
  expect(VINTAGE_BALANCE.behaviourOpportunityChance).toBeLessThan(.45);
  expect(VINTAGE_BALANCE.behaviourCooldownSeconds).toBeGreaterThanOrEqual(50);
  // Arbitrary litter from unrelated traffic incidents was removed in 6A;
  // activity-generated picnic scraps belong to the following pass.
  expect(VINTAGE_BALANCE.behaviourCooldownSeconds).toBeGreaterThanOrEqual(50);
  expect(VINTAGE_BALANCE.stopGlobalCooldownSeconds).toBeGreaterThanOrEqual(15);
});


test('four simulated minutes of heavy litter pressure cannot break bin servicing or money flow',()=>{
  const road:Cell={x:4,y:3}, bin:Cell={x:4,y:4};
  const outcomes:Array<{care:string;fill:number;overflow:boolean;paid:number;captured:number}>=[];
  for(const care of ['full','economy','bare'] as const){
    const store=new GameStore();
    store.legacy.upgrades={savings:0,patience:0};
    store.newRun(753);
    expect(store.place(bin,'bin')).toBe(true);
    expect(store.setModelCare(bin,care)).toBe(true);
    for(let tick=0;tick<120;tick++){
      if(tick%3===0)store.debugEnvironmentEvent('litter',2,road);
      store.tickEconomy(2);
      const status=store.getBinStatus(bin)!;
      expect(status.fill).toBeGreaterThanOrEqual(0);
      expect(status.fill).toBeLessThanOrEqual(6);
      expect(store.environment.effects.length).toBeLessThanOrEqual(MAX_ENVIRONMENT_EFFECTS);
      expect(store.money).toBe(145-store.ledger.miniaturePurchases-store.ledger.carePaid);
    }
    const status=store.getBinStatus(bin)!;
    outcomes.push({
      care, fill:status.fill,overflow:status.overflowed,
      paid:store.ledger.carePaid,captured:store.ledger.litterCaught
    });
    if(care!=='bare'){
      expect(status.fill).toBe(0);
      expect(status.overflowed).toBe(false);
      expect(store.ledger.carePaid).toBeGreaterThan(0);
    }else{
      expect(status.collectionDueIn).toBeNull();
    }
  }
  console.log('BIN_LOAD_TRIALS '+JSON.stringify(outcomes));
  expect(outcomes[0].captured).toBeGreaterThan(outcomes[2].captured);
  expect(outcomes[2].fill).toBeGreaterThanOrEqual(3);
  expect(outcomes[2].paid).toBe(0);
});
