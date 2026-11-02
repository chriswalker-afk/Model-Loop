import { test, expect } from '@playwright/test';
import {
  BOARD, HOMES, ROAD_CELLS, adjacentToRoad, isOnBoard, isRoad, isScenery,
  type Cell
} from '../src/game/config';
import { GameStore } from '../src/game/state';
import {
  ACCIDENT_GLOBAL_COOLDOWN, ACCIDENT_DRIVER_COOLDOWN,
  ACCIDENT_SCENE_SECONDS, MAX_ACTIVE_ROADSIDE_INCIDENTS,
  RoadsideAccidentEngine, leftVergeContact, roadsideImpactChance
} from '../src/game/damage';
import {
  modelCondition, modelConditionFactor, modelConditionName, modelRepairCost,
  modelEffects
} from '../src/game/economy';

const candidates: Array<{road:Cell;model:Cell}> = [];
for(const road of ROAD_CELLS){
  for(const model of [
    {x:road.x-1,y:road.y},{x:road.x+1,y:road.y},
    {x:road.x,y:road.y-1},{x:road.x,y:road.y+1}
  ]){
    if(!isOnBoard(model.x,model.y)||isRoad(model.x,model.y)||
      isScenery(model.x,model.y)||
      HOMES.some(home=>home.x===model.x&&home.y===model.y)||
      !adjacentToRoad(model.x,model.y))continue;
    if(leftVergeContact(road,model))candidates.push({road,model});
  }
}
const site=candidates[0]!;
const make=(seed=601)=>{
  const store=new GameStore();
  store.newRun(seed);
  return store;
};

test('an incident needs a real purchased model immediately on the driving-side verge',()=>{
  expect(candidates.length).toBeGreaterThan(5);
  expect(site).toBeTruthy();
  expect(leftVergeContact(site.road,site.model)).toBe(true);
  expect(leftVergeContact(site.road,site.road)).toBe(false);
  expect(leftVergeContact(site.road,{x:site.model.x+5,y:site.model.y})).toBe(false);
  const engine=new RoadsideAccidentEngine(71);
  expect(engine.force(0,site.road,
    {...site.model,id:'lamp',condition:'intact'},0)).toBeTruthy();
  expect(engine.history[0]).toMatchObject({residentId:0,model:site.model,
    road:site.road,after:'damaged'});
  expect(engine.force(1,site.road,
    {...site.model,id:'lamp',condition:'damaged'},0)).toBeNull();
  expect(engine.active.length).toBeLessThanOrEqual(MAX_ACTIVE_ROADSIDE_INCIDENTS);
  engine.tick(ACCIDENT_SCENE_SECONDS+.1);
  expect(engine.active).toHaveLength(0);
  // A previously damaged model can actually be broken by a second impact.
  const broken=engine.force(0,site.road,
    {...site.model,id:'lamp',condition:'damaged'},50);
  expect(broken?.after).toBe('broken');
});

test('speed, bends, driver personality and protections change grounded accident risk',()=>{
  const corner={speed:103,bend:true,obscured:true,protected:false};
  const cautious={speed:65,bend:true,obscured:false,protected:true};
  expect(roadsideImpactChance(0,corner)).toBeGreaterThan(roadsideImpactChance(5,corner));
  expect(roadsideImpactChance(0,corner)).toBeGreaterThan(
    roadsideImpactChance(0,{...corner,bend:false}));
  expect(roadsideImpactChance(0,{...corner,protected:true})).toBeLessThan(
    roadsideImpactChance(0,corner));
  expect(roadsideImpactChance(5,cautious)).toBeLessThan(
    roadsideImpactChance(0,corner));
  expect(roadsideImpactChance(0,{...corner,speed:0})).toBe(0);
  expect(roadsideImpactChance(0,corner)).toBeLessThanOrEqual(.012);
});

test('normal driving can hit a real left-side miniature, but overtaking never does',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  const original=store.money;
  let draws=0;
  store.accidents.rng.next=()=>++draws===1?0:.5; // force an impact, not a severe break
  expect(store.considerRoadsideAccident(0,site.road,110,'passing')).toBeNull();
  expect(store.considerRoadsideAccident(0,site.road,110,'left',true)).toBeNull();
  expect(store.considerRoadsideAccident(0,site.road,0,'left')).toBeNull();
  expect(store.considerRoadsideAccident(0,site.road,110,'left')?.after).toBe('damaged');
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  expect(store.money).toBe(original); // no arbitrary crash fine or reward
  expect(store.accidents.latest?.model).toEqual(site.model);
  expect(store.accidents.active).toHaveLength(1);
  expect(store.safety).toBeLessThan(100);
  // A second chance cannot immediately damage the same model again.
  expect(store.considerRoadsideAccident(1,site.road,105,'left')).toBeNull();
});

