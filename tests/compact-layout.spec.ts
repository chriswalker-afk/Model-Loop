import { test, expect } from '@playwright/test';

const sizes = [
  {width:1266,height:548},
  {width:1366,height:640},
  {width:1280,height:720},
  {width:1024,height:600}
];

for(const size of sizes){
  test('compact landscape geometry ' + size.width + 'x' + size.height, async ({page}) => {
    await page.setViewportSize(size);
    const errors:string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const metrics = await page.evaluate(() => {
      const get = (s:string) => {
        const el = document.querySelector<HTMLElement>(s)!;
        const r=el.getBoundingClientRect(), cs=getComputedStyle(el);
        return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,
          display:cs.display,position:cs.position,flex:cs.flex,aspectRatio:cs.aspectRatio,
          minHeight:cs.minHeight,maxHeight:cs.maxHeight,overflowY:cs.overflowY};
      };
      return {screen:[innerWidth,innerHeight],header:get('.topbar'),main:get('.main-content'),world:get('.world-frame'),
        town:get('#town-pan'),container:get('#game-container'),canvas:get('#game-container canvas'),tile:get('#tile-panel'),
        shop:get('#shop-section'),box:get('.model-box'),window:get('.display-window'),
        roster:get('.households-shelf')};
    });
    console.log('COMPACT_GEOMETRY',JSON.stringify(metrics));
    await expect(page.locator('#game-container canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
