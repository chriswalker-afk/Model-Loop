import { test, expect } from '@playwright/test';
import { GameStore } from '../src/game/state';
import { BOARD, ROAD_CELLS, type Cell } from '../src/game/config';
import {
  ActivityEngine, ACTIVITY_DEFINITIONS, ACTIVITY_SELECTION_CHANCE,
  ACTIVITY_HISTORY_LIMIT, MAX_ACTIVE_ACTIVITIES, activityDefinition
} from '../src/game/activities';
import { HOUSEHOLD_ACTIONS, HOUSEHOLD_ACTIVITY_ACTIONS } from '../src/game/behaviors';

const road: Cell = { x: 4, y: 3 };
const make = (seed = 625) => {
  const store = new GameStore();
  store.newRun(seed);
  return store;
};
const same = (a:Cell,b:Cell) => a.x===b.x && a.y===b.y;

test('eight activities belong to real families; only meals and deliveries can cause litter',()=>{
  expect(ACTIVITY_DEFINITIONS).toHaveLength(8);
  expect(HOUSEHOLD_ACTIVITY_ACTIONS).toHaveLength(8);
  expect(new Set(ACTIVITY_DEFINITIONS.map(x=>x.kind)).size).toBe(8);
  expect(new Set(ACTIVITY_DEFINITIONS.map(x=>x.residentId)).size).toBe(6);
  const litterKinds=ACTIVITY_DEFINITIONS.filter(x=>x.litterChance>0).map(x=>x.kind);
  expect(litterKinds).toEqual(['delivery','working-lunch','picnic','gathering']);
  expect(ACTIVITY_SELECTION_CHANCE).toBeGreaterThan(.25);
  expect(ACTIVITY_SELECTION_CHANCE).toBeLessThan(.55);
  for(const activity of ACTIVITY_DEFINITIONS){
    expect(activity.started.length).toBeGreaterThan(30);
    expect(activity.finished.length).toBeGreaterThan(30);
    expect(activity.duration).toBeGreaterThanOrEqual(7);
    expect(activity.duration).toBeLessThan(16);
    expect(HOUSEHOLD_ACTIVITY_ACTIONS.find(x=>x.activityKind===activity.kind))
      .toMatchObject({mechanic:'activity',tone:activity.tone});
  }
  expect(HOUSEHOLD_ACTIONS).toHaveLength(6);
});

test('picnics prefer real benches while preserving the occupied model square',()=>{
  const engine = new ActivityEngine(10);
  const bench={x:4,y:4,id:'bench' as const};
  const activity=engine.start('picnic',3,road,0,[bench],[bench]);
  expect(activity).not.toBeNull();
  expect(activity!.cell).not.toEqual({x:4,y:4});
  expect(activity!.cell.x===4 && activity!.cell.y===2).toBe(true);
  expect(engine.isOccupied(activity!.cell)).toBe(true);
  expect(engine.start('picnic',3,road,1,[bench],[bench])).toBeNull();
  expect(engine.start('working-lunch',2,road,1,
    [{x:3,y:3},{x:4,y:2},{x:4,y:4},{x:5,y:3}],[])).toBeNull();
  expect(engine.start('picnic',2,road,0,[],[])).toBeNull();
});

test('a staged activity visibly progresses through setup, enjoyment and packing',()=>{
  const engine = new ActivityEngine(11);
  const activity=engine.start('picnic',3,road,0,[],[])!;
  expect(activity.phase).toBe('setting-up');
  expect(engine.tick(3).changed).toBe(true);
  expect(activity.phase).toBe('underway');
  expect(engine.tick(11).changed).toBe(true);
  expect(activity.phase).toBe('packing-up');
  engine.rng.next=()=>1;
  const finished=engine.tick(13.01);
  expect(finished.completed).toHaveLength(1);
  expect(finished.completed[0].leavesLitter).toBe(false);
  expect(engine.active).toHaveLength(0);
  expect(engine.isOccupied(activity.cell)).toBe(false);
  engine.recordCompletion(activity,13.01,'clean','The picnic has ended.');
  expect(engine.history[0]).toMatchObject({stage:'finished',outcome:'clean'});
  expect(engine.history.length).toBeLessThanOrEqual(ACTIVITY_HISTORY_LIMIT);
});

