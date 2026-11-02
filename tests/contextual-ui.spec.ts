import { test, expect, type Page } from '@playwright/test';

async function tilePoint(page: Page,x:number,y:number) {
  const r=await page.locator('#game-container canvas').boundingBox();
  if (!r) throw new Error('Missing town canvas');
  return {
    x:r.x+(60+(x+.5)*43)/1152*r.width,
    y:r.y+(48+(y+.5)*43)/620*r.height
  };
}

for(const screen of [
  {label:'large desktop',width:1440,height:900},
  {label:'short screenshot laptop',width:1266,height:548},
  {label:'compact laptop',width:1024,height:600},
  {label:'tablet',width:768,height:1024},
  {label:'phone',width:390,height:844},
  {label:'small phone',width:320,height:568}
]) {
  test('title fits and no tile inspector obscures the town at '+screen.label,
    async({page})=>{
      await page.setViewportSize(screen);
      const errors:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('/');
      await expect(page.locator('#tile-panel')).toBeHidden();
      await expect(page.locator('#tile-peek')).toBeHidden();
      await expect(page.locator('.brand-sub')).toHaveCount(0);
      await expect(page.locator('.brand-name')).toContainText('THE GENERATIONAL');
      await expect(page.locator('.brand-name')).toContainText('CYCLE');
      const sizes=await page.evaluate(()=>{
        const rect=(s:string)=>document.querySelector(s)!.getBoundingClientRect();
        const title=rect('.brand-name');
        const era=rect('.era-mark');
        const lines=[...document.querySelectorAll<HTMLElement>('.brand-name .brand-line')];
        const overlap=Math.max(0,Math.min(title.right,era.right)-Math.max(title.left,era.left))*
          Math.max(0,Math.min(title.bottom,era.bottom)-Math.max(title.top,era.top));
        return {
          overlap,docWidth:document.documentElement.scrollWidth,
          lines:lines.map(e=>({scroll:e.scrollWidth,available:e.clientWidth,visible:
            getComputedStyle(e).display!=='none'}))
        };
      });
      expect(sizes.overlap).toBe(0);
      expect(sizes.docWidth).toBeLessThanOrEqual(screen.width+2);
      expect(sizes.lines).toHaveLength(2);
      for(const line of sizes.lines){
        expect(line.visible).toBe(true);
        expect(line.scroll).toBeLessThanOrEqual(line.available+1);
      }
      expect(errors).toEqual([]);
    }
  );
}

test('600ms sustained hover displays a small nonblocking hint, never the full inspector',async({page})=>{
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  const panel=page.locator('#tile-panel');
  const peek=page.locator('#tile-peek');
  const point=await tilePoint(page,4,4);
  await page.mouse.move(point.x,point.y);
  await page.waitForTimeout(220);
  await expect(panel).toBeHidden();
  await expect(peek).toBeHidden();
  await expect(peek).toContainText('Grass tile');
  await expect(peek).toContainText('Click for details');
  await expect(panel).toBeHidden();
  const metrics=await page.evaluate(()=>{
    const hint=document.getElementById('tile-peek')!.getBoundingClientRect();
    const frame=document.querySelector('.world-frame')!.getBoundingClientRect();
    return {w:hint.width,h:hint.height,x:hint.x,y:hint.y,
      left:frame.left,right:frame.right,top:frame.top,bottom:frame.bottom,
      pointer:getComputedStyle(document.getElementById('tile-peek')!).pointerEvents};
  });
  expect(metrics.w).toBeLessThan(235);
  expect(metrics.h).toBeLessThan(90);
  expect(metrics.pointer).toBe('none');
  expect(metrics.x).toBeGreaterThanOrEqual(metrics.left);
  expect(metrics.x+metrics.w).toBeLessThanOrEqual(metrics.right+2);
  expect(metrics.y).toBeGreaterThanOrEqual(metrics.top);
  expect(metrics.y+metrics.h).toBeLessThanOrEqual(metrics.bottom+2);
  await page.mouse.move(0,0);
  await expect(peek).toBeHidden();
  await expect(panel).toBeHidden();
});

test('clicking opens complete square details; X and Escape dismiss them',async({page})=>{
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  const panel=page.locator('#tile-panel'),peek=page.locator('#tile-peek');
  const point=await tilePoint(page,4,4);
  await page.mouse.click(point.x,point.y);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Grass tile');
  await expect(panel).toContainText('Beauty');
  await expect(panel).toContainText('Noise');
  await expect(panel).toContainText('Road safety');
  await expect(peek).toBeHidden();
  await page.getByRole('button',{name:'Close square details'}).click();
  await expect(panel).toBeHidden();
  await expect(peek).toBeHidden();
  await page.mouse.click(point.x,point.y);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('click-to-inspect persists across hover movement until explicitly closed',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.mouse.click(...Object.values(await tilePoint(page,4,4)) as [number,number]);
  const panel=page.locator('#tile-panel');
  await expect(panel).toContainText('Grass tile');
  const next=await tilePoint(page,8,3);
  await page.mouse.move(next.x,next.y);
  await page.waitForTimeout(750);
  await expect(panel).toContainText('Grass tile');
  await expect(page.locator('#tile-peek')).toBeHidden();
  await page.mouse.click(next.x,next.y);
  await expect(panel).toContainText('Road tile');
});

test('hold hover for short model cue; Shift+click shows full forecast without buying',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.getByRole('button',{name:/Select Speed Sign/}).click();
  const point=await tilePoint(page,4,4);
  const panel=page.locator('#tile-panel'),peek=page.locator('#tile-peek');
  await page.mouse.move(point.x,point.y);
  await expect(peek).toContainText('READY TO PLACE');
  await expect(peek).toContainText('Speed Sign');
  await expect(panel).toBeHidden();
  await page.keyboard.down('Shift');
  await page.mouse.click(point.x,point.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('#coins')).toHaveText('145');
  await expect(panel).toContainText('PLACEMENT PREVIEW');
  await expect(panel).toContainText('6 household cars');
  await expect(panel.locator('.projected-delta')).toHaveCount(3);
  await expect(panel.locator('.behaviour-forecast summary')).toBeVisible();
  await expect(peek).toBeHidden();
  await page.mouse.click(point.x,point.y);
  await expect(page.locator('#coins')).toHaveText('115');
  await expect(panel).toContainText('MODEL CARE');
});

test('phone has no mouse hover tooltip, but a tap still opens full details',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const point=await tilePoint(page,4,4);
  const panel=page.locator('#tile-panel'),peek=page.locator('#tile-peek');
  await page.mouse.move(point.x,point.y);
  await page.waitForTimeout(720);
  await expect(peek).toBeHidden();
  await expect(panel).toBeHidden();
  await page.mouse.click(point.x,point.y);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Grass tile');
  await expect(panel.getByRole('button',{name:'Close square details'})).toBeVisible();
});
