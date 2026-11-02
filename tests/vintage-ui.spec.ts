import { test, expect } from '@playwright/test';

/**
 * These are actual DOM + Phaser render checks, not tests of the original
 * mockup. A review screenshot is attached for approval before merging 7B.
 */
const views = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'compact-laptop', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 }
] as const;

test('Vintage instruments use one coherent engraved icon family and preserve real gauge values',
  async ({page}) => {
    await page.goto('/');
    const header=page.locator('.vintage-header');
    await expect(header).toBeVisible();
    // No decorative drawing may overlay the actual title text.
    await expect(header.locator('.vintage-brand-car')).toHaveCount(0);
    await expect(header.locator('.vintage-era-flourish')).toHaveCount(1);
    await expect(header.locator('.vintage-frame-corners')).toHaveCount(3);
    await expect(page.locator('#meters .meter')).toHaveCount(4);
    await expect(page.locator('#meters .meter .vintage-icon')).toHaveCount(4);
    await expect(page.locator('#meters .meter-graticule')).toHaveCount(3);
    await expect(page.locator('#meters .flow-graticule')).toHaveCount(1);
    for(const label of ['Progress','Community','Safety']){
      const indicator=page.getByRole('meter',{name:label});
      await expect(indicator).toHaveCount(1);
      await expect(indicator).toHaveAttribute('aria-valuemin','0');
      await expect(indicator).toHaveAttribute('aria-valuemax','100');
      expect(Number(await indicator.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    }
    await expect(page.locator('.balances .vintage-icon-income')).toBeVisible();
    const drawings=await page.locator('#meters .vintage-icon').evaluateAll(nodes=>
      nodes.map(node=>({
        viewBox:node.getAttribute('viewBox'),
        hidden:node.getAttribute('aria-hidden'),
        strokes:node.querySelectorAll('path,circle,ellipse').length
      }))
    );
    expect(drawings.every(d=>d.viewBox==='0 0 32 32'&&d.hidden==='true'&&d.strokes>=2))
      .toBe(true);
    // The Income reading must remain a signed net 60-second cash flow, not the
    // player's wallet, and all values continue to update from the store.
    await expect(page.locator('#meters .income-meter')).toContainText('/60s');
    await expect(page.locator('#coins')).toHaveText('145');
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.money=127;store.notify();
    });
    await expect(page.locator('#coins')).toHaveText('127');
    await expect(page.getByRole('meter',{name:'Progress'})).toHaveAttribute(
      'aria-valuetext',/\d+%/
    );
  });

test('Selected Tile uses the same fine-line iconography and remains accessible',
  async({page})=>{
    await page.goto('/');
    await expect(page.locator('#tile-panel')).toBeHidden();
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.selectTile({x:6,y:5});
    });
    const panel=page.locator('#tile-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveClass(/vintage-inspector/);
    await expect(panel.locator('.vintage-frame-corners')).toHaveCount(1);
    await expect(panel.locator('.tile-score')).toHaveCount(4);
    for(const label of ['Beauty','Noise','Crime','Road safety']){
      const row=panel.locator('.tile-score').filter({hasText:label});
      await expect(row.locator('.tile-score-name')).toContainText(label);
      await expect(row.locator('svg.vintage-icon[aria-hidden="true"]')).toHaveCount(1);
      await expect(row.locator('b')).toBeVisible();
    }
    const ornament=await panel.locator('.vintage-frame-corners')
      .evaluate(el=>getComputedStyle(el).pointerEvents);
    expect(ornament).toBe('none');
    const close=panel.getByRole('button',{name:'Close square details'});
    await close.focus();
    expect(await close.evaluate(el=>parseFloat(getComputedStyle(el).outlineWidth)))
      .toBeGreaterThanOrEqual(2);
    await close.press('Enter');
    await expect(panel).toBeHidden();
    await page.getByRole('button',{name:/Select Oak Tree/}).click();
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.selectTile({x:6,y:5});
    });
    await expect(panel).toContainText('PLACEMENT PREVIEW');
    await expect(panel.locator('.projected-delta')).toHaveCount(3);
    await expect(panel.locator('.projected-delta svg.vintage-icon')).toHaveCount(3);
  });

