import { test, expect } from '@playwright/test';
import { BOARD, ROAD_CELLS, type Cell } from '../src/game/config';
import {
  advanceTraffic, canReserveRoad, GRIDLOCK_RECOVERY_SECONDS, planInitialRoadEntries,
  TrafficGridlockWatch, TRAFFIC_MIN_GAP, TRAFFIC_MERGE_GAP, type RoadVehicle
} from '../src/game/traffic';

const length = ROAD_CELLS.length * BOARD.tile;
const forwardGap = (a:number,b:number):number => (b-a+length)%length;

test('shared home entrances start only one car on the carriageway',()=>{
  const entries=[
    {residentId:0,position:10*BOARD.tile},
    {residentId:1,position:10*BOARD.tile},
    {residentId:2,position:11*BOARD.tile},
    {residentId:3,position:22*BOARD.tile}
  ];
  const allowed=planInitialRoadEntries(entries,length);
  expect([...allowed]).toEqual([0,3]);
  expect(allowed.has(1)).toBe(false);
  expect(allowed.has(2)).toBe(false);
  const admitted=entries.filter(entry=>allowed.has(entry.residentId));
  for(let i=0;i<admitted.length;i++){
    for(let j=i+1;j<admitted.length;j++){
      const distance=Math.min(forwardGap(admitted[i].position,admitted[j].position),
        forwardGap(admitted[j].position,admitted[i].position));
      expect(distance).toBeGreaterThanOrEqual(TRAFFIC_MERGE_GAP);
    }
  }
});

test('saturated or invalid entry lists cannot bypass the road reservation guard',()=>{
  expect(planInitialRoadEntries([],length).size).toBe(0);
  expect(planInitialRoadEntries([{residentId:0,position:NaN}],length).size).toBe(0);
  const entries=Array.from({length:20},(_,id)=>({
    residentId:id,position:id*BOARD.tile
  }));
  const launched=planInitialRoadEntries(entries,length);
  expect(launched.size).toBeGreaterThan(1);
  for(const candidate of entries){
    if(launched.has(candidate.residentId))continue;
    const active=entries.filter(entry=>launched.has(entry.residentId))
      .map(entry=>({...entry,desiredSpeed:0}));
    expect(canReserveRoad(candidate.position,active,length)).toBe(false);
  }
});

test('an actual zero-gap circular queue is detected and one car is recovered',()=>{
  const vehicles:RoadVehicle[]=[
    {residentId:0,position:430,desiredSpeed:85,lane:'left'},
    {residentId:1,position:430,desiredSpeed:82,lane:'left'},
    {residentId:2,position:950,desiredSpeed:96,lane:'left'}
  ];
  const watch=new TrafficGridlockWatch();
  let recovered:number|null=null;
  for(let k=0;k<120;k++){
    const movements=advanceTraffic(vehicles,.1,length);
    const notification=watch.observe(.1,vehicles,movements,false);
    if(notification!==null){
      recovered=notification;break;
    }
    for(let i=0;i<vehicles.length;i++){
      vehicles[i].position=(vehicles[i].position+movements[i].distance)%length;
    }
  }
  // The other car is allowed to move normally. No need to teleport the queue.
  expect(recovered).toBe(1);
  const remaining=vehicles.filter(vehicle=>vehicle.residentId!==recovered);
  const after=advanceTraffic(remaining,.1,length);
  expect(after.find(move=>move.residentId===0)?.distance).toBeGreaterThan(0);
  expect(after.find(move=>move.residentId===2)?.distance).toBeGreaterThan(0);
  expect(TRAFFIC_MIN_GAP).toBe(38);
});

test('a normal bounded family stop, driveway reservation or normal following is never cleared',()=>{
  const watch=new TrafficGridlockWatch();
  const stopped:RoadVehicle[]=[
    {residentId:0,position:430,desiredSpeed:0,lane:'left'},
    {residentId:1,position:430-TRAFFIC_MIN_GAP,desiredSpeed:85,lane:'left'}
  ];
  for(let i=0;i<GRIDLOCK_RECOVERY_SECONDS*12;i++){
    const moves=advanceTraffic(stopped,.1,length);
    expect(watch.observe(.1,stopped,moves,true)).toBeNull();
  }
  const reserved=[
    {...stopped[0],drivewayReservation:true},
    stopped[1]
  ];
  for(let i=0;i<GRIDLOCK_RECOVERY_SECONDS*12;i++){
    expect(watch.observe(.1,reserved,advanceTraffic(reserved,.1,length),false)).toBeNull();
  }
  const moving:RoadVehicle[]=[
    {residentId:0,position:220,desiredSpeed:85,lane:'left'},
    {residentId:1,position:350,desiredSpeed:85,lane:'left'}
  ];
  for(let i=0;i<200;i++){
    const moves=advanceTraffic(moving,.05,length);
    expect(watch.observe(.05,moving,moves,false)).toBeNull();
    moving.forEach((car,j)=>car.position=(car.position+moves[j].distance)%length);
  }
});

