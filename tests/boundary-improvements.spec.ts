import {test,expect} from '@playwright/test';
import {GameStore} from '../src/game/state';
import {
  BOUNDARY_MODELS,canShareBoundary,boundaryBetween,boundaryNearBend,
  influencedNeighbourEffect
} from '../src/game/boundaries';
import {neighbourhoodSummary} from '../src/game/founding';
import {HOMES,type Cell} from '../src/game/config';

const plots:Cell[]=[
  {x:7,y:1}, // Finches
  {x:14,y:1}, // Bells
  {x:21,y:5}, // Millers
  {x:14,y:11}, // Marshes
  {x:1,y:7}, // Hales
  {x:9,y:1}  // Wards
];
function foundGame():GameStore{
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

test('four distinct miniature kits with stable costs and no duplicate catalogue entries',()=>{
  expect(BOUNDARY_MODELS.map(x=>x.kind)).toEqual(['picket','stone','gate','hedge']);
  expect(new Set(BOUNDARY_MODELS.map(x=>x.kind)).size).toBe(4);
  for(const model of BOUNDARY_MODELS){
    expect(model.cost).toBeGreaterThan(0);
    expect(model.tensionFactor).toBeGreaterThan(0);
    expect(model.friendshipFactor).toBeGreaterThan(0);
  }
});

test('pair anchors are symmetrical and never cross road or another house',()=>{
  const a={id:0,x:7,y:1},b={id:5,x:9,y:1};
  const pair=[a,b];
  expect(canShareBoundary(a,b,pair)).toBe(true);
  expect(canShareBoundary(b,a,pair)).toBe(true);
  expect(boundaryBetween(a,b)).toEqual({x:8,y:1});
  const acrossRoad={id:5,x:7,y:3};
  expect(canShareBoundary(a,acrossRoad,[a,acrossRoad])).toBe(false);
  expect(canShareBoundary(a,b,[...pair,{id:1,x:8,y:1}])).toBe(false);
  expect(canShareBoundary(a,{id:5,x:15,y:1},[a])).toBe(false);
});

test('privacy reduces conflict, but can also reduce warmth; the gate rewards friendship',()=>{
  const Finch={id:0,x:7,y:1},Ward={id:5,x:9,y:1};
  const baseline=neighbourhoodSummary(0,[Finch,Ward]);
  expect(baseline.irritationPerLap).toBe(1.8);
  for(const [kind,expected] of [
    ['picket',.9],['stone',.54],['gate',1.89],['hedge',1.17]
  ] as const){
    const bound=[{a:0,b:5,kind}];
    expect(neighbourhoodSummary(0,[Finch,Ward],bound).irritationPerLap).toBe(expected);
  }
  expect(boundaryNearBend(Finch,Ward)).toBe(true);
  // Only the Wards become more worried by a hedge blocking this real bend.
  expect(neighbourhoodSummary(5,[Finch,Ward],
    [{a:0,b:5,kind:'hedge'}]).irritationPerLap).toBe(1.52);

  const Bell={id:1,x:7,y:1},Hale={id:4,x:9,y:1};
  expect(neighbourhoodSummary(1,[Bell,Hale]).irritationPerLap).toBe(-1.5);
  expect(neighbourhoodSummary(4,[Bell,Hale]).irritationPerLap).toBe(-1.5);
  expect(neighbourhoodSummary(1,[Bell,Hale],
    [{a:1,b:4,kind:'gate'}]).irritationPerLap).toBe(-2.1);
  expect(neighbourhoodSummary(1,[Bell,Hale],
    [{a:1,b:4,kind:'stone'}]).irritationPerLap).toBe(-.9);
});

test('improvements remain directional, are capped, and ignore distant or departed families',()=>{
  const Miller={id:2,x:7,y:1},Ward={id:5,x:9,y:1};
  expect(neighbourhoodSummary(2,[Miller,Ward],
    [{a:2,b:5,kind:'gate'}]).irritationPerLap).toBe(-2.1);
  expect(neighbourhoodSummary(5,[Miller,Ward],
    [{a:2,b:5,kind:'gate'}]).irritationPerLap).toBe(0);
  const Finch={id:0,x:7,y:1},Hale={id:4,x:7,y:3};
  expect(neighbourhoodSummary(0,[Finch,Ward,Hale]).irritationPerLap).toBe(2.5);
  expect(neighbourhoodSummary(0,[Finch]).irritationPerLap).toBe(0);
  expect(neighbourhoodSummary(0,[Finch,{id:5,x:19,y:1}]).irritationPerLap).toBe(0);
});

test('boundary installation and replacement cost real coins, but no tile or extra upkeep',()=>{
  const store=foundGame();
  const money=store.money;
  const safety=store.safety;
  const available=store.boundaryPairs.find(pair=>pair.a===0&&pair.b===5);
  expect(available?.anchor).toEqual({x:8,y:1});
  expect(store.canPlace({x:8,y:1})).toBe(true);
  const old=store.neighbourhoodFor(0).irritationPerLap;
  expect(old).toBe(1.8);
  const preview=store.previewBoundaryInstallation(0,5,'picket');
  expect(preview.allowed).toBe(true);
  expect(preview.affected).toEqual(expect.arrayContaining([
    expect.objectContaining({residentId:0,previousPerLap:1.8,predictedPerLap:.9,changePerLap:-.9}),
    expect.objectContaining({residentId:5,previousPerLap:1.8,predictedPerLap:.9,changePerLap:-.9})
  ]));
  expect(store.money).toBe(money);
  expect(store.installBoundary(0,5,'picket')).toBe(true);
  expect(store.money).toBe(money-24);
  expect(store.placements).toHaveLength(0);
  expect(store.canPlace({x:8,y:1})).toBe(true); // No land reserved.
  expect(store.safety).toBe(safety); // No fabricated accident protection.
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(.9);
  expect(store.previewBoundaryInstallation(0,5,'picket').allowed).toBe(false);
  expect(store.installBoundary(0,5,'picket')).toBe(false);
  expect(store.boundaryImprovements).toHaveLength(1);
  expect(store.installBoundary(0,5,'stone')).toBe(true);
  expect(store.money).toBe(money-24-38);
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(.54);
  expect(store.boundaryImprovements).toEqual([{a:0,b:5,kind:'stone'}]);
  store.togglePause();
  expect(store.installBoundary(0,5,'gate')).toBe(false);
  expect(store.removeBoundary(0,5)).toBe(false);
  store.togglePause();
  expect(store.removeBoundary(0,5)).toBe(true);
  expect(store.money).toBe(money-24-38);
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(1.8);
  expect(store.ledger.miniaturePurchases).toBe(62);
  store.newRun();
  expect(store.boundaryImprovements).toHaveLength(0);
  expect(store.boundaryPair).toBeNull();
});

test('existing benches, oak trees and speed signs add contextual effects in the SAME calculator',()=>{
  const bell={id:1,x:7,y:1},hale={id:4,x:9,y:1};
  expect(neighbourhoodSummary(1,[bell,hale],[],[{id:'bench',x:8,y:1}])
    .irritationPerLap).toBe(-1.8);
  expect(neighbourhoodSummary(1,[bell,hale],[],[
    {id:'bench',x:8,y:1,condition:'broken'}
  ]).irritationPerLap).toBe(-1.5);
  const bellMiller=[{id:1,x:7,y:1},{id:2,x:9,y:1}];
  expect(neighbourhoodSummary(1,bellMiller,[],[{id:'tree',x:8,y:1}])
    .irritationPerLap).toBe(1.44);
  const finchWard=[{id:0,x:7,y:1},{id:5,x:9,y:1}];
  const speed=[{id:'limit' as const,x:8,y:1}];
  expect(neighbourhoodSummary(5,finchWard,[],speed).irritationPerLap).toBe(1.26);
  expect(neighbourhoodSummary(0,finchWard,[],speed).irritationPerLap).toBe(1.8);
  expect(influencedNeighbourEffect(5,0,finchWard[1],finchWard[0],1.8,[],speed)
    .reasons).toContain('Speed sign reassures the Wards');
});

test('model placement preview includes the incremental neighbour change and it matches real laps',()=>{
  const store=foundGame();
  const preview=store.previewPlacement({x:8,y:1},'limit');
  expect(preview.allowed).toBe(true);
  expect(preview.neighbourEffects).toEqual([
    expect.objectContaining({residentId:5,previousPerLap:1.8,predictedPerLap:1.26,changePerLap:-.54})
  ]);
  expect(store.place({x:8,y:1},'limit')).toBe(true);
  expect(store.neighbourhoodFor(5).irritationPerLap).toBe(1.26);
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(1.8);
  const before=store.residents[5].irritation;
  store.finishLap(5);
  expect(store.residents[5].irritation).toBeCloseTo(before+1.26,8);
  expect(store.placements).toHaveLength(1);
});

test('spending guards reject insufficient coins, non-neighbours and lost households',()=>{
  const store=foundGame();
  expect(store.installBoundary(0,1,'picket')).toBe(false);
  expect(store.installBoundary(5,0,'picket')).toBe(false); // canonical pair order
  expect(store.installBoundary(0,5,'invalid' as 'picket')).toBe(false);
  store.money=0;
  expect(store.installBoundary(0,5,'picket')).toBe(false);
  expect(store.boundaryImprovements).toHaveLength(0);
  store.money=145;
  store.residents[5].occupied=false;
  expect(store.installBoundary(0,5,'picket')).toBe(false);
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(0);
});

test('the working neighbourhood drawer previews, purchases and renders a boundary',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await expect(page.locator('#boundary-studio')).toBeHidden();
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const plots=[
      {x:7,y:1},{x:14,y:1},{x:21,y:5},{x:14,y:11},{x:1,y:7},{x:9,y:1}
    ];
    for(let id=0;id<6;id++){
      store.chooseFoundingFamily(id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome(plots[id]))throw Error('bad plot '+id);
    }
    if(!store.beginVintageYears())throw Error('no founding finish');
  });
  const drawer=page.locator('#boundary-studio');
  await expect(drawer).toBeVisible();
  await page.getByRole('button',{name:'Fences & gardens'}).click();
  await expect(drawer).toHaveAttribute('open','');
  await expect(drawer.locator('[data-boundary-pair="0:5"]')).toBeVisible();
  await drawer.locator('[data-boundary-pair="0:5"]').click();
  await expect(drawer.locator('.boundary-forecast')).toContainText('The Wards');
  await expect(drawer.locator('.boundary-forecast')).toContainText('1.80 → 0.90');
  await expect(drawer.locator('.boundary-forecast')).toContainText('-0.90');
  await drawer.locator('[data-action="install-boundary"]').click();
  await expect(drawer.locator('[data-boundary-pair="0:5"]')).toContainText('Picket Fence');
  const after=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const debug=(window as typeof window&{
      __modelLoopDebug?:{worldArt:()=>{boundaries:{a:number;b:number;kind:string;x:number;y:number}[]}}
    }).__modelLoopDebug;
    return {coins:store.money,occupies:store.canPlace({x:8,y:1}),
      visuals:debug?.worldArt().boundaries};
  });
  expect(after.coins).toBe(121);
  expect(after.occupies).toBe(true);
  expect(after.visuals).toEqual([
    expect.objectContaining({a:0,b:5,kind:'picket'})
  ]);
  await drawer.locator('[data-boundary-kind="stone"]').click();
  await expect(drawer.locator('.boundary-forecast')).toContainText('0.90 → 0.54');
  await drawer.locator('[data-action="install-boundary"]').click();
  await expect(drawer.locator('[data-boundary-pair="0:5"]')).toContainText('Stone Boundary');
  await drawer.locator('[data-action="remove-boundary"]').click();
  await expect(drawer.locator('[data-boundary-pair="0:5"]')).toContainText('An open boundary');
  expect(errors).toEqual([]);
});
