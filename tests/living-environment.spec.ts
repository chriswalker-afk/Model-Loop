import { test, expect } from '@playwright/test';
import {
  LivingEnvironment, SeededRandom, EFFECT_LIFETIME,
  MAX_EFFECTS_BY_KIND, MAX_ENVIRONMENT_EFFECTS
} from '../src/game/environment';
import { HOMES, ROAD_CELLS, manhattanDistance } from '../src/game/config';
import { GameStore } from '../src/game/state';

const corner = { x: 4, y: 3 };

test('seeded generation is reproducible, including environmental placement and messages', () => {
  const first = new LivingEnvironment(654321);
  const second = new LivingEnvironment(654321);
  const rollA = new SeededRandom(47), rollB = new SeededRandom(47);
  expect(Array.from({ length: 12 }, () => rollA.next()))
    .toEqual(Array.from({ length: 12 }, () => rollB.next()));

  const perform = (environment: LivingEnvironment) => {
    environment.force('litter', 2, corner, 3);
    environment.force('flowers', 1, { x: 9, y: 3 }, 4);
    environment.force('skid', 0, { x: 12, y: 3 }, 5);
    return { effects: environment.effects, history: environment.history };
  };
  expect(perform(first)).toEqual(perform(second));
  expect(first.effects).toHaveLength(3);
  expect(new Set(first.effects.map(effect => effect.id)).size).toBe(3);
  expect(first.history.map(event => event.tone)).toEqual([
    'troublesome', 'helpful', 'troublesome'
  ]);
});

test('events stay in valid cells and cannot pile up indefinitely', () => {
  const env = new LivingEnvironment(9876);
  expect(env.force('skid', 0, { x: 0, y: 0 }, 0)).toBeNull();
  for (let i = 0; i < 100; i++) {
    const road = ROAD_CELLS[i % ROAD_CELLS.length];
    env.force(i % 2 ? 'litter' : 'flowers', i % 2 ? 2 : 1, road, i);
    env.force('skid', 0, road, i);
  }
  expect(env.effects.length).toBeLessThanOrEqual(MAX_ENVIRONMENT_EFFECTS);
  for (const kind of ['litter', 'flowers', 'skid'] as const) {
    expect(env.effects.filter(effect => effect.kind === kind).length)
      .toBeLessThanOrEqual(MAX_EFFECTS_BY_KIND[kind]);
  }
  for (const effect of env.effects) {
    if (effect.kind === 'skid') {
      expect(ROAD_CELLS.some(cell => cell.x === effect.cell.x && cell.y === effect.cell.y)).toBe(true);
    } else {
      expect(ROAD_CELLS.some(cell => manhattanDistance(cell, effect.cell) === 1)).toBe(true);
      expect(HOMES.some(home => home.x === effect.cell.x && home.y === effect.cell.y)).toBe(false);
    }
  }
  expect(env.history.length).toBeLessThanOrEqual(8);
});

test('litter and flowers change local beauty; tyre scuffs change actual safety', () => {
  const store = new GameStore(true);
  store.newRun(777);
  const baseSafety = store.safety;
  expect(baseSafety).toBe(90);
  expect(baseSafety).not.toBe(Math.round(100 - store.averageIrritation));

  const before = store.tileInfo(corner)!;
  expect(store.debugEnvironmentEvent('litter', 2, corner)).toBe(true);
  const litter = store.environment.effects[0];
  expect(store.tileInfo(litter.cell)!.beauty).toBeLessThan(before.beauty);
  expect(store.safety).toBe(baseSafety); // Litter is not intrinsically crime or a safety hazard.
  expect(store.debugEnvironmentEvent('flowers', 1, { x: 9, y: 3 })).toBe(true);
  const flowers = store.environment.effects.find(effect => effect.kind === 'flowers')!;
  expect(store.tileInfo(flowers.cell)!.beauty).toBeGreaterThan(1);
  expect(store.debugEnvironmentEvent('skid', 0, { x: 12, y: 3 })).toBe(true);
  expect(store.safety).toBe(baseSafety - 12);
  expect(store.tileInfo({ x: 12, y: 3 })!.roadSafety).toBe(78);

  store.tickEconomy(EFFECT_LIFETIME.skid);
  expect(store.environment.effects.some(effect => effect.kind === 'skid')).toBe(false);
  expect(store.safety).toBe(baseSafety);
  store.tickEconomy(EFFECT_LIFETIME.litter);
  expect(store.environment.effects).toHaveLength(0);
  expect(store.environment.history.length).toBeGreaterThan(0); // Old events stay in the short log.
  store.newRun(777);
  expect(store.environment.effects).toHaveLength(0);
  expect(store.environment.history).toHaveLength(0);
  expect(store.safety).toBe(baseSafety);
});

