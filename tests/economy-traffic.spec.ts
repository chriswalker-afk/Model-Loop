import { test, expect } from '@playwright/test';
import { GameStore } from '../src/game/state';
import { modelEffects } from '../src/game/economy';
import { HOME_DWELL_SECONDS, HOME_TRAVEL_SECONDS, newCarCycle, stepCarCycle } from '../src/game/traffic';

test('net income is a rolling flow of earned lap coins less bills, not the coin balance', () => {
  const store = new GameStore(true);
  expect(store.money).toBe(145);
  expect(store.cashflow).toMatchObject({ gross: 0, upkeep: 0, net: 0 });

  expect(store.finishLap(0)).toBe(15);
  expect(store.money).toBe(160);
  expect(store.cashflow).toMatchObject({ gross: 15, upkeep: 0, net: 15 });

  const cell = { x: 4, y: 4 };
  expect(store.place(cell, 'lamp')).toBeTruthy();
  expect(store.money).toBe(125);
  // Building costs reduce savings, not Income: purchases are not recurring flow.
  expect(store.cashflow).toMatchObject({ gross: 15, upkeep: 0, net: 15, nextUpkeep: 6 });

  store.tickEconomy(19);
  expect(store.money).toBe(125);
  store.tickEconomy(1);
  expect(store.money).toBe(119);
  expect(store.cashflow).toMatchObject({ gross: 15, upkeep: 6, net: 9 });

  // The old lap rolls out of the last-60s window, but bills keep arriving.
  store.tickEconomy(40);
  expect(store.money).toBe(107);
  expect(store.cashflow).toMatchObject({ gross: 0, upkeep: 18, net: -18 });
  store.newRun();
  expect(store.money).toBe(145);
  expect(store.cashflow).toMatchObject({ gross: 0, upkeep: 0, net: 0 });
});

test('each model has an independent cost/benefit control', () => {
  const store = new GameStore(true);
  const lamp = { x: 4, y: 4 };
  const tree = { x: 6, y: 3 };
  expect(store.place(lamp, 'lamp')).toBeTruthy();
  expect(store.place(tree, 'tree')).toBeTruthy();
  expect(store.cashflow.nextUpkeep).toBe(11);
  const full = store.tileInfo(lamp)!;
  expect(store.setModelCare(lamp, 'economy')).toBeTruthy();
  expect(store.cashflow.nextUpkeep).toBe(8); // lamp 3 + tree 5
  const economy = store.tileInfo(lamp)!;
  expect(economy.beauty).toBeLessThan(full.beauty);
  expect(economy.crime).toBeGreaterThan(full.crime);
  expect(store.setModelCare(lamp, 'bare')).toBeTruthy();
  expect(store.cashflow.nextUpkeep).toBe(5); // only tree
  const bare = store.tileInfo(lamp)!;
  expect(bare.beauty).toBeLessThan(economy.beauty);
  expect(bare.crime).toBeGreaterThan(economy.crime);
  expect(store.getPlacedModel(tree)?.care).toBe('full');
  store.tickEconomy(20);
  expect(store.cashflow).toMatchObject({ gross: 0, upkeep: 5, net: -5 });

  expect(modelEffects('police','full').upkeep).toBe(8);
  expect(modelEffects('police','economy').upkeep).toBe(4);
  expect(modelEffects('police','bare').upkeep).toBe(0);
});

test('speed signs slow the road in their radius and care alters their strength', () => {
  const store = new GameStore(true);
  const sign = { x: 4, y: 4 }, near = { x: 3, y: 4 }, far = { x: 19, y: 9 };
  expect(store.speedMultiplierAt(near)).toBe(1);
  expect(store.place(sign, 'limit')).toBeTruthy();
  expect(store.speedMultiplierAt(near)).toBe(.58);
  expect(store.speedMultiplierAt(far)).toBe(1);
  expect(store.setModelCare(sign, 'economy')).toBeTruthy();
  expect(store.speedMultiplierAt(near)).toBe(.76);
  expect(store.setModelCare(sign, 'bare')).toBeTruthy();
  expect(store.speedMultiplierAt(near)).toBe(.95);
  // Real movement uses the multiplier, rather than adding irritation alone.
  const distanceInOneSecond = 85;
  expect(distanceInOneSecond * .58).toBeLessThan(distanceInOneSecond * .95);
});

