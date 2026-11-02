import { test, expect } from '@playwright/test';

test('Vintage scene and controls initialize without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect(page.locator('.meter')).toHaveCount(4);
  await expect(page.locator('.model-box')).toHaveCount(6);
  await expect(page.locator('#tile-panel')).toContainText('Every square tells a story');
  await expect(page.locator('#coins')).toHaveText('145');

  await page.getByRole('button', { name: 'Workshop' }).click();
  await expect(page.getByRole('dialog', { name: 'The family workshop' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to the town' }).click();
  await expect(page.getByRole('dialog', { name: 'The family workshop' })).toHaveCount(0);

  await page.getByRole('button', { name: /Select Gas Lamppost/ }).click();
  await expect(page.getByRole('button', { name: /Select Gas Lamppost/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  expect(errors).toEqual([]);
});
