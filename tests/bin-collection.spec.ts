import { test, expect } from '@playwright/test';
import { GameStore } from '../src/game/state';
import {
  BIN_CAPACITY, BIN_CATCH_RADIUS, binCatchChance, binCollectionInterval,
  collectionCost, withinBinCatchment
} from '../src/game/bins';
import { MODELS } from '../src/game/config';

const binCell = { x: 4, y: 4 }, roadCell = { x: 4, y: 3 };

function newStore(): GameStore {
  const store = new GameStore();
  store.newRun(12345);
  return store;
}
function addBin(store: GameStore): void {
  expect(store.place(binCell, 'bin')).toBe(true);
}

test('sixth boxed model and bounded collection-price curve', () => {
  const def = MODELS.find(model => model.id === 'bin');
  expect(MODELS).toHaveLength(6);
  expect(def).toMatchObject({ name: 'Cast-Iron Rubbish Bin', cost: 30, upkeep: 3 });
  expect(BIN_CAPACITY).toBe(6);
  expect(BIN_CATCH_RADIUS).toBe(3);
  expect(binCatchChance('full')).toBe(1);
  expect(binCatchChance('economy')).toBe(.7);
  expect(binCatchChance('bare')).toBe(.25);
  expect(binCollectionInterval('full')).toBe(60);
  expect(binCollectionInterval('economy')).toBe(120);
  expect(binCollectionInterval('bare')).toBeNull();
  expect(withinBinCatchment(binCell, roadCell)).toBe(true);
  expect(withinBinCatchment(binCell, { x: 4, y: 8 })).toBe(false);
  expect(collectionCost(0,false)).toBe(0);
  expect(collectionCost(1,false)).toBe(6);
  expect(collectionCost(5,false)).toBe(14);
  expect(collectionCost(6,false)).toBe(24);
  expect(collectionCost(6,true)).toBe(24);
});

test('bin intercepts litter inside coverage, fills, then visibly overflows', () => {
  const store = newStore();
  addBin(store);
  expect(store.money).toBe(115);
  expect(store.cashflow.net).toBe(0); // Buying is not recurring income.
  for(let i = 1; i <= BIN_CAPACITY; i++){
    expect(store.debugEnvironmentEvent('litter', 2, roadCell)).toBe(true);
    expect(store.getBinStatus(binCell)?.fill).toBe(i);
    expect(store.environment.effects.filter(effect => effect.kind === 'litter')).toHaveLength(0);
    expect(store.environment.history[0]).toMatchObject({
      outcome: 'captured', kind: 'litter', bin: binCell
    });
  }
  const before = store.tileInfo(binCell)!;
  expect(store.getBinStatus(binCell)?.collectionPrice).toBe(24);
  expect(store.debugEnvironmentEvent('litter', 2, roadCell)).toBe(true);
  expect(store.getBinStatus(binCell)).toMatchObject({ fill: 6, overflowed: true });
  expect(store.environment.history[0].outcome).toBe('overflow');
  expect(store.environment.effects.some(effect => effect.kind === 'litter')).toBe(true);
  expect(store.tileInfo(binCell)!.beauty).toBeLessThan(before.beauty);
  expect(store.tileInfo(binCell)!.crime).toBeGreaterThan(before.crime);
  expect(store.safety).toBe(90); // Rubbish isn't automatically a traffic hazard.
});

test('manual collection costs real money, resets capacity but leaves old litter', () => {
  const store = newStore();
  addBin(store);
  for(let i=0;i<7;i++) expect(store.debugEnvironmentEvent('litter',2,roadCell)).toBe(true);
  const garbage = store.environment.effects.find(effect => effect.kind === 'litter')!;
  const before = store.money;
  expect(store.emptyBin(binCell)).toBe(true);
  expect(store.money).toBe(before - 24);
  expect(store.cashflow).toMatchObject({ gross: 0, upkeep: 24, net: -24 });
  expect(store.getBinStatus(binCell)).toMatchObject({ fill: 0, overflowed: false });
  expect(store.environment.effects.some(x => x.id === garbage.id)).toBe(true);
  expect(store.cleanLitter(garbage.cell)).toBe(true);
  expect(store.environment.effects.some(x => x.id === garbage.id)).toBe(false);
  expect(store.money).toBe(before - 30);
  expect(store.cashflow.net).toBe(-30);
  expect(store.emptyBin(binCell)).toBe(false); // No duplicate charge on empty bins.
});

test('automatic collection charges net Income, and time stops during pause', () => {
  const store = newStore();
  addBin(store);
  for(let i=0;i<3;i++) expect(store.debugEnvironmentEvent('litter',2,roadCell)).toBe(true);
  expect(store.getBinStatus(binCell)?.fill).toBe(3);
  store.togglePause();
  store.tickEconomy(100);
  expect(store.getBinStatus(binCell)?.fill).toBe(3);
  expect(store.money).toBe(115);
  store.togglePause();
  store.tickEconomy(60);
  expect(store.getBinStatus(binCell)).toMatchObject({fill: 0, overflowed: false});
  // 3 maintenance bills (3 coins each) plus 10 for collection of 3 items.
  expect(store.money).toBe(96);
  expect(store.cashflow).toMatchObject({gross: 0, upkeep: 19, net: -19});
});

