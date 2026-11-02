import { test, expect, type Page } from '@playwright/test';

const screens = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'compact laptop', width: 1024, height: 768 },
  { label: 'tablet portrait', width: 768, height: 1024 },
  { label: 'small phone', width: 320, height: 568 },
  { label: 'phone portrait', width: 390, height: 844 },
  { label: 'phone landscape', width: 844, height: 390 },
  { label: 'short desktop', width: 1366, height: 640 }
];

async function pointOnTown(page: Page, x: number, y: number) {
  const rect = await page.locator('#game-container canvas').boundingBox();
  if (!rect) throw new Error('Missing canvas');
  return {
    x: rect.x + (60 + (x + 0.5) * 43) / 1152 * rect.width,
    y: rect.y + (48 + (y + 0.5) * 43) / 620 * rect.height
  };
}

for (const screen of screens) {
  test('adapts to ' + screen.label + ' (' + screen.width + 'x' + screen.height + ')', async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('.model-box')).toHaveCount(5);
    await expect(page.locator('.household-ticket')).toHaveCount(6);
    await expect(page.locator('.meter')).toHaveCount(4);

    const geometry = await page.evaluate(() => {
      const get = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error('Missing element: ' + selector);
        const r = el.getBoundingClientRect();
        return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
      };
      const pan = document.getElementById('town-pan')!;
      return {
        docWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        header: get('.topbar'), brand: get('.brand'),
        era: get('.era-mark'), meters: get('.meters'),
        controls: get('.top-controls'), shop: get('#shop-section'),
        roster: get('.households-shelf'),
        board: get('.world-frame'),
        canvas: get('#game-container canvas'),
        pan: get('#town-pan'),
        panScrollWidth: pan.scrollWidth, panClientWidth: pan.clientWidth,
        shopPosition: getComputedStyle(document.getElementById('shop-section')!).position
      };
    });
    expect(geometry.docWidth, 'Page must not scroll sideways').toBeLessThanOrEqual(screen.width + 2);
    for (const key of ['brand', 'era', 'meters', 'controls'] as const) {
      expect(geometry[key].x, key + ' starts inside screen').toBeGreaterThanOrEqual(-2);
      expect(geometry[key].right, key + ' must not overflow').toBeLessThanOrEqual(screen.width + 2);
    }
    expect(geometry.board.width).toBeGreaterThanOrEqual(Math.min(300, screen.width - 15));
    expect(geometry.canvas.width).toBeGreaterThan(250);
    expect(geometry.canvas.height).toBeGreaterThan(130);
    expect(geometry.shop.width).toBeGreaterThanOrEqual(screen.width - 24);

    if (screen.width <= 1100 || screen.height <= 720) {
      expect(geometry.shopPosition).toBe('fixed');
      expect(geometry.shop.bottom).toBeLessThanOrEqual(screen.height + 2);
      expect(geometry.shop.y).toBeGreaterThan(0);
      const firstBox = await page.locator('.model-box').first().boundingBox();
      if (!firstBox) throw new Error('Kit box not visible');
      expect(firstBox.y).toBeGreaterThanOrEqual(geometry.shop.y - 2);
      expect(firstBox.bottom).toBeLessThanOrEqual(geometry.shop.bottom + 1);
    } else {
      expect(geometry.shopPosition).not.toBe('fixed');
      expect(geometry.shop.y).toBeGreaterThanOrEqual(geometry.board.y);
    }

    if (screen.width <= 700) {
      expect(geometry.panScrollWidth).toBeGreaterThan(geometry.panClientWidth + 100);
      await expect(page.locator('.town-pan-hint')).toBeVisible();
      const scroll = await page.locator('#town-pan').evaluate((el) => {
        el.scrollLeft = 100000;
        return (el as HTMLElement).scrollLeft;
      });
      expect(scroll).toBeGreaterThan(90);
      await page.locator('#town-pan').evaluate(el => { el.scrollLeft = 0; });
    }
    expect(errors).toEqual([]);
  });
}

test('phone touch swipes do not accidentally purchase a selected miniature', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Select Gas Lamppost/ }).click();
  const pan = page.locator('#town-pan');
  const start = await pointOnTown(page, 5, 5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 70, start.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#coins')).toHaveText('145');
  // The model remains selected after a swipe; an intentional tap can place it.
  await expect(page.locator('#placement-status')).toContainText('Gas Lamppost is ready');
  const target = await pointOnTown(page, 4, 4);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#coins')).toHaveText('110');
  await expect(pan).toBeVisible();
});

test('switching from phone to laptop refreshes Phaser scale without breaking placement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const before = await page.locator('#game-container canvas').boundingBox();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => {
    const rect = await page.locator('#game-container canvas').boundingBox();
    return rect?.width ?? 0;
  }).toBeGreaterThan(900);
  const after = await page.locator('#game-container canvas').boundingBox();
  expect((after?.width ?? 0)).toBeGreaterThan((before?.width ?? 0));
  await page.getByRole('button', { name: /Select Oak Tree/ }).click();
  const target = await pointOnTown(page, 4, 4);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#coins')).toHaveText('105');
  expect(errors).toEqual([]);
});