test('damage halves useful model effects, broken models have none and upkeep stops',()=>{
  const intact=modelEffects('limit','full','intact');
  const damaged=modelEffects('limit','full','damaged');
  const broken=modelEffects('limit','full','broken');
  expect(damaged.speedMultiplier).toBeGreaterThan(intact.speedMultiplier);
  expect(damaged.speedMultiplier).toBeLessThan(1);
  expect(broken.speedMultiplier).toBe(1);
  expect(modelConditionFactor('damaged')).toBe(.5);
  expect(modelConditionFactor('broken')).toBe(0);
  expect(modelCondition(undefined)).toBe('intact');
  expect(modelConditionName('broken')).toBe('Broken');
  expect(broken.upkeep).toBe(0);
  expect(broken.beauty).toBe(0);
  expect(broken.noise).toBe(0);
  expect(broken.crime).toBe(0);
  const store=make();
  expect(store.place(site.model,'limit')).toBe(true);
  const before=store.tileInfo(site.road)!.noise;
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  expect(store.getPlacedModel(site.model)?.condition).toBe('broken');
  expect(store.speedMultiplierAt(site.road)).toBe(.58); // scene slows traffic
  store.tickEconomy(ACCIDENT_SCENE_SECONDS+1);
  expect(store.speedMultiplierAt(site.road)).toBe(1); // broken sign is useless
  expect(store.tileInfo(site.road)!.noise).toBeGreaterThan(before);
  expect(store.cashflow.nextUpkeep).toBe(0);
});

test('repairs cost actual coins, never award progress or lap rewards',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  const cost=modelRepairCost('lamp','broken');
  const moneyBefore=store.money,progressBefore=store.progress;
  const earned=store.ledger.coinsEarned;
  const paid=store.ledger.carePaid;
  expect(cost).toBeGreaterThan(modelRepairCost('lamp','damaged'));
  expect(store.repairModel(site.model)).toBe(true);
  expect(store.getPlacedModel(site.model)?.condition).toBe('intact');
  expect(store.money).toBe(moneyBefore-cost);
  expect(store.ledger.carePaid).toBe(paid+cost);
  expect(store.progress).toBe(progressBefore);
  expect(store.ledger.coinsEarned).toBe(earned);
  expect(store.repairModel(site.model)).toBe(false); // no second repair bill
});

test('repairs fail safely without funds and remain locked while paused',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'damage')).toBe(true);
  store.money=0;
  expect(store.repairModel(site.model)).toBe(false);
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  store.money=100;
  store.togglePause();
  expect(store.repairModel(site.model)).toBe(false);
  store.tickEconomy(50);
  expect(store.accidents.active).toHaveLength(1);
  store.togglePause();
  expect(store.repairModel(site.model)).toBe(true);
});

test('the Hales restore actual purchased damage, one condition step at a time',()=>{
  const store=make();
  expect(store.place(site.model,'bench')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  const beforeMoney=store.money;
  expect(store.debugHouseholdAction(4,'restore',site.road)).toBe(true);
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  expect(store.money).toBe(beforeMoney);
  expect(store.behaviourHistory[0].message).toContain('Park Bench');
  expect(store.debugHouseholdAction(4,'restore',site.road)).toBe(true);
  expect(store.getPlacedModel(site.model)?.condition).toBe('intact');
  expect(store.money).toBe(beforeMoney);
  // No damage nearby: old, plausible heritage action still works.
  expect(store.debugHouseholdAction(4,'restore',site.road)).toBe(true);
  expect(store.environment.effects.some(effect=>effect.kind==='heritage')).toBe(true);
});

test('Wards shorten the actual accident-zone duration, never repair its model',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model)).toBe(true);
  const end=store.accidents.active[0].endsAt;
  expect(store.debugHouseholdAction(5,'guide',site.road)).toBe(true);
  expect(store.accidents.active[0].wardHelped).toBe(true);
  expect(store.accidents.active[0].endsAt).toBeLessThan(end);
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  expect(store.behaviourHistory[0].message).toContain('cleared sooner');
  expect(store.accidents.wardAssistance(site.road,store.elapsedSeconds)).toBeNull();
});