test('each coin payout requires a full lap followed by travel home, a pause and departure', () => {
  const cycle = newCarCycle();
  expect(stepCarCycle(cycle, 1, 90, 100)).toBe(false);
  expect(cycle.phase).toBe('driving');
  expect(stepCarCycle(cycle, 1, 10, 100)).toBe(true);
  expect(cycle.phase).toBe('returning');
  expect(stepCarCycle(cycle, HOME_TRAVEL_SECONDS, 0, 100)).toBe(false);
  expect(cycle.phase).toBe('at-home');
  expect(stepCarCycle(cycle, HOME_DWELL_SECONDS * .5, 0, 100)).toBe(false);
  expect(cycle.phase).toBe('at-home');
  expect(stepCarCycle(cycle, HOME_DWELL_SECONDS, 0, 100)).toBe(false);
  expect(cycle.phase).toBe('departing');
  expect(stepCarCycle(cycle, HOME_TRAVEL_SECONDS, 0, 100)).toBe(false);
  expect(cycle.phase).toBe('driving');
  expect(cycle.distance).toBe(0);
  expect(stepCarCycle(cycle, 1, 100, 100)).toBe(true);
});

test('browser exposes care choices and shows positive and negative income flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?referenceTown=1');
  await expect(page.locator('#coins')).toHaveText('145');
  await expect(page.locator('.income-meter')).toContainText('0/60s');

  await page.getByRole('button',{name: /Select Gas Lamppost/}).click();
  const rect = await page.locator('#game-container canvas').boundingBox();
  if (!rect) throw new Error('Game canvas did not render');
  await page.mouse.click(
    rect.x + (60 + 4.5 * 43) / 1152 * rect.width,
    rect.y + (48 + 4.5 * 43) / 620 * rect.height
  );
  await expect(page.locator('#coins')).toHaveText('110');
  await expect(page.locator('.income-meter')).toContainText('0/60s'); // building isn't income
  const panel = page.locator('#tile-panel');
  await expect(panel).toContainText('MODEL CARE');
  await expect(panel.locator('button[data-care]')).toHaveCount(3);

  await panel.locator('button[data-care="economy"]').click();
  await expect(panel.locator('button[data-care="economy"]')).toHaveAttribute('aria-pressed','true');
  await expect(panel).toContainText('3 coins / 20s');
  await page.evaluate(async () => {
    const { store } = await import('/src/game/state.ts');
    store.tickEconomy(20);
  });
  await expect(page.locator('#coins')).toHaveText('107');
  await expect(page.locator('.income-meter')).toContainText('−3 care');
  await expect(page.locator('.income-meter')).toContainText('-3/60s');
  await expect(page.locator('.flow-fill.outflow')).toBeVisible();

  await page.evaluate(async () => {
    const { store } = await import('/src/game/state.ts');
    store.finishLap(0);
  });
  await expect(page.locator('#coins')).toHaveText('122');
  await expect(page.locator('.income-meter')).toContainText('+12/60s');
  await expect(page.locator('.flow-fill.inflow')).toBeVisible();
  await panel.locator('button[data-care="bare"]').click();
  await expect(panel.locator('button[data-care="bare"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('0 coins / 20s');
  expect(errors).toEqual([]);
});

test('speed sign care panel shows realistic slowing, not just a stat change', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?referenceTown=1');
  await page.getByRole('button',{name: /Select Speed Sign/}).click();
  const rect = await page.locator('#game-container canvas').boundingBox();
  if (!rect) throw new Error('Game canvas did not render');
  await page.mouse.click(
    rect.x + (60 + 4.5 * 43) / 1152 * rect.width,
    rect.y + (48 + 4.5 * 43) / 620 * rect.height
  );
  const panel = page.locator('#tile-panel');
  await expect(panel).toContainText('Cars travel at 58%');
  await panel.locator('[data-care="economy"]').click();
  await expect(panel).toContainText('Cars travel at 76%');
  await panel.locator('[data-care="bare"]').click();
  await expect(panel).toContainText('Cars travel at 95%');
});
