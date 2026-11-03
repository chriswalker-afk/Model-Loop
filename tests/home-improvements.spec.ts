import {test,expect} from '@playwright/test';
import {GameStore} from '../src/game/state';
import {HOMES,type Cell} from '../src/game/config';
import {neighbourhoodSummary,MAX_NEIGHBOUR_EFFECT_PER_LAP} from '../src/game/founding';
import {
  HOME_IMPROVEMENT_CATALOG,homeGroundsAt,homeGroundsEffects,
  homeImprovementAt,homeImprovementDefinition,homeImprovementUpkeep,
  homeNearBend,isHomeImprovementKind,influencedNeighbourEffect
} from '../src/game/homeImprovements';
import {UPKEEP_INTERVAL_SECONDS} from '../src/game/economy';

const plots:Cell[]=[
  {x:7,y:1},{x:14,y:1},{x:21,y:5},
  {x:14,y:11},{x:1,y:7},{x:9,y:1}
];
function foundGame():GameStore {
  const game=new GameStore();
  game.newRun(1808);
  for(const home of HOMES){
    game.chooseFoundingFamily(home.id);
    game.acknowledgeFoundingIntroduction();
    expect(game.placeFoundingHome(plots[home.id])).toBe(true);
  }
  expect(game.beginVintageYears()).toBe(true);
  return game;
}

test('catalogue has exactly one boundary or garden slot per household and no pair IDs',()=>{
  expect(HOME_IMPROVEMENT_CATALOG.map(x=>x.kind))
    .toEqual(['picket','stone','hedge','gate','front','flowers','kitchen','patio']);
  expect(HOME_IMPROVEMENT_CATALOG.filter(x=>x.slot==='boundary')).toHaveLength(4);
  expect(HOME_IMPROVEMENT_CATALOG.filter(x=>x.slot==='garden')).toHaveLength(4);
  expect(new Set(HOME_IMPROVEMENT_CATALOG.map(x=>x.kind)).size).toBe(8);
  for(const item of HOME_IMPROVEMENT_CATALOG){
    expect(item.cost).toBeGreaterThan(0);
    expect(item.upkeep).toBeGreaterThan(0);
    expect(item.tensionFactor).toBeGreaterThan(0);
    expect(item.friendshipFactor).toBeGreaterThan(0);
    expect(item.description.length).toBeGreaterThan(35);
    expect(isHomeImprovementKind(item.kind)).toBe(true);
    expect(homeImprovementDefinition(item.kind)).toEqual(item);
  }
  expect(isHomeImprovementKind('invalid')).toBe(false);
});

test('owner boundaries mitigate incoming tensions; neighbour-owned boundaries partially help too',()=>{
  const Finch={id:0,x:7,y:1},Ward={id:5,x:9,y:1};
  const base=neighbourhoodSummary(0,[Finch,Ward]);
  expect(base.irritationPerLap).toBe(1.8);
  const picket=[{residentId:0,slot:'boundary' as const,
    kind:'picket' as const,nextBillAt:20}];
  expect(neighbourhoodSummary(0,[Finch,Ward],picket).irritationPerLap).toBe(.99);
  expect(neighbourhoodSummary(5,[Finch,Ward],picket).irritationPerLap).toBe(1.56);
  const walls=[{residentId:5,slot:'boundary' as const,
    kind:'stone' as const,nextBillAt:20}];
  expect(neighbourhoodSummary(5,[Finch,Ward],walls).irritationPerLap).toBe(.63);
  expect(neighbourhoodSummary(0,[Finch,Ward],walls).irritationPerLap).toBe(1.45);
  const both=[...picket,...walls];
  expect(neighbourhoodSummary(0,[Finch,Ward],both).irritationPerLap).toBe(.80);
  expect(neighbourhoodSummary(5,[Finch,Ward],both).irritationPerLap).toBe(.54);
  expect(neighbourhoodSummary(0,[Finch]).irritationPerLap).toBe(0);
  expect(neighbourhoodSummary(0,[Finch,{...Ward,x:20,y:1}],both)
    .irritationPerLap).toBe(0);
});