test('an indefinite obstruction can be cleared after a real non-stop standstill',()=>{
  const watch=new TrafficGridlockWatch();
  const jam:RoadVehicle[]=[
    {residentId:0,position:540,desiredSpeed:0,lane:'passing'},
    {residentId:1,position:540-TRAFFIC_MIN_GAP,desiredSpeed:95,lane:'passing'},
    {residentId:2,position:540-2*TRAFFIC_MIN_GAP,desiredSpeed:80,lane:'passing'}
  ];
  let recovery:number|null=null;
  for(let i=0;i<GRIDLOCK_RECOVERY_SECONDS*20;i++){
    const moves=advanceTraffic(jam,.1,length);
    const id=watch.observe(.1,jam,moves,false);
    if(id!==null){recovery=id;break;}
  }
  expect(recovery).toBe(0); // Remove the blocking car, not its followers.
});


test('two cars trapped behind passing-lane obstruction recover even with zero desired speed',()=>{
  const watch=new TrafficGridlockWatch();
  const blocked:RoadVehicle[]=[
    {residentId:0,position:400,desiredSpeed:0,lane:'passing'},
    {residentId:1,position:400-TRAFFIC_MIN_GAP,desiredSpeed:0,lane:'passing'}
  ];
  let recovered:number|null=null;
  for(let i=0;i<GRIDLOCK_RECOVERY_SECONDS*12;i++){
    recovered=watch.observe(.1,blocked,advanceTraffic(blocked,.1,length),false);
    if(recovered!==null)break;
  }
  expect(recovered).toBe(0);
});

test('founding houses sharing a road entry wait safely at home and later depart',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/');
  const initial=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const {HOMES}=await import('/src/game/config.ts');
    const plots:Cell[]=[
      {x:7,y:1}, // Finches north side of the same road square as Bells
      {x:7,y:3}, // Bells south side of that square
      {x:14,y:1},{x:21,y:5},{x:14,y:11},{x:1,y:7}
    ];
    for(const home of HOMES){
      store.chooseFoundingFamily(home.id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome(plots[home.id]))throw new Error('Cannot place '+home.name);
    }
    if(!store.beginVintageYears())throw new Error('Town did not begin');
    return store.residents.map(r=>({id:r.id,laps:r.laps}));
  });
  expect(initial.every(item=>item.laps===0)).toBe(true);
  const debug=await page.evaluate(()=>{
    const d=(window as typeof window&{
      __modelLoopDebug:{trafficSnapshot:()=>Array<{
        residentId:number;phase:string;position:number
      }>}
    }).__modelLoopDebug;
    return d.trafficSnapshot();
  });
  const pair=debug.filter(c=>c.residentId===0||c.residentId===1);
  expect(pair).toHaveLength(2);
  expect(pair.filter(c=>c.phase==='driving')).toHaveLength(1);
  expect(pair.filter(c=>c.phase==='at-home')).toHaveLength(1);
  const active=debug.filter(car=>car.phase==='driving');
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
    expect(Math.min(forwardGap(active[i].position,active[j].position),
      forwardGap(active[j].position,active[i].position)))
      .toBeGreaterThanOrEqual(TRAFFIC_MIN_GAP-1e-6);
  }
  await expect.poll(async()=>page.evaluate(()=>{
    const d=(window as typeof window&{__modelLoopDebug:{
      trafficSnapshot:()=>Array<{residentId:number;phase:string;travelled:number}>
    }}).__modelLoopDebug;
    const second=d.trafficSnapshot().find(c=>c.residentId===1);
    return second?.phase==='driving'&&second.travelled>5;
  }),{timeout:11000,interval:200}).toBe(true);
  expect(errors).toEqual([]);
});

test('the original reference layout still starts on the road without an empty screen',async({page})=>{
  await page.goto('/?referenceTown=1');
  const initial=await page.evaluate(()=>{
    const d=(window as typeof window&{
      __modelLoopDebug:{trafficSnapshot:()=>Array<{residentId:number;phase:string}>}
    }).__modelLoopDebug;
    return d.trafficSnapshot();
  });
  expect(initial).toHaveLength(6);
  expect(initial.every(car=>car.phase==='driving')).toBe(true);
});

