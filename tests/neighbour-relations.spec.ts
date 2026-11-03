import { test, expect, type Page } from '@playwright/test';
import {
  directedNeighbourEffect, neighbourhoodSummary, forecastNeighbourhoodPlacement,
  NEIGHBOUR_RADIUS, MAX_NEIGHBOUR_EFFECT_PER_LAP
} from '../src/game/founding';
import { GameStore } from '../src/game/state';
import { HOMES, type Cell } from '../src/game/config';

const foundingPlots:Cell[] = [
  {x:7,y:1}, {x:9,y:1}, {x:14,y:1}, {x:21,y:5},
  {x:14,y:11}, {x:1,y:7}
];

function settleTown(store:GameStore,plots:readonly Cell[]=foundingPlots):void {
  store.newRun(12345);
  for(const home of HOMES){
    store.chooseFoundingFamily(home.id);
    store.acknowledgeFoundingIntroduction();
    expect(store.placeFoundingHome(plots[home.id])).toBe(true);
  }
  expect(store.beginVintageYears()).toBe(true);
}

async function boardPoint(page:Page,x:number,y:number){
  const rect=await page.locator('#game-container canvas').boundingBox();
  if(!rect)throw new Error('Town canvas missing');
  return {
    x:rect.x+(60+(x+.5)*43)/1152*rect.width,
    y:rect.y+(48+(y+.5)*43)/620*rect.height
  };
}

test('directional preferences, proximity decay and ordinary neighbours use one model',()=>{
  expect(NEIGHBOUR_RADIUS).toBe(4);
  // The Millers welcome the Wards but their admiration is not reciprocal.
  expect(directedNeighbourEffect(2,5,2)).toBe(-1.5);
  expect(directedNeighbourEffect(5,2,2)).toBe(0);
  // Close conflict between the Finches and the Wards is mutual.
  expect(directedNeighbourEffect(0,5,2)).toBe(1.8);
  expect(directedNeighbourEffect(5,0,2)).toBe(1.8);
  expect(directedNeighbourEffect(0,5,3)).toBe(1.2);
  expect(directedNeighbourEffect(0,5,4)).toBe(.6);
  expect(directedNeighbourEffect(0,5,5)).toBe(0);
  expect(directedNeighbourEffect(0,5,1)).toBe(0); // Invalid plot separation.
  expect(directedNeighbourEffect(0,0,2)).toBe(0);
});

test('stacked conflicts have a hard cap and distant or departed neighbours do not count',()=>{
  const close=[
    {id:0,x:5,y:5},{id:5,x:7,y:5},{id:4,x:5,y:7}
  ];
  const social=neighbourhoodSummary(0,close);
  expect(social.neighbours).toHaveLength(2);
  expect(social.uncappedPerLap).toBe(3.6);
  expect(social.irritationPerLap).toBe(MAX_NEIGHBOUR_EFFECT_PER_LAP);
  expect(neighbourhoodSummary(0,[close[0]]).irritationPerLap).toBe(0);
  expect(neighbourhoodSummary(5,close).irritationPerLap).toBe(1.8);
});

test('founding forecast reflects directional effects on family AND already-settled neighbours',()=>{
  const game=new GameStore();
  game.newRun(11);
  game.chooseFoundingFamily(0);
  game.acknowledgeFoundingIntroduction();
  expect(game.placeFoundingHome({x:7,y:1})).toBe(true);
  game.chooseFoundingFamily(1);
  const preview=game.previewFoundingHome({x:9,y:1});
  expect(preview.allowed).toBe(true);
  expect(preview.neighbours.map(n=>n.id)).toEqual([0]);
  expect(preview.relationshipForecast).toMatchObject({
    residentId:1, previousPerLap:0,predictedPerLap:0,changePerLap:0
  });
  // Bells are neutral about the Finches; Finches like the Bells.
  expect(preview.relationshipForecast!.affected).toEqual(
    expect.arrayContaining([
      expect.objectContaining({residentId:0,changePerLap:-1.5}),
      expect.objectContaining({residentId:1,changePerLap:0})
    ])
  );
  expect(game.placeFoundingHome({x:9,y:1})).toBe(true);
  expect(game.neighbourhoodFor(0).irritationPerLap).toBe(-1.5);
  expect(game.neighbourhoodFor(1).irritationPerLap).toBe(0);

  game.chooseFoundingFamily(1);
  const moved=game.previewFoundingHome({x:12,y:1});
  expect(moved.allowed).toBe(true);
  expect(moved.relationshipForecast!.affected).toEqual(
    expect.arrayContaining([
      expect.objectContaining({residentId:0,previousPerLap:-1.5,predictedPerLap:0,changePerLap:1.5})
    ])
  );
  const invalid=game.previewFoundingHome({x:8,y:1});
  expect(invalid.allowed).toBe(false);
  expect(invalid.relationshipForecast).toBeNull();
});

