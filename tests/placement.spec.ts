import { test, expect, type Page } from '@playwright/test';

const view = { width: 1440, height: 900 };
const targetCell = { x: 4, y: 4 }; // Empty and adjacent to the starting road.

async function locationOf(page: Page, x: number, y: number) {
  const rect = await page.locator('#game-container canvas').boundingBox();
  if (!rect) throw new Error('The Phaser canvas did not render');
  const tile = 43;
  return {
    x: rect.x + (60 + (x + .5) * tile) / 1152 * rect.width,
    y: rect.y + (48 + (y + .5) * tile) / 620 * rect.height
  };
}

test('docked model kits and world remain visible on a laptop without scrolling', async ({ page }) => {
  await page.setViewportSize(view);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect(page.locator('.model-box')).toHaveCount(5);
  await expect(page.locator('.box-cost')).toHaveCount(5);
  await expect(page.locator('.display-window svg')).toHaveCount(5);
  const shop = await page.locator('#shop-section').boundingBox();
  const world = await page.locator('.world-frame').boundingBox();
  const firstBox = await page.locator('.model-box').first().boundingBox();
  if (!shop || !world || !firstBox) throw new Error('Expected visible shop, world and first miniature box');
  expect(world.y).toBeGreaterThanOrEqual(0);
  expect(world.height).toBeGreaterThan(280);
  expect(shop.y).toBeGreaterThan(world.y);
  expect(shop.y + shop.height).toBeLessThanOrEqual(view.height);
  expect(firstBox.y + firstBox.height).toBeLessThanOrEqual(shop.y + shop.height);
  expect(errors).toEqual([]);
});

test('hover preview describes impacts, click purchases and invalid squares do not charge', async ({ page }) => {
  await page.setViewportSize(view);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const lamp = page.getByRole('button', { name: /Select Gas Lamppost/ });
  await lamp.click();
  await expect(lamp).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#placement-status')).toContainText('Gas Lamppost is ready');
  const point = await locationOf(page, targetCell.x, targetCell.y);
  await page.mouse.move(point.x, point.y);
  const panel = page.locator('#tile-panel');
  await expect(panel).toContainText('PLACEMENT PREVIEW');
  await expect(panel).toContainText('READY TO PLACE');
  await expect(panel.locator('.projected-delta')).toHaveCount(3);
  await expect(panel).toContainText('6 household cars');
  await expect(panel).toContainText('Estimated irritation change per lap');
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#coins')).toHaveText('110');
  await expect(panel).toContainText('Gas Lamppost');
  await expect(page.locator('#placement-status')).toContainText('Choose a miniature');

  await page.getByRole('button', { name: /Select Oak Tree/ }).click();
  const road = await locationOf(page, 3, 3);
  await page.mouse.move(road.x, road.y);
  await expect(panel).toContainText('CANNOT PLACE HERE');
  await page.mouse.click(road.x, road.y);
  await expect(page.locator('#coins')).toHaveText('110');
  await page.keyboard.press('Escape');
  await expect(page.locator('#placement-status')).toContainText('Choose a miniature');
  expect(errors).toEqual([]);
});

test('native drag and drop can place a model taken from its box', async ({ page }) => {
  await page.setViewportSize(view);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const canvas = page.locator('#game-container canvas');
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Canvas missing');
  const point = await locationOf(page, targetCell.x, targetCell.y);
  await page.locator('[data-model="tree"]').dragTo(canvas, {
    targetPosition: { x: point.x - rect.x, y: point.y - rect.y }
  });
  await expect(page.locator('#coins')).toHaveText('105');
  await expect(page.locator('#tile-panel')).toContainText('Oak Tree');
  await expect(page.locator('#placement-status')).toContainText('Choose a miniature');
  expect(errors).toEqual([]);
});

test('on narrow screens the model-kit dock stays available while the town remains interactive', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect(page.locator('#shop-section')).toBeInViewport();
  await expect(page.locator('.model-box').first()).toBeInViewport();
  await page.getByRole('button', { name: /Select Gas Lamppost/ }).click();
  const point = await locationOf(page, targetCell.x, targetCell.y);
  console.log('MOBILE_POINT_PREVIEW', JSON.stringify(await page.evaluate(({ x, y }) => {
    const under = document.elementFromPoint(x,y);
    const canvas = document.querySelector('#game-container canvas');
    const pan = document.getElementById('town-pan');
    return {
      x,y, target: under?.tagName, targetId: under?.id,
      underCanvas: under === canvas, canvas: canvas?.getBoundingClientRect().toJSON(),
      scrollY:window.scrollY, panLeft:pan?.scrollLeft, panWidth:pan?.clientWidth,
      panContentWidth:pan?.scrollWidth
    };
  }, point)));
  await page.mouse.move(point.x, point.y);
  console.log('MOBILE_HOVER_PREVIEW', JSON.stringify(await page.evaluate(async () => {
    const {store} = await import('/src/game/state.ts');
    return {hovered:store.hovered, activeModel:store.activeModel, selected:store.selected};
  })));
  await expect(page.locator('#tile-panel')).toContainText('READY TO PLACE');
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#coins')).toHaveText('110');
});