test('gates strengthen friendly encounters; gardens add personal comfort exactly once',()=>{
  const Bell={id:1,x:7,y:1},Hale={id:4,x:9,y:1};
  expect(neighbourhoodSummary(1,[Bell,Hale]).irritationPerLap).toBe(-1.5);
  const gate=[{residentId:1,slot:'boundary' as const,
    kind:'gate' as const,nextBillAt:20}];
  expect(neighbourhoodSummary(1,[Bell,Hale],gate).irritationPerLap).toBe(-2.03);
  expect(neighbourhoodSummary(4,[Bell,Hale],gate).irritationPerLap).toBe(-1.66);
  const garden=[{residentId:1,slot:'garden' as const,
    kind:'front' as const,nextBillAt:20}];
  const owner=neighbourhoodSummary(1,[Bell,Hale],garden);
  expect(owner.selfComfortPerLap).toBe(-.22);
  expect(owner.irritationPerLap).toBe(-1.72);
  expect(neighbourhoodSummary(4,[Bell,Hale],garden).irritationPerLap).toBe(-1.5);
  expect(neighbourhoodSummary(1,[Bell],garden).irritationPerLap).toBe(-.22);
  const patio=[{residentId:1,slot:'garden' as const,
    kind:'patio' as const,nextBillAt:20}];
  expect(neighbourhoodSummary(1,[Bell,Hale],patio).irritationPerLap).toBe(-1.86);
  expect(neighbourhoodSummary(1,[Bell,Hale],patio).selfComfortPerLap).toBe(-.18);
});

test('sightline effects are grounded in real bends, not fabricated crash protection',()=>{
  const Wards={id:5,x:9,y:1},Finch={id:0,x:7,y:1};
  expect(homeNearBend(Wards)).toBe(true);
  const hedge=[{residentId:5,slot:'boundary' as const,
    kind:'hedge' as const,nextBillAt:20}];
  expect(neighbourhoodSummary(5,[Finch,Wards],hedge).selfComfortPerLap).toBe(.28);
  expect(neighbourhoodSummary(5,[Finch,Wards],hedge).irritationPerLap)
    .toBe(1.32);
});

test('garden property effects appear in tile information without occupying any square',()=>{
  const game=foundGame();
  const home=game.homeFor(0)!;
  const free={x:8,y:1};
  expect(game.canPlace(free)).toBe(true);
  const before=game.tileInfo(home)!;
  const neighbourBefore=game.tileInfo(free)!;
  expect(game.installHomeImprovement(0,'front')).toBe(true);
  const after=game.tileInfo(home)!;
  const neighbourAfter=game.tileInfo(free)!;
  expect(after.beauty-before.beauty).toBe(2);
  expect(after.noise-before.noise).toBe(-1);
  expect(neighbourAfter.beauty-neighbourBefore.beauty).toBe(2);
  expect(game.canPlace(free)).toBe(true);
  expect(game.placements).toHaveLength(0);
  expect(game.gardenDetails.some(d=>d.residentId===0)).toBe(true);
  const items=game.homeImprovements;
  expect(homeGroundsEffects(0,items).comfortPerLap).toBe(-.22);
  expect(homeGroundsAt({x:20,y:12},game.placedHomes,items).beauty).toBe(0);
});