test('economy care halves routine upkeep, slows collections, and bare removes auto service', () => {
  const store = newStore();
  addBin(store);
  expect(store.setModelCare(binCell,'economy')).toBe(true);
  expect(store.getBinStatus(binCell)).toMatchObject({ collectionDueIn: 120, reliability: .7 });
  expect(store.getBinStatus(binCell)?.regularUpkeep).toBe(2);
  store.tickEconomy(60);
  expect(store.money).toBe(109);
  expect(store.getBinStatus(binCell)?.collectionDueIn).toBe(60);
  expect(store.setModelCare(binCell, 'bare')).toBe(true);
  expect(store.getBinStatus(binCell)).toMatchObject({
    collectionDueIn: null, regularUpkeep: 0, reliability: .25
  });
  store.tickEconomy(1000);
  expect(store.money).toBe(109);
  expect(store.getBinStatus(binCell)?.collectionDueIn).toBeNull();
  expect(store.setModelCare(binCell,'full')).toBe(true);
  expect(store.getBinStatus(binCell)?.collectionDueIn).toBe(60);
});

test('the closer bin can fill while an overlapping second bin takes over', () => {
  const store = newStore();
  addBin(store);
  const second = { x: 6, y: 3 };
  expect(store.place(second, 'bin')).toBe(true);
  for(let i=0;i<6;i++) expect(store.debugEnvironmentEvent('litter',2,roadCell)).toBe(true);
  expect(store.getBinStatus(binCell)?.fill).toBe(6);
  expect(store.getBinStatus(second)?.fill).toBe(0);
  expect(store.debugEnvironmentEvent('litter',2,roadCell)).toBe(true);
  expect(store.getBinStatus(second)?.fill).toBe(1);
  expect(store.getBinStatus(binCell)?.overflowed).toBe(false);
});

test('manual collection fails safely when coins are insufficient', () => {
  const store = newStore();
  addBin(store);
  for(let i=0;i<6;i++) store.debugEnvironmentEvent('litter',2,roadCell);
  store.money = 10;
  expect(store.emptyBin(binCell)).toBe(false);
  expect(store.money).toBe(10);
  expect(store.getBinStatus(binCell)?.fill).toBe(6);
});

test('desktop browser shows new title, sixth kit, fill gauge and working Empty Now button', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/The Generational Cycle/);
  await expect(page.locator('.brand-name')).toHaveText('THE GENERATIONAL CYCLE');
  await expect(page.locator('.model-box')).toHaveCount(6);
  await expect(page.locator('[data-model="bin"] .display-window svg')).toBeVisible();
  await page.getByRole('button',{name:/Select Cast-Iron Rubbish Bin/}).click();
  const rect=await page.locator('#game-container canvas').boundingBox();
  if (!rect)throw new Error('Game canvas missing');
  const coords = (x:number,y:number) => ({
    x:rect.x + (60+(x+.5)*43)/1152*rect.width,
    y:rect.y + (48+(y+.5)*43)/620*rect.height
  });
  let p=coords(4,4);
  await page.mouse.move(p.x,p.y);
  await expect(page.locator('#tile-panel')).toContainText('6 items');
  await expect(page.locator('#tile-panel')).toContainText('Collection bills are additional');
  await page.mouse.click(p.x,p.y);
  await expect(page.locator('#coins')).toHaveText('115');
  const panel=page.locator('#tile-panel');
  await expect(panel).toContainText('COLLECTION CAPACITY');
  await expect(panel).toContainText('0 / 6 pieces');
  await expect(panel.getByRole('button',{name:/Empty now/})).toBeDisabled();
  await page.evaluate(async () => {
    const {store}=await import('/src/game/state.ts');
    store.debugEnvironmentEvent('litter',2,{x:4,y:3});
  });
  await expect(panel).toContainText('1 / 6 pieces');
  await expect(panel.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow','1');
  await panel.getByRole('button',{name:/Empty now/}).click();
  await expect(panel).toContainText('0 / 6 pieces');
  await expect(page.locator('#coins')).toHaveText('109');
  await expect(page.locator('.income-meter')).toContainText('−6 care');
  expect(errors).toEqual([]);
});

test('rubbish bin remains selectable and serviceable in the short-screen layout', async ({page}) => {
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  await expect(page.locator('.model-box')).toHaveCount(6);
  await page.getByRole('button',{name:/Select Cast-Iron Rubbish Bin/}).click();
  const rect=await page.locator('#game-container canvas').boundingBox();
  if(!rect)throw new Error('Game canvas missing');
  const x=rect.x+(60+4.5*43)/1152*rect.width;
  const y=rect.y+(48+4.5*43)/620*rect.height;
  await page.mouse.click(x,y);
  await expect(page.locator('#tile-panel')).toContainText('COLLECTION CAPACITY');
  await page.locator('#tile-panel [data-care="economy"]').click();
  await expect(page.locator('#tile-panel')).toContainText('70% catch');
  await expect(page.locator('#tile-panel')).toContainText('120s');
});