test('the same road tile irritates drivers differently while effects are present', () => {
  const clean = new GameStore(true);
  clean.newRun(123);
  clean.passTile(5, corner);
  const pristineIrritation = clean.residents[5].irritation;

  const withRubbish = new GameStore(true);
  withRubbish.newRun(123);
  expect(withRubbish.debugEnvironmentEvent('litter', 2, corner)).toBe(true);
  withRubbish.passTile(5, corner);
  expect(withRubbish.residents[5].irritation).toBeGreaterThan(pristineIrritation);
  // Existing purchasing, lap rewards and the Blueprint rules remain unaffected.
  expect(withRubbish.finishLap(5)).toBe(15);
  expect(withRubbish.money).toBe(160);
  expect(withRubbish.progress).toBe(3);
});

test('each household makes at most one event attempt per circuit', () => {
  const store = new GameStore(true);
  store.newRun(91);
  const resident = store.residents[2];
  const startIndex = ROAD_CELLS.findIndex(tile => manhattanDistance(tile, HOMES[2]) === 1);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  for (let offset = 0; offset < ROAD_CELLS.length; offset++) {
    store.passTile(2, ROAD_CELLS[(startIndex + offset) % ROAD_CELLS.length]);
  }
  expect(resident.lastEventLap).toBe(0);
  const triesBefore = store.environment.history.length;
  for (let offset = 0; offset < ROAD_CELLS.length; offset++) {
    store.passTile(2, ROAD_CELLS[(startIndex + offset) % ROAD_CELLS.length]);
  }
  expect(store.environment.history.length).toBe(triesBefore);
  store.finishLap(2);
  for (let offset = 0; offset < ROAD_CELLS.length; offset++) {
    store.passTile(2, ROAD_CELLS[(startIndex + offset) % ROAD_CELLS.length]);
  }
  expect(resident.lastEventLap).toBe(1);
});

test('real browser displays traces with their source and separate road safety', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?referenceTown=1');
  const trigger = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __modelLoopDebug?: {
        trigger: (kind: string, family: number, x: number, y: number) => boolean;
        snapshot: () => { effects: Array<{ kind: string; cell: { x: number; y: number } }>; safety: number };
      };
    }).__modelLoopDebug;
    if (!debug) throw new Error('Missing development-only debug controls');
    const spawned = debug.trigger('litter', 2, 4, 3);
    return { spawned, ...debug.snapshot() };
  });
  expect(trigger.spawned).toBe(true);
  expect(trigger.effects[0].kind).toBe('litter');
  expect(trigger.safety).toBe(90);
  await expect(page.locator('#notice')).toContainText('The Millers');

  const cell = trigger.effects[0].cell;
  const rect = await page.locator('#game-container canvas').boundingBox();
  if (!rect) throw new Error('Missing town');
  const x = rect.x + (60 + (cell.x + 0.5) * 43) / 1152 * rect.width;
  const y = rect.y + (48 + (cell.y + 0.5) * 43) / 620 * rect.height;
  await page.mouse.move(x, y);
  await expect(page.locator('#tile-panel')).toBeHidden();
  await page.mouse.click(x, y);
  const panel = page.locator('#tile-panel');
  await expect(panel).toContainText('Discarded packaging');
  await expect(panel).toContainText('The Millers');
  await expect(panel).toContainText('Road safety');

  const skid = await page.evaluate(() =>
    (window as typeof window & { __modelLoopDebug: {
      trigger: (kind: string, family: number, x: number, y: number) => boolean;
      snapshot: () => { safety: number; effects: unknown[] };
    } }).__modelLoopDebug.trigger('skid', 0, 12, 3)
  );
  expect(skid).toBe(true);
  await expect(page.locator('#meters')).toContainText('78%');
  expect(errors).toEqual([]);
});

test('dev event spawning remains usable on narrow screens without opening new panels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?referenceTown=1');
  await page.evaluate(() =>
    (window as typeof window & { __modelLoopDebug: {
      trigger: (kind: string, family: number, x: number, y: number) => boolean
    }}).__modelLoopDebug.trigger('flowers', 1, 9, 3)
  );
  await expect(page.locator('#household-list')).toBeVisible();
  await expect(page.locator('#shop-section')).toBeInViewport();
  await expect(page.locator('#notice')).toContainText('flowers');
});