test('preview and real installation share capped forecasts, one slot and full replacement costs',()=>{
  const game=foundGame();
  const before=game.money;
  const report=game.previewHomeImprovement(0,'picket');
  expect(report.allowed).toBe(true);
  expect(report.slot).toBe('boundary');
  expect(report.upkeepBefore).toBe(0);
  expect(report.upkeepAfter).toBe(1);
  expect(report.affected).toEqual(expect.arrayContaining([
    expect.objectContaining({residentId:0,previousPerLap:1.8,
      predictedPerLap:.99,changePerLap:-.81}),
    expect.objectContaining({residentId:5,previousPerLap:1.8,
      predictedPerLap:1.56,changePerLap:-.24})
  ]));
  expect(game.money).toBe(before);
  expect(game.installHomeImprovement(0,'picket')).toBe(true);
  expect(game.money).toBe(before-24);
  expect(game.neighbourhoodFor(0).irritationPerLap).toBe(.99);
  expect(game.homeImprovements).toHaveLength(1);
  expect(game.installHomeImprovement(0,'picket')).toBe(false);
  expect(game.previewHomeImprovement(0,'picket').allowed).toBe(false);
  expect(game.installHomeImprovement(0,'front')).toBe(true);
  expect(game.homeImprovements).toHaveLength(2);
  expect(game.homeUpkeepFor(0)).toBe(3);
  expect(game.getHomeImprovement(0,'boundary')?.kind).toBe('picket');
  expect(game.getHomeImprovement(0,'garden')?.kind).toBe('front');
  const replacement=game.previewHomeImprovement(0,'stone');
  expect(replacement.cost).toBe(38);
  expect(replacement.upkeepAfter).toBe(4);
  expect(game.installHomeImprovement(0,'stone')).toBe(true);
  expect(game.homeImprovements).toHaveLength(2);
  expect(game.getHomeImprovement(0,'boundary')?.kind).toBe('stone');
  expect(game.ledger.miniaturePurchases).toBe(24+28+38);
  expect(game.money).toBe(before-24-28-38);
  expect(homeImprovementAt(0,'garden',game.homeImprovements)?.kind).toBe('front');
  expect(homeImprovementUpkeep(0,game.homeImprovements)).toBe(4);
  expect(game.removeHomeImprovement(0,'boundary')).toBe(true);
  expect(game.homeImprovements).toHaveLength(1);
  expect(game.money).toBe(before-24-28-38); // No refunds.
});

test('upkeep is charged on the same real 20-second service cycle and cashflow ledger',()=>{
  const game=foundGame();
  const start=game.money;
  expect(game.installHomeImprovement(0,'picket')).toBe(true);
  expect(game.installHomeImprovement(0,'flowers')).toBe(true);
  expect(game.cashflow.nextUpkeep).toBe(2);
  expect(game.cashflow.maintainedModels).toBe(2);
  expect(game.cashflow.upkeep).toBe(0);
  game.tickEconomy(UPKEEP_INTERVAL_SECONDS-.1);
  expect(game.ledger.carePaid).toBe(0);
  game.tickEconomy(.2);
  expect(game.ledger.carePaid).toBe(2);
  expect(game.cashflow.upkeep).toBe(2);
  expect(game.money).toBe(start-24-20-2);
  game.tickEconomy(40);
  expect(game.ledger.carePaid).toBe(6);
  expect(game.money).toBe(start-24-20-6);
  expect(game.cashflow.net).toBe(-game.cashflow.upkeep);
  const before=game.elapsedSeconds;
  const owed=game.ledger.carePaid;
  game.togglePause();
  game.tickEconomy(50);
  expect(game.elapsedSeconds).toBe(before);
  expect(game.ledger.carePaid).toBe(owed);
  game.togglePause();
  game.workshopOpen=true;
  game.tickEconomy(50);
  expect(game.ledger.carePaid).toBe(owed);
});

test('replacement renews billing timing, removal cancels future upkeep',()=>{
  const game=foundGame();
  game.tickEconomy(10);
  expect(game.installHomeImprovement(0,'picket')).toBe(true);
  game.tickEconomy(15); // clock 25; picket due at 30
  expect(game.installHomeImprovement(0,'stone')).toBe(true); // due at 45
  game.tickEconomy(5.1);
  expect(game.ledger.carePaid).toBe(0);
  game.tickEconomy(15);
  expect(game.ledger.carePaid).toBe(2);
  expect(game.removeHomeImprovement(0,'boundary')).toBe(true);
  game.tickEconomy(60);
  expect(game.ledger.carePaid).toBe(2);
  expect(game.cashflow.nextUpkeep).toBe(0);
});

