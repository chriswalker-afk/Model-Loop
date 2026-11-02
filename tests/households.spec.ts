import { test, expect } from '@playwright/test';
import { HOUSEHOLD_PROFILES, modelReactionPerTile } from '../src/game/households';
import { GameStore } from '../src/game/state';

test('households respond differently to the exact same model', () => {
  expect(HOUSEHOLD_PROFILES).toHaveLength(6);
  expect(new Set(HOUSEHOLD_PROFILES.map(profile => profile.id)).size).toBe(6);

  // The Wards appreciate caution while the Finches feel hemmed in.
  expect(modelReactionPerTile(5, 'limit')).toBeLessThan(0);
  expect(modelReactionPerTile(0, 'limit')).toBeGreaterThan(0);
  // A communal bench is welcome to the Marshes but less to the Millers.
  expect(modelReactionPerTile(3, 'bench')).toBeLessThan(0);
  expect(modelReactionPerTile(2, 'bench')).toBeGreaterThan(0);

  const store = new GameStore();
  const cell = { x: 4, y: 4 };
  const preview = store.previewPlacement(cell, 'limit');
  expect(preview.canPlace).toBeTruthy();
  expect(preview.householdEffects).toHaveLength(6);
  expect(preview.householdEffects.find(effect => effect.residentId === 0)!.irritationChangePerLap).toBeGreaterThan(0);
  expect(preview.householdEffects.find(effect => effect.residentId === 5)!.irritationChangePerLap).toBeLessThan(0);
  const before = store.residents.map(resident => resident.irritation);
  expect(store.placements).toHaveLength(0);
  expect(store.residents.map(resident => resident.irritation)).toEqual(before);

  store.placements.push({ ...cell, id: 'limit' });
  const tile = { x: 4, y: 3 };
  store.passTile(0, tile);
  store.passTile(5, tile);
  expect(store.residents[0].irritation).toBeGreaterThan(before[0]);
  expect(store.residents[5].irritation).toBeLessThan(before[5]);
  expect(store.residents[0].lastRemark).toContain('sign');
  expect(store.residents[5].lastRemark).toContain('patience');
});

test('neighbourhood strip and the optional household panel work without browser errors', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.household-ticket')).toHaveCount(6);
  await expect(page.locator('#household-list')).toContainText('The Wards');
  await expect(page.locator('#workbench-note')).toContainText('AT THE WORKBENCH');

  await page.getByRole('button', { name: /The Finches:.*View household/i }).click();
  const panel = page.locator('#household-detail');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('The Finches');
  await expect(panel).toContainText('Open views');
  await expect(panel).toContainText('A sign or watchful building');
  await page.getByRole('button', { name: 'Close household details' }).click();
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: /Select Speed Sign/ }).click();
  const canvas = page.locator('#game-container canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Missing town');
  const x = box.x + (60 + (4.5 * 43)) / 1152 * box.width;
  const y = box.y + (48 + (4.5 * 43)) / 620 * box.height;
  await page.mouse.move(x, y);
  await expect(page.locator('#tile-panel')).toBeHidden();
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
  const forecast = page.locator('#tile-panel');
  await expect(forecast).toContainText('Different journeys, different reactions');
  await expect(forecast).toContainText('The Wards');
  await expect(forecast).toContainText('The Finches');
  await expect(forecast.locator('.voice-line.good')).toHaveCount(1);
  await expect(forecast.locator('.voice-line.wary')).toHaveCount(1);
  await page.mouse.click(x, y);
  await expect(page.locator('#coins')).toHaveText('115');
  await expect(page.locator('.household-ticket')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('narrow layout keeps household access and the model shop available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#household-list')).toBeVisible();
  await expect(page.locator('.household-ticket').first()).toBeInViewport();
  await expect(page.locator('#shop-section')).toBeInViewport();
  await page.locator('.household-ticket').first().click();
  await expect(page.locator('#household-detail')).toBeVisible();
  await page.getByRole('button', { name: 'Close household details' }).click();
  await expect(page.locator('#household-detail')).toBeHidden();
});