test('short driveway and family-stop intervals do not erase prior real gridlock',()=>{
  const watch=new TrafficGridlockWatch();
  const stopped:RoadVehicle[]=[
    {residentId:0,position:500,desiredSpeed:0,lane:'left'},
    {residentId:1,position:500-TRAFFIC_MIN_GAP,desiredSpeed:88,lane:'left'}
  ];
  const simulate=(vehicles:readonly RoadVehicle[],paused:boolean):number|null=>
    watch.observe(.1,vehicles,advanceTraffic(vehicles,.1,length),paused);
  for(let i=0;i<70;i++)expect(simulate(stopped,false)).toBeNull();
  expect(watch.stalledFor(0)).toBeGreaterThan(6.9);
  const driveway:RoadVehicle={residentId:2,position:1200,
    desiredSpeed:0,lane:'left',drivewayReservation:true};
  for(let i=0;i<25;i++)expect(simulate([...stopped,driveway],false)).toBeNull();
  expect(watch.stalledFor(0)).toBeGreaterThan(6.9);
  for(let i=0;i<35;i++)expect(simulate(stopped,true)).toBeNull();
  expect(watch.stalledFor(0)).toBeGreaterThan(6.9);
  let recovery:number|null=null;
  for(let i=0;i<40;i++){
    recovery=simulate(stopped,false);
    if(recovery!==null)break;
  }
  expect(recovery).toBe(0);
  expect(watch.snapshot().recoveries).toBe(1);
});

test('frequent short driveway reservations cannot suppress an unending traffic jam',()=>{
  const watch=new TrafficGridlockWatch();
  const stopped:RoadVehicle[]=[
    {residentId:0,position:500,desiredSpeed:0,lane:'left'},
    {residentId:1,position:500-TRAFFIC_MIN_GAP,desiredSpeed:80,lane:'left'}
  ];
  const driveway:RoadVehicle={residentId:2,position:1500,
    desiredSpeed:0,lane:'left',drivewayReservation:true};
  let found:number|null=null;
  for(let frame=0;frame<220;frame++){
    const vehicles=frame%20<4?[...stopped,driveway]:stopped;
    const moves=advanceTraffic(vehicles,.1,length);
    found=watch.observe(.1,vehicles,moves,false);
    if(found!==null)break;
  }
  expect(found).toBe(0);
});

test('an isolated driver whose passing lane is permanently obstructed is recovered',()=>{
  const watch=new TrafficGridlockWatch();
  const lone:RoadVehicle[]=[
    {residentId:4,position:740,desiredSpeed:0,lane:'passing'}
  ];
  let rescued:number|null=null;
  for(let frame=0;frame<GRIDLOCK_RECOVERY_SECONDS*12;frame++){
    rescued=watch.observe(.1,lone,advanceTraffic(lone,.1,length),false);
    if(rescued!==null)break;
  }
  expect(rescued).toBe(4);
});

test('genuine progress releases accumulated standstill and prevents false marshals',()=>{
  const watch=new TrafficGridlockWatch();
  const stopped:RoadVehicle[]=[
    {residentId:0,position:500,desiredSpeed:0,lane:'left'},
    {residentId:1,position:500-TRAFFIC_MIN_GAP,desiredSpeed:85,lane:'left'}
  ];
  for(let i=0;i<75;i++)
    watch.observe(.1,stopped,advanceTraffic(stopped,.1,length),false);
  expect(watch.stalledFor(0)).toBeGreaterThan(7);
  const released:RoadVehicle[]=[
    {...stopped[0],desiredSpeed:90},
    {...stopped[1],position:200,desiredSpeed:86}
  ];
  const moves=advanceTraffic(released,.1,length);
  expect(moves.every(move=>move.speed>1)).toBe(true);
  expect(watch.observe(.1,released,moves,false)).toBeNull();
  expect(watch.stalledFor(0)).toBe(0);
  for(let i=0;i<100;i++)
    expect(watch.observe(.1,released,moves,false)).toBeNull();
});

test('dev snapshots distinguish actual motion from nominal driving speed',async({page})=>{
  await page.goto('/?referenceTown=1');
  const initial=await page.evaluate(()=>{
    const d=(window as typeof window&{
      __modelLoopDebug:{trafficSnapshot:()=>Array<{
        residentId:number;speed:number;actualSpeed:number;
        stalledSeconds:number;recoveryCount:number
      }>}
    }).__modelLoopDebug;
    return d.trafficSnapshot();
  });
  expect(initial).toHaveLength(6);
  expect(initial.every(car=>Number.isFinite(car.speed)&&
    Number.isFinite(car.actualSpeed)&&Number.isFinite(car.stalledSeconds)&&
    Number.isInteger(car.recoveryCount))).toBe(true);
});