test('only three independent, spatially separate activities may coexist',()=>{
  const engine=new ActivityEngine(17);
  expect(engine.start('explore',0,{x:5,y:2},0,[],[])).toBeTruthy();
  expect(engine.start('sketch',1,{x:9,y:3},0,[],[])).toBeTruthy();
  expect(engine.start('delivery',2,{x:17,y:2},0,[],[])).toBeTruthy();
  expect(engine.active).toHaveLength(MAX_ACTIVE_ACTIVITIES);
  expect(engine.start('picnic',3,{x:20,y:6},0,[],[])).toBeNull();
  for(let i=0;i<engine.active.length;i++){
    for(let j=i+1;j<engine.active.length;j++){
      const a=engine.active[i].cell,b=engine.active[j].cell;
      expect(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)).toBeGreaterThanOrEqual(2);
    }
  }
});

test('Marsh picnic produces local community comfort while it is underway',()=>{
  const store=make();
  const beautyBefore=store.tileInfo(road)!.beauty;
  const irritationBefore=store.residents[3].irritation;
  expect(store.debugActivity('picnic',road)).toBe(true);
  const activity=store.activities.forResident(3)!;
  expect(store.canPlace(activity.cell)).toBe(false);
  expect(store.activities.modifiersAt(road).irritation).toBeLessThan(0);
  expect(store.tileInfo(road)!.beauty).toBeGreaterThan(beautyBefore);
  store.passTile(3,road);
  expect(store.residents[3].irritation).toBeLessThan(irritationBefore+0.5);
  store.activities.rng.next=()=>1;
  store.tickEconomy(activityDefinition('picnic').duration+.01);
  expect(store.activities.active).toHaveLength(0);
  expect(store.environment.effects.some(x=>x.kind==='tidied')).toBe(true);
  expect(store.environment.effects.some(x=>x.kind==='litter')).toBe(false);
});

test('picnic scraps are produced after packing and intercepted by nearby bins',()=>{
  const store=make();
  const bin={x:4,y:4};
  expect(store.place(bin,'bin')).toBe(true);
  expect(store.debugActivity('picnic',road)).toBe(true);
  expect(store.getBinStatus(bin)!.fill).toBe(0);
  expect(store.environment.effects.some(x=>x.kind==='litter')).toBe(false);
  store.activities.rng.next=()=>0; // picnic ends with one wrapper
  store.environment.rng.next=()=>0; // full-care bin catches wrapper
  store.tickEconomy(13.1);
  expect(store.getBinStatus(bin)!.fill).toBe(1);
  expect(store.environment.effects.some(x=>x.kind==='litter')).toBe(false);
  expect(store.activities.history[0]).toMatchObject({
    kind:'picnic',stage:'finished',outcome:'captured'
  });
  expect(store.activities.history[0].message).toContain('bin');
});

test('without a bin, picnic litter really appears at the picnic and can be cleaned',()=>{
  const store=make();
  expect(store.debugActivity('picnic',road)).toBe(true);
  const site={...store.activities.active[0].cell};
  store.activities.rng.next=()=>0;
  store.tickEconomy(13.1);
  const wrapper=store.environment.effects.find(x=>x.kind==='litter');
  expect(wrapper).toBeTruthy();
  expect(same(wrapper!.cell,site)).toBe(true);
  expect(store.activities.history[0].outcome).toBe('litter');
  expect(store.canPlace(site)).toBe(false);
  const before=store.money;
  expect(store.cleanLitter(site)).toBe(true);
  expect(store.money).toBeLessThan(before);
  expect(store.environment.effects.some(x=>x.kind==='litter')).toBe(false);
});

