import { test, expect } from '@playwright/test';

const sizes = [
  { width: 1266, height: 548 }, // user's actual cramped short-window screenshot
  { width: 1366, height: 640 },
  { width: 1280, height: 720 },
  { width: 1024, height: 600 }
];

for (const size of sizes) {
  test('short landscape workspace remains readable at ' + size.width + 'x' + size.height,
    async ({ page }) => {
      await page.setViewportSize(size);
      const errors:string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      const canvas = page.locator('#game-container canvas');
      await expect(canvas).toBeVisible();
      await expect(page.locator('.model-box')).toHaveCount(6);
      await page.waitForTimeout(250); // allow Phaser's observed FIT scale to settle

      const g = await page.evaluate(() => {
        const get = (s:string) => {
          const element = document.querySelector<HTMLElement>(s)!;
          const rect=element.getBoundingClientRect(), cs=getComputedStyle(element);
          return { x:rect.x, y:rect.y, right:rect.right, bottom:rect.bottom,
            width:rect.width,height:rect.height,
            display:cs.display,position:cs.position, fontSize:cs.fontSize };
        };
        const shopTrack=document.querySelector<HTMLElement>('.shop-track')!;
        return {
          header:get('.topbar'), main:get('.main-content'), world:get('.world-frame'),
          town:get('#town-pan'), container:get('#game-container'),
          canvas:get('#game-container canvas'), panel:get('#tile-panel'),
          shop:get('#shop-section'), roster:get('.households-shelf'),
          kit:get('.model-box'), window:get('.display-window'),
          title:get('.model-box .box-title'), cost:get('.model-box .box-cost'),
          effects:get('.model-box .box-effects'), upkeep:get('.model-box .box-upkeep'),
          shopScroll:shopTrack.scrollHeight,shopHeight:shopTrack.clientHeight,
          pageScrollX:document.documentElement.scrollWidth
        };
      });
      console.log('SHORT_WORKSPACE',size.width+'x'+size.height,
        JSON.stringify({board:g.canvas.width,boardHeight:g.canvas.height,shop:g.shop.width,
          shopPosition:g.shop.position,card:g.kit.height,window:g.window.height}));

      expect(g.pageScrollX).toBeLessThanOrEqual(size.width + 2);
      expect(g.world.width).toBeGreaterThan(size.width * .5);
      expect(g.canvas.width).toBeGreaterThan(size.width >= 1200 ? 700 : 570);
      expect(g.canvas.height).toBeGreaterThan(290);
      expect(g.shop.position).not.toBe('fixed');
      expect(g.shop.x).toBeGreaterThanOrEqual(g.world.right + 4);
      expect(g.shop.bottom).toBeLessThanOrEqual(size.height + 1);
      expect(g.roster.y).toBeGreaterThanOrEqual(g.world.y);
      expect(g.roster.bottom).toBeLessThanOrEqual(size.height + 1);
      expect(g.shopScroll).toBeGreaterThan(g.shopHeight + 80);

      // The model is in a large illustrated window next to the printed text.
      // Neither the titles nor the costs may spill into the window.
      expect(g.kit.width).toBeGreaterThan(270);
      expect(g.kit.height).toBeGreaterThanOrEqual(120);
      expect(g.window.width).toBeGreaterThan(85);
      expect(g.window.height).toBeGreaterThan(85);
      expect(g.title.x).toBeGreaterThanOrEqual(g.window.right + 1);
      expect(g.title.right).toBeLessThanOrEqual(g.kit.right);
      expect(g.title.bottom).toBeLessThan(g.cost.y + 3);
      expect(parseFloat(g.title.fontSize)).toBeGreaterThanOrEqual(14);
      expect(g.upkeep.bottom).toBeLessThanOrEqual(g.kit.bottom + 2);

      // A decorative empty inspector must not obscure the road.
      expect(g.panel.display).toBe('none');
      expect(errors).toEqual([]);
    });
}

test('compact landscape model selection and care inspection stay usable', async ({page}) => {
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  await page.getByRole('button',{name:/Select Oak Tree/}).click();
  const rect=await page.locator('#game-container canvas').boundingBox();
  if(!rect) throw new Error('Game canvas missing');
  const point = {
    x:rect.x+(60+4.5*43)/1152*rect.width,
    y:rect.y+(48+4.5*43)/620*rect.height
  };
  await page.mouse.move(point.x,point.y);
  await expect(page.locator('#tile-panel')).toContainText('READY TO PLACE');
  await page.mouse.click(point.x,point.y);
  await expect(page.locator('#coins')).toHaveText('105');
  await expect(page.locator('#tile-panel')).toContainText('MODEL CARE');
  await page.locator('#tile-panel [data-care="economy"]').click();
  await expect(page.locator('#tile-panel [data-care="economy"]')).toHaveAttribute('aria-pressed','true');
});


test('last collectible kit remains selectable after scrolling the short-window side shelf', async ({page}) => {
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  const shelf=page.locator('.shop-track');
  await shelf.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  expect(await shelf.evaluate(el=>el.scrollTop)).toBeGreaterThan(160);
  await page.getByRole('button',{name:/Select Police Box/}).click();
  await expect(page.locator('#placement-status')).toContainText('Police Box is ready');
  const rect=await page.locator('#game-container canvas').boundingBox();
  if(!rect)throw new Error('Town canvas missing');
  const x=rect.x+(60+4.5*43)/1152*rect.width;
  const y=rect.y+(48+4.5*43)/620*rect.height;
  await page.mouse.click(x,y);
  await expect(page.locator('#coins')).toHaveText('90');
  await expect(page.locator('#tile-panel')).toContainText('MODEL CARE');
});
