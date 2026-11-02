import { test, expect } from '@playwright/test';

test('screen readers receive important events but not a live update for every lap',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#event-announcement')).toHaveAttribute('role','status');
  await expect(page.locator('#event-announcement')).toHaveAttribute('aria-atomic','true');
  await expect(page.locator('#tile-panel')).not.toHaveAttribute('aria-live','polite');
  await expect(page.locator('#notice')).not.toHaveAttribute('aria-live','polite');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.finishLap(0);
  });
  await expect(page.locator('#notice')).toContainText('completed a circuit');
  await expect(page.locator('#event-announcement')).toBeEmpty();
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.debugHouseholdAction(4,'display',{x:4,y:3});
  });
  await expect(page.locator('#event-announcement')).toContainText('Hales');
  const remembered=await page.locator('#event-announcement').textContent();
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.finishLap(1);
  });
  // Incoming routine money does not overwrite an important roadside event.
  await expect(page.locator('#notice')).toContainText('Hales');
  expect(await page.locator('#event-announcement').textContent()).toBe(remembered);
});

test('reduced-motion setting keeps incidents readable with no uncaught rendering errors',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1266,height:548});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  expect(await page.evaluate(()=>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('#shop-section')).toBeVisible();
  const action=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.debugHouseholdAction(1,'flowers',{x:4,y:3});
  });
  expect(action).toBe(true);
  await expect(page.locator('#event-announcement')).toContainText('Bells');
  await expect(page.locator('#notice')).toContainText('flowers');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test('workbench reveals three distinct grounded notes and audited run totals',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    for(let index=0;index<27;index++)store.finishLap(index%6);
    store.toggleWorkshop();
  });
  await expect(page.locator('.workbench-diary')).toBeVisible();
  await page.locator('.workbench-diary summary').click();
  await expect(page.locator('.workbench-diary li')).toHaveCount(3);
  await expect(page.locator('.workbench-diary')).toContainText('25% Progress');
  await expect(page.locator('.workbench-diary')).toContainText('50% Progress');
  await expect(page.locator('.workbench-diary')).toContainText('75% Progress');
  await page.locator('.workbench-ledger summary').click();
  await expect(page.locator('.workbench-ledger')).toContainText('Car circuits');
  await expect(page.locator('.workbench-ledger')).toContainText('Earned from circuits');
  await expect(page.locator('.workbench-ledger')).toContainText('27');
  await expect(page.locator('.workbench-ledger')).toContainText('only the last 60 seconds');
  await expect(page.locator('[data-action="workshop"]')).toBeVisible();
});

test('end-of-chapter story responds to town actions and does not change Blueprint rewards',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const starting=store.legacy.blueprints;
    store.debugHouseholdAction(2,'litter',{x:4,y:3});
    store.place({x:4,y:4},'bin');
    store.debugHouseholdAction(2,'litter',{x:4,y:3});
    store.debugHouseholdAction(2,'litter',{x:4,y:3});
    store.debugHouseholdAction(2,'litter',{x:4,y:3});
    store.endRun(true);
    return {saved:store.legacy.blueprints-starting,closed:store.closedHomes,
      closing:store.closingLine,summary:store.runSummary};
  });
  expect(result.saved).toBe(32);
  expect(result.summary.capturedPackaging).toBe(3);
  expect(result.closing).toContain('paper broom');
  await expect(page.locator('.story-coda')).toContainText('paper broom');
  await expect(page.locator('.result-grid')).toContainText('32');
});

test('workbench and readable incident feedback fit a narrow phone screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    for(let index=0;index<9;index++)store.finishLap(index%6);
    store.toggleWorkshop();
  });
  await expect(page.locator('.workbench-diary summary')).toBeVisible();
  await page.locator('.workbench-diary summary').click();
  await expect(page.locator('.workbench-diary li')).toHaveCount(1);
  await page.locator('.workbench-ledger summary').click();
  await expect(page.locator('.workbench-ledger dl')).toBeVisible();
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
});