test('live per-lap comfort equals the founding forecast, with no hidden currency or time effects',()=>{
  const store=new GameStore();
  settleTown(store);
  const social=store.neighbourhoodFor(0);
  expect(social.irritationPerLap).toBe(-1.5);
  expect(social.neighbours.map(n=>n.id)).toEqual([1]);

  const before=store.residents[0].irritation;
  const money=store.money;
  const clock=store.elapsedSeconds;
  expect(store.finishLap(0)).toBe(15);
  expect(store.residents[0].laps).toBe(1);
  expect(store.residents[0].irritation).toBeCloseTo(before-1.5,8);
  expect(store.residents[0].lastRemark).toContain('The Bells');
  expect(store.money).toBe(money+15);
  expect(store.elapsedSeconds).toBe(clock);
  expect(store.residents[1].irritation).toBe(before);
  store.finishLap(1);
  expect(store.residents[1].irritation).toBe(before); // No reciprocal bonus.

  store.residents[1].occupied=false;
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(0);
  const after=store.residents[0].irritation;
  store.finishLap(0);
  expect(store.residents[0].irritation).toBeCloseTo(after,8);
});

test('a worried family can leave on completing a circuit; no payout for a departed resident',()=>{
  const store=new GameStore();
  settleTown(store,[
    {x:7,y:1},{x:14,y:1},{x:17,y:1},{x:21,y:5},
    {x:14,y:11},{x:9,y:1}
  ]);
  expect(store.neighbourhoodFor(0).irritationPerLap).toBe(1.8);
  store.residents[0].irritation=99.2;
  const funds=store.money;
  expect(store.finishLap(0)).toBe(0);
  expect(store.residents[0].occupied).toBe(false);
  expect(store.money).toBe(funds);
  expect(store.residents[0].lastRemark).toContain('quiet');
});

test('the founding inspector, review and live household details report the SAME effects', async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.chooseFoundingFamily(0);
    store.acknowledgeFoundingIntroduction();
    store.placeFoundingHome({x:7,y:1});
    store.chooseFoundingFamily(1);
    store.acknowledgeFoundingIntroduction();
  });
  const location=await boardPoint(page,9,1);
  await page.keyboard.down('Shift');
  await page.mouse.click(location.x,location.y);
  await page.keyboard.up('Shift');
  const inspector=page.locator('#tile-panel');
  await expect(inspector).toContainText('Life beside this road');
  await expect(inspector).toContainText('The Finches');
  await expect(inspector).toContainText('-1.50');
  await expect(inspector).toContainText('per completed circuit');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.placeFoundingHome({x:9,y:1});
    const plots=[{x:14,y:1},{x:21,y:5},{x:14,y:11},{x:1,y:7}];
    for(let id=2;id<=5;id++) {
      store.chooseFoundingFamily(id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome(plots[id-2]))throw Error('House not placed: '+id);
    }
  });
  await page.getByRole('button',{name:'Review the founding town'}).click();
  await expect(page.getByRole('dialog',{name:'A Town Begins'})).toContainText('-1.50');
  await page.getByRole('button',{name:'Begin the Vintage Years'}).click();
  await page.getByRole('button',{name:/The Finches:.*View household/}).click();
  const detail=page.locator('#household-detail');
  await expect(detail).toBeVisible();
  await detail.locator('.family-relations summary').click();
  await expect(detail.locator('.family-relations')).toContainText('-1.50/circuit');
  await expect(detail.locator('.family-relations')).toContainText('The Bells');
  expect(errors).toEqual([]);
});