test('purchase guards, departure and new generations cannot create duplicate bills',()=>{
  const game=new GameStore();
  game.newRun(21);
  expect(game.installHomeImprovement(0,'front')).toBe(false);
  expect(game.homeImprovements).toHaveLength(0);
  for(const home of HOMES){
    game.chooseFoundingFamily(home.id);
    game.acknowledgeFoundingIntroduction();
    game.placeFoundingHome(plots[home.id]);
  }
  expect(game.beginVintageYears()).toBe(true);
  expect(game.installHomeImprovement(100,'picket')).toBe(false);
  expect(game.installHomeImprovement(0,'nonsense' as 'picket')).toBe(false);
  game.money=0;
  expect(game.installHomeImprovement(0,'picket')).toBe(false);
  game.money=145;
  game.togglePause();
  expect(game.installHomeImprovement(0,'picket')).toBe(false);
  game.togglePause();
  expect(game.installHomeImprovement(0,'picket')).toBe(true);
  game.tickEconomy(10);
  const paid=game.ledger.carePaid;
  game.residents[0].occupied=false;
  expect(game.homeUpkeepFor(0)).toBe(0);
  expect(game.cashflow.nextUpkeep).toBe(0);
  expect(game.neighbourhoodFor(5).irritationPerLap).toBe(0);
  game.tickEconomy(60);
  expect(game.ledger.carePaid).toBe(paid);
  expect(game.removeHomeImprovement(0,'boundary')).toBe(true);
  game.newRun();
  expect(game.homeImprovements).toHaveLength(0);
  expect(game.cashflow.nextUpkeep).toBe(0);
});

test('existing roadside benches, trees and speed signs still affect relationships',()=>{
  const bell={id:1,x:7,y:1},hale={id:4,x:9,y:1};
  expect(neighbourhoodSummary(1,[bell,hale],[],[{id:'bench',x:8,y:1}])
    .irritationPerLap).toBe(-1.8);
  const miller=[{id:1,x:7,y:1},{id:2,x:9,y:1}];
  expect(neighbourhoodSummary(1,miller,[],[{id:'tree',x:8,y:1}])
    .irritationPerLap).toBe(1.44);
  const finchWard=[{id:0,x:7,y:1},{id:5,x:9,y:1}];
  const signs=[{id:'limit' as const,x:8,y:1}];
  expect(neighbourhoodSummary(5,finchWard,[],signs).irritationPerLap).toBe(1.26);
  expect(influencedNeighbourEffect(5,0,finchWard[1],finchWard[0],1.8,[],signs)
    .reasons).toContain('Speed sign reassures the Wards');
});

test('proximity caps and property effects stay directional under dense layouts',()=>{
  const game=foundGame();
  expect(game.installHomeImprovement(0,'picket')).toBe(true);
  expect(game.installHomeImprovement(0,'front')).toBe(true);
  expect(game.installHomeImprovement(5,'stone')).toBe(true);
  for(const home of game.placedHomes){
    const result=game.neighbourhoodFor(home.id);
    expect(Math.abs(result.irritationPerLap)).toBeLessThanOrEqual(MAX_NEIGHBOUR_EFFECT_PER_LAP);
    expect(Number.isFinite(result.uncappedPerLap)).toBe(true);
  }
  expect(game.placements).toHaveLength(0);
});

test('retired pairwise shop no longer appears; house selection and normal models remain usable',
  async({page})=>{
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/?referenceTown=1');
    await expect(page.getByRole('button',{name:'Fences & gardens'})).toHaveCount(0);
    await expect(page.locator('#boundary-studio')).toHaveCount(0);
    await expect(page.locator('[data-boundary-pair]')).toHaveCount(0);
    await expect(page.locator('#shop')).toBeVisible();
    await expect(page.locator('#game-container canvas')).toBeVisible();
    await page.locator('[data-resident="0"]').first().click();
    await expect(page.locator('#household-detail')).toBeVisible();
    await expect(page.locator('.family-relations-total')).not.toHaveText('');
    const effects=await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      return {before:store.neighbourhoodFor(0).irritationPerLap,
        installed:store.installHomeImprovement(0,'picket'),
        after:store.neighbourhoodFor(0).irritationPerLap,
        recurring:store.cashflow.nextUpkeep,
        onlyHome:store.homeImprovements.length};
    });
    expect(effects.installed).toBe(true);
    expect(effects.onlyHome).toBe(1);
    expect(effects.recurring).toBe(1);
    expect(errors).toEqual([]);
  });
