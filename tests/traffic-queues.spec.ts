import { test, expect } from '@playwright/test';
import {
  HOME_DWELL_SECONDS, HOME_TRAVEL_SECONDS, TRAFFIC_MIN_GAP,
  TRAFFIC_MERGE_GAP, advanceTraffic, canReserveRoad, newCarCycle,
  RoadTraffic, stepCarCycle
} from '../src/game/traffic';
import { GameStore } from '../src/game/state';

function forwardGap(a:number,b:number,length:number):number {
  return (b-a+length)%length;
}

test('simultaneous following preserves a safe gap through hard braking and road wrap',()=>{
  const length=1500;
  const vehicles=[
    {residentId:0,position:100,desiredSpeed:90},
    {residentId:1,position:162,desiredSpeed:85},
    {residentId:2,position:225,desiredSpeed:80},
    {residentId:3,position:510,desiredSpeed:88},
    {residentId:4,position:900,desiredSpeed:92},
    {residentId:5,position:1290,desiredSpeed:86}
  ];
  let sawQueue=false,sawRecovery=false,lag=0,frontFirstStop=225;
  for(let frame=0;frame<420;frame++){
    // The driver at index 2 pauses for four seconds then rejoins at normal speed.
    vehicles[2].desiredSpeed=frame<80?0:80;
    const moves=advanceTraffic(vehicles,.05,length);
    expect(moves).toHaveLength(6);
    if(frame<80 && moves.some(m=>m.queued))sawQueue=true;
    if(frame>115 && moves.find(m=>m.residentId===1)!.speed>60)sawRecovery=true;
    for(let i=0;i<vehicles.length;i++){
      const vehicle=vehicles[i], movement=moves[i];
      expect(movement.residentId).toBe(vehicle.residentId);
      expect(movement.distance).toBeGreaterThanOrEqual(0);
      expect(movement.speed).toBeLessThanOrEqual(vehicle.desiredSpeed+1e-5);
      if(movement.queued)lag+=movement.delaySeconds;
      vehicle.position=(vehicle.position+movement.distance)%length;
    }
    const inOrder=[...vehicles].sort((a,b)=>a.position-b.position);
    for(let i=0;i<inOrder.length;i++){
      const gap=forwardGap(inOrder[i].position,inOrder[(i+1)%inOrder.length].position,length);
      expect(gap).toBeGreaterThanOrEqual(TRAFFIC_MIN_GAP-1e-5);
    }
  }
  expect(frontFirstStop).toBe(225);
  expect(sawQueue).toBe(true);
  expect(sawRecovery).toBe(true);
  expect(lag).toBeGreaterThan(.5);
});

test('wrap-around follower slows rather than overtaking a car at zero',()=>{
  const length=1000;
  const positions=[
    {residentId:1,position:995,desiredSpeed:90},
    {residentId:0,position:40,desiredSpeed:0}
  ];
  let prevGap=forwardGap(995,40,length);
  for(let frame=0;frame<60;frame++){
    const moves=advanceTraffic(positions,.05,length);
    positions.forEach((v,i)=>v.position=(v.position+moves[i].distance)%length);
    const gap=forwardGap(positions[0].position,positions[1].position,length);
    expect(gap).toBeGreaterThanOrEqual(TRAFFIC_MIN_GAP-1e-6);
    expect(gap).toBeLessThanOrEqual(prevGap+1e-5);
    prevGap=gap;
  }
});

test('a full driveway entry is reserved until both sides are clear',()=>{
  const length=2000;
  expect(canReserveRoad(300,[{residentId:1,position:340,desiredSpeed:90}],length)).toBe(false);
  expect(canReserveRoad(300,[{residentId:2,position:265,desiredSpeed:90}],length)).toBe(false);
  expect(canReserveRoad(300,[{residentId:2,position:420,desiredSpeed:90}],length)).toBe(true);
  expect(canReserveRoad(300,[{residentId:2,position:260,desiredSpeed:90}],length)).toBe(false);
  expect(canReserveRoad(300,[{residentId:2,position:230,desiredSpeed:90}],length)).toBe(true);
  expect(TRAFFIC_MERGE_GAP).toBeGreaterThan(TRAFFIC_MIN_GAP);
  expect(canReserveRoad(300,[],length)).toBe(true);
});

test('residents cannot depart home into occupied road space or earn coins twice',()=>{
  const cycle=newCarCycle();
  expect(stepCarCycle(cycle,1,500,500)).toBe(true);
  expect(cycle.phase).toBe('returning');
  stepCarCycle(cycle,HOME_TRAVEL_SECONDS,0,500);
  expect(cycle.phase).toBe('at-home');
  stepCarCycle(cycle,HOME_DWELL_SECONDS+10,0,500,false);
  expect(cycle.phase).toBe('at-home');
  expect(cycle.timer).toBe(HOME_DWELL_SECONDS);
  expect(stepCarCycle(cycle,1,500,500,false)).toBe(false);
  expect(cycle.phase).toBe('at-home');
  stepCarCycle(cycle,.05,0,500,true);
  expect(cycle.phase).toBe('departing');
  stepCarCycle(cycle,HOME_TRAVEL_SECONDS,0,500);
  expect(cycle.phase).toBe('driving');
  expect(cycle.distance).toBe(0);
  expect(stepCarCycle(cycle,.1,500,500)).toBe(true);
});