test('a broken bin no longer collects litter and recovers when repaired',()=>{
  const store=make();
  expect(store.place(site.model,'bin')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  expect(store.getBinStatus(site.model)?.reliability).toBe(0);
  const captured=store.ledger.litterCaught;
  expect(store.debugEnvironmentEvent('litter',2,site.road)).toBe(true);
  expect(store.ledger.litterCaught).toBe(captured);
  expect(store.repairModel(site.model)).toBe(true);
  expect(store.getBinStatus(site.model)?.reliability).toBeGreaterThan(0);
});

test('Hales heritage visit completes a genuine partial repair instead of a ghost plaque',()=>{
  const store=make(955);
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  expect(store.debugActivity('heritage-visit',site.road)).toBe(true);
  const before=store.money;
  store.tickEconomy(10.1);
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  expect(store.money).toBe(before);
  expect(store.activities.history[0]).toMatchObject({
    kind:'heritage-visit',stage:'finished',outcome:'clean'
  });
  expect(store.activities.history[0].message).toContain('Gas Lamppost');
  expect(store.environment.effects.some(x=>x.kind==='heritage')).toBe(false);
});

test('Ward safety visit genuinely reduces the active accident scene',()=>{
  const store=make(973);
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  const initial=store.accidents.active[0].endsAt;
  expect(store.debugActivity('safety-round',site.road)).toBe(true);
  store.tickEconomy(8.1);
  expect(store.accidents.active[0].wardHelped).toBe(true);
  expect(store.accidents.active[0].endsAt).toBeLessThan(initial);
  expect(store.getPlacedModel(site.model)?.condition).toBe('broken');
  expect(store.activities.history[0].message).toContain('safer sooner');
});

test('cooldown and bounded site history prevent a flood of collisions',()=>{
  expect(ACCIDENT_GLOBAL_COOLDOWN).toBeGreaterThan(20);
  expect(ACCIDENT_DRIVER_COOLDOWN).toBeGreaterThan(60);
  const engine=new RoadsideAccidentEngine(819);
  engine.rng.next=()=>0;
  const model={...site.model,id:'lamp' as const,condition:'intact' as const};
  expect(engine.consider(0,site.road,[model],0,{
    speed:110,bend:true,obscured:true,protected:false
  })).toBeTruthy();
  engine.tick(17);
  expect(engine.consider(0,site.road,[model],20,{
    speed:110,bend:true,obscured:true,protected:false
  })).toBeNull();
  expect(engine.history).toHaveLength(1);
  engine.clearActive();
  expect(engine.active).toHaveLength(0);
});

test('browser shows real damage, paid repair and updates the miniature',async({page})=>{
  await page.goto('/');
  const {road,model}=site;
  const placed=await page.evaluate(async({model})=>{
    const {store}=await import('/src/game/state.ts');
    return store.place(model,'lamp');
  },{model});
  expect(placed).toBe(true);
  const impact=await page.evaluate(({road,model})=>(
    window as typeof window & {__modelLoopDebug:{
      impact:(id:number,rx:number,ry:number,mx:number,my:number,kind:string)=>boolean
    }}).__modelLoopDebug.impact(0,road.x,road.y,model.x,model.y,'break'),
    {road,model});
  expect(impact).toBe(true);
  await page.evaluate(async({model})=>{
    const {store}=await import('/src/game/state.ts');
    store.selectTile(model);
  },{model});
  await expect(page.locator('#tile-panel')).toContainText('Condition · Broken');
  await expect(page.locator('#tile-panel')).toContainText('Benefits and regular upkeep');
  await expect(page.locator('#tile-panel [data-action="repair-model"]')).toBeVisible();
  const cost=modelRepairCost('lamp','broken');
  await expect(page.locator('#tile-panel [data-action="repair-model"]'))
    .toContainText(String(cost)+' coins');
  await page.locator('#tile-panel [data-action="repair-model"]').click();
  await expect(page.locator('#tile-panel')).toContainText('Condition · Intact');
  const conditions=await page.evaluate(()=>(
    window as typeof window & {__modelLoopDebug:{
      snapshot:()=>{modelConditions:Array<{condition:string}>}
    }}).__modelLoopDebug.snapshot().modelConditions);
  expect(conditions[0].condition).toBe('intact');
});