test('Miller lunches and deliveries have different litter rates; sketching never generates scraps',()=>{
  expect(activityDefinition('working-lunch').litterChance)
    .toBeGreaterThan(activityDefinition('delivery').litterChance);
  const store=make();
  expect(store.debugActivity('working-lunch',road)).toBe(true);
  store.activities.rng.next=()=>0;
  store.tickEconomy(8.1);
  expect(store.environment.effects.some(x=>x.kind==='litter')).toBe(true);
  const bells=make(22);
  expect(bells.debugActivity('sketch',road)).toBe(true);
  bells.activities.rng.next=()=>0;
  bells.tickEconomy(11.1);
  expect(bells.environment.effects.some(x=>x.kind==='litter')).toBe(false);
  expect(bells.environment.effects.some(x=>x.kind==='sketch')).toBe(true);
});

test('an activity is one household decision, not a hidden second behaviour opportunity',()=>{
  const store=make(700);
  store.residents[3].nextEventOffset=0;
  store.behaviour.choose=()=>HOUSEHOLD_ACTIVITY_ACTIONS.find(x=>x.id==='picnic')!;
  store.passTile(3,road);
  expect(store.activities.active).toHaveLength(1);
  expect(store.behaviourHistory).toHaveLength(1);
  expect(store.behaviourHistory[0].action).toBe('picnic');
  expect(store.ledger.helpfulActions+store.ledger.troublesomeActions).toBe(1);
  const next=ROAD_CELLS.find(cell=>cell.x===5&&cell.y===3)!;
  store.passTile(3,next);
  expect(store.behaviourHistory).toHaveLength(1);
  store.activities.rng.next=()=>0;
  store.tickEconomy(13.1);
  expect(store.behaviourHistory).toHaveLength(1);
  expect(store.activities.history[0].stage).toBe('finished');
});

test('paused clocks, reset and seeded replays preserve the activity lifecycle',()=>{
  const run=()=>{
    const store=make(933);
    expect(store.debugActivity('picnic',road)).toBe(true);
    store.togglePause();
    store.tickEconomy(20);
    expect(store.activities.active).toHaveLength(1);
    expect(store.elapsedSeconds).toBe(0);
    store.togglePause();
    store.tickEconomy(13.1);
    const result=store.activities.history.map(x=>({
      kind:x.kind,stage:x.stage,outcome:x.outcome,cell:x.cell,message:x.message
    }));
    store.newRun(933);
    expect(store.activities.active).toHaveLength(0);
    expect(store.activities.history).toHaveLength(0);
    return result;
  };
  expect(run()).toEqual(run());
});

test('browser makes staged activities inspectable without adding a permanent HUD',async({page})=>{
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  const started=await page.evaluate(() => (
    window as typeof window & {__modelLoopDebug:{
      activity:(kind:string,x:number,y:number)=>boolean
    }}).__modelLoopDebug.activity('picnic',4,3));
  expect(started).toBe(true);
  const site=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.activities.active[0].cell;
  });
  await page.evaluate(async(cell)=>{
    const {store}=await import('/src/game/state.ts');
    store.selectTile(cell);
  },site);
  await expect(page.locator('#tile-panel')).toContainText('A Sunday picnic');
  await page.locator('[data-resident="3"]').first().click();
  await expect(page.locator('#household-detail')).toContainText('RIGHT NOW');
  await expect(page.locator('#household-detail')).toContainText('A Sunday picnic');
  await page.waitForTimeout(250);
  const activityInSnapshot=await page.evaluate(()=>(
    window as typeof window & {__modelLoopDebug:{
      snapshot:()=>{activities:Array<{kind:string;phase:string}>}
    }}).__modelLoopDebug.snapshot().activities);
  expect(activityInSnapshot[0]?.kind).toBe('picnic');
});