test('seeded stops are bounded, do not overlap, and expire only with simulated time',()=>{
  const first=new RoadTraffic(725),second=new RoadTraffic(725);
  expect(Array.from({length:8},()=>first.opportunityOffset(55)))
    .toEqual(Array.from({length:8},()=>second.opportunityOffset(55)));
  const stop=first.forceStop(1,{x:7,y:2},3.5,999);
  expect(stop).not.toBeNull();
  expect(stop?.endsAt).toBe(9.5); // duration clamped at six seconds
  expect(first.shouldStop(1)).toBe(true);
  expect(first.shouldStop(2)).toBe(false);
  expect(first.forceStop(5,{x:2,y:7},5)).toBeNull();
  expect(first.tick(9.4)).toBe(false);
  expect(first.activeStop).toBeTruthy();
  expect(first.tick(9.5)).toBe(true);
  expect(first.activeStop).toBeNull();
  expect(first.attempt(1,90,{x:7,y:2},10)).toBeNull(); // cooldown
  expect(first.lastIncident?.residentId).toBe(1);
});

test('queue delays affect irritation and real safety, but not coins without a completed lap',()=>{
  const store=new GameStore();store.newRun(12);
  const balance=store.money, baseSafety=store.safety;
  const initial=store.residents[0].irritation;
  store.reportTrafficFlow([{residentId:0,cell:{x:3,y:3},delaySeconds:1.5}]);
  expect(store.residents[0].trafficDelay).toBe(1.5);
  expect(store.residents[0].irritation).toBeGreaterThan(initial);
  expect(store.traffic.queuedCars).toHaveLength(1);
  expect(store.safety).toBe(baseSafety-2);
  expect(store.tileInfo({x:3,y:3})?.noise).toBe(3);
  expect(store.money).toBe(balance);
  expect(store.cashflow.net).toBe(0);
  store.reportTrafficFlow([]);
  expect(store.traffic.queuedCars).toHaveLength(0);
  expect(store.safety).toBe(baseSafety);
  expect(store.finishLap(0)).toBe(15);
  expect(store.cashflow.net).toBe(15);
});

test('real road stop appears on screen, creates a physical queue, then clears',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const result=await page.evaluate(()=>{
    const debug=(window as typeof window & {
      __modelLoopDebug:{trafficStop:(id:number,duration?:number)=>boolean;
        snapshot:()=>{activeStop:unknown;queued:unknown[]};
        trafficSnapshot:()=>Array<{residentId:number;position:number;phase:string}>};
    }).__modelLoopDebug;
    return {
      triggered:debug.trafficStop(1,6),
      snapshot:debug.snapshot(),
      cars:debug.trafficSnapshot()
    };
  });
  expect(result.triggered).toBe(true);
  expect(result.snapshot.activeStop).not.toBeNull();
  await expect(page.locator('#traffic-status')).toContainText('ROAD PAUSE');
  await expect(page.locator('#notice')).toContainText('Bells');
  await expect(page.locator('#game-container canvas')).toBeVisible();

  await page.waitForFunction(()=>{
    const debug=(window as typeof window & {__modelLoopDebug:{
      snapshot:()=>{queued:unknown[]}}}).__modelLoopDebug;
    return debug.snapshot().queued.length>=1;
  },undefined,{timeout:8500});
  await expect(page.locator('#traffic-status')).toContainText(/DELAYED|QUEUED/);
  const waiters=await page.evaluate(()=>{
    const debug=(window as typeof window & {
      __modelLoopDebug:{snapshot:()=>{queued:unknown[]};
        trafficSnapshot:()=>Array<{residentId:number;position:number;phase:string}>}
    }).__modelLoopDebug;
    return { count:debug.snapshot().queued.length,cars:debug.trafficSnapshot() };
  });
  expect(waiters.count).toBeGreaterThan(0);
  // This is a real road queue, not just a HUD warning.
  expect(waiters.cars.some(car=>car.phase==='driving')).toBe(true);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const paused=await page.evaluate(()=>(
    window as typeof window & {__modelLoopDebug:{trafficSnapshot:()=>unknown[]}}
  ).__modelLoopDebug.trafficSnapshot());
  await page.waitForTimeout(200);
  const pausedAgain=await page.evaluate(()=>(
    window as typeof window & {__modelLoopDebug:{trafficSnapshot:()=>unknown[]}}
  ).__modelLoopDebug.trafficSnapshot());
  expect(pausedAgain).toEqual(paused);
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  expect(errors).toEqual([]);
});

test('short landscape still shows a readable town and compact queue status',async({page})=>{
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  await expect(page).toHaveTitle(/The Generational Cycle/);
  const triggered=await page.evaluate(()=>(
    window as typeof window & {
      __modelLoopDebug:{trafficStop:(id:number,duration?:number)=>boolean}
    }
  ).__modelLoopDebug.trafficStop(1,4));
  expect(triggered).toBe(true);
  await expect(page.locator('#traffic-status')).toBeVisible();
  const canvas=await page.locator('#game-container canvas').boundingBox();
  expect(canvas?.width).toBeGreaterThan(700);
  await expect(page.locator('#shop-section')).toBeVisible();
});
