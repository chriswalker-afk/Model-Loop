import { test, expect } from '@playwright/test';
import { GameStore } from '../src/game/state';
import { HOMES, ROAD_CELLS } from '../src/game/config';

test('new towns start on the road, not in ordinary play', () => {
  const game = new GameStore();
  game.newRun(1234);
  expect(game.phase).toBe('founding');
  expect(game.placedHomes).toHaveLength(0);
  expect(game.foundingCount).toBe(0);
  expect(game.placements).toHaveLength(0);
  expect(game.beginVintageYears()).toBe(false);
  game.tickEconomy(120);
  expect(game.elapsedSeconds).toBe(0);
  expect(game.finishLap(0)).toBe(0);
  expect(game.place({ x: 4, y: 4 }, 'lamp')).toBe(false);
  expect(game.money).toBe(145);
});

test('home building enforces the roadway, separation and six-family gate', () => {
  const game = new GameStore();
  game.newRun(100);
  game.chooseFoundingFamily(0);
  expect(game.canPlaceHome({ x: 3, y: 3 })).toBe(false); // road
  expect(game.canPlaceHome({ x: 12, y: 6 })).toBe(false); // not road-adjacent
  expect(game.placeFoundingHome({ x: 3, y: 2 })).toBe(true);
  expect(game.foundingCount).toBe(1);
  game.chooseFoundingFamily(1);
  expect(game.canPlaceHome({ x: 3, y: 2 })).toBe(false);
  expect(game.canPlaceHome({ x: 4, y: 2 })).toBe(false);
  const sites = HOMES.map(home => ({ x: home.x, y: home.y }));
  for (let id = 1; id < HOMES.length; id++) {
    game.chooseFoundingFamily(id);
    expect(game.placeFoundingHome(sites[id])).toBe(true);
  }
  expect(game.foundingCount).toBe(6);
  expect(game.beginVintageYears()).toBe(true);
  expect(game.phase).toBe('playing');
  expect(game.placedHomes).toHaveLength(6);
  expect(game.homeFor(5)).toMatchObject({ id: 5, x: 1, y: 7 });
  expect(game.placeFoundingHome({ x: 1, y: 6 }, 5)).toBe(false);
  game.tickEconomy(1);
  expect(game.elapsedSeconds).toBe(1);
});

test('rearrangement changes a home without increasing the number of houses', () => {
  const game = new GameStore();
  game.newRun(42);
  game.chooseFoundingFamily(0);
  expect(game.placeFoundingHome({ x: 3, y: 2 })).toBe(true);
  game.chooseFoundingFamily(0);
  expect(game.placeFoundingHome({ x: 4, y: 2 })).toBe(true);
  expect(game.foundingCount).toBe(1);
  expect(game.homeAt({ x: 3, y: 2 })).toBeNull();
  expect(game.homeAt({ x: 4, y: 2 })?.name).toBe('The Finches');
});

test('the founding UI presents six families with no vehicles or scenery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect(page.locator('#founding-panel')).toBeVisible();
  await expect(page.locator('#founding-family-list .founding-card')).toHaveCount(6);
  await expect(page.locator('#begin-vintage')).toBeDisabled();
  await expect(page.locator('#shop-section')).toBeHidden();
  const snapshot = await page.evaluate(() => (window as typeof window & {
    __modelLoopDebug?: {worldArt:()=>{cars:unknown[],scenery:unknown[],houses:Array<{alpha:number}>}}
  }).__modelLoopDebug?.worldArt());
  expect(snapshot?.cars).toHaveLength(0);
  expect(snapshot?.scenery).toHaveLength(0);
  expect(errors).toEqual([]);
});