for(const view of views){
  test('Vintage art plate fits ' + view.name + ' and captures an actual UI review image',
    async({page})=>{
      await page.setViewportSize({width:view.width,height:view.height});
      await page.goto('/');
      await page.locator('#game-container canvas').waitFor({state:'visible'});
      const header=page.locator('.vintage-header');
      const instruments=page.locator('#meters');
      const art=await page.evaluate(()=>{
        const get=(s:string)=>{
          const el=document.querySelector<HTMLElement>(s)!;
          const rect=el.getBoundingClientRect();
          const style=getComputedStyle(el);
          return {left:rect.left,right:rect.right,width:rect.width,
            height:rect.height,color:style.color,background:style.backgroundColor};
        };
        return {
          viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          brand:get('.vintage-brand'),era:get('.vintage-era'),
          instruments:get('.vintage-instruments'),
          progress:get('#meters .meter'),title:get('.vintage-era strong')
        };
      });
      expect(art.scrollWidth).toBeLessThanOrEqual(view.width+2);
      for(const name of ['brand','era','instruments'] as const){
        expect(art[name].left).toBeGreaterThanOrEqual(-2);
        expect(art[name].right).toBeLessThanOrEqual(view.width+2);
      }
      expect(art.progress.height).toBeGreaterThanOrEqual(31);
      const icons=await instruments.locator('.vintage-icon')
        .evaluateAll(nodes=>nodes.every(node=>{
          const r=node.getBoundingClientRect();
          return r.width>=14&&r.height>=14;
        }));
      expect(icons).toBe(true);
      const readable=await instruments.locator('.meter').evaluateAll(nodes=>
        nodes.map(node=>{
          const title=node.querySelector<HTMLElement>('.meter-label')!;
          const value=node.querySelector<HTMLElement>('.meter-top b')!;
          const text=title.getBoundingClientRect();
          const number=value.getBoundingClientRect();
          const whole=node.getBoundingClientRect();
          return {
            titleScroll:title.scrollWidth,titleWidth:title.clientWidth,
            textRight:text.right,valueLeft:number.left,valueRight:number.right,
            containerRight:whole.right
          };
        })
      );
      for(const item of readable){
        expect(item.titleScroll,'A gauge title must not clip').toBeLessThanOrEqual(item.titleWidth+1);
        expect(item.textRight,'Gauge label/value separation').toBeLessThanOrEqual(item.valueLeft+2);
        expect(item.valueRight,'Numerical value stays in gauge').toBeLessThanOrEqual(item.containerRight+2);
      }
      // A screen-size image is the visual acceptance reference, not a
      // zoomed poster detail where poor real-world legibility can hide.
      await page.screenshot({path:'test-results/visual-review/7b-'+view.name+
        '-hud.png',animations:'disabled'});
      await page.evaluate(async()=>{
        const {store}=await import('/src/game/state.ts');
        store.selectTile({x:6,y:5});
      });
      const panel=page.locator('#tile-panel');
      await expect(panel).toBeVisible();
      await expect(panel.locator('.tile-score')).toHaveCount(4);
      await panel.screenshot({
        path:'test-results/visual-review/7b-'+view.name+'-inspector.png',
        animations:'disabled'
      });
      // Phone and compact screens may position the inspector below the board:
      // preserve the existing scroll behaviour instead of obscuring the road.
      const geometry=await panel.evaluate(el=>{
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        return {position:s.position,width:r.width,height:r.height};
      });
      expect(geometry.width).toBeGreaterThan(view.width<=700?180:140);
      expect(geometry.height).toBeGreaterThan(100);
      if(view.width<=700 || (view.width<=899&&view.height<=490)) {
        expect(geometry.position).toBe('fixed');
        const shop=await page.locator('#shop-section').boundingBox();
        const card=await panel.boundingBox();
        expect(card!.y+card!.height,'Inspector must not hide under the fixed shelf')
          .toBeLessThanOrEqual(shop!.y+1);
      }
      if(view.name==='phone-landscape'){
        // Shopping remains possible with a deliberate vertical scroll; the
        // miniature shelf no longer conceals the entire town at 390px high.
        await page.locator('#shop-section').scrollIntoViewIfNeeded();
        await page.getByRole('button',{name:/Select Gas Lamppost/}).click();
        await expect(page.locator('#placement-status')).toContainText('Gas Lamppost is ready');
      }
      if(view.width<=700) {
        const pause=page.getByRole('button',{name:'Pause'});
        expect((await pause.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        const close=panel.getByRole('button',{name:'Close square details'});
        const rect=await close.boundingBox();
        expect(rect!.width).toBeGreaterThanOrEqual(44);
        expect(rect!.height).toBeGreaterThanOrEqual(44);
      }
    });
}
test('Reduced motion disables decorative gauge animation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const durations=await page.locator('#meters .meter-fill').first()
    .evaluate(el=>getComputedStyle(el).transitionDuration);
  // The global accessibility rule uses 0.01ms !important, which is
  // effectively instantaneous and intentionally takes precedence.
  expect(Number.parseFloat(durations)).toBeLessThanOrEqual(.0001);
});
