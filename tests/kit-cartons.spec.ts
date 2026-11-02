import { test, expect, type Page } from '@playwright/test';

/**
 * Pass 7C acceptance gate: actual DOM geometry of a physical model carton,
 * genuine Phaser SVG texture sharing, and real-size screenshots.
 *
 * A green test suite does not replace checking the screenshots against the
 * original concept: a top/front/right face and a recessed mini must be visible.
 */
const viewports = [
  {name:'desktop',width:1440,height:900},
  {name:'compact-laptop',width:1266,height:548},
  {name:'phone',width:390,height:844},
  {name:'small-phone',width:320,height:568},
  {name:'landscape-phone',width:844,height:390}
] as const;

type MiniatureSnapshot = {
  loaded:string[];
  placed:{cell:string;texture:string;alpha:number}[];
  ghost:{texture:string;visible:boolean;alpha:number};
};

async function snapshot(page:Page): Promise<MiniatureSnapshot> {
  return page.evaluate(()=>{
    const win=window as typeof window & {
      __modelLoopDebug?:{miniatureArt:()=>MiniatureSnapshot}
    };
    if(!win.__modelLoopDebug)throw Error('Development art diagnostics missing');
    return win.__modelLoopDebug.miniatureArt();
  });
}

test('all six physical cartons use one accessible model control and three real carton planes',
  async({page})=>{
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');
    const kits=page.locator('.model-box.kit-carton');
    await expect(kits).toHaveCount(6);
    const models=['lamp','tree','bench','limit','police','bin'];
    for(let i=0;i<models.length;i++){
      const kit=kits.nth(i);
      await expect(kit).toHaveAttribute('data-model',models[i]);
      await expect(kit).toHaveAttribute('aria-pressed','false');
      await expect(kit.locator('.kit-front-face')).toHaveCount(1);
      await expect(kit.locator('.kit-top-face')).toHaveCount(1);
      await expect(kit.locator('.kit-side-face')).toHaveCount(1);
      await expect(kit.locator('.kit-front-print')).toHaveCount(1);
      await expect(kit.locator('.display-window > svg.miniature-svg')).toHaveCount(1);
      await expect(kit.locator('.kit-window-cavity')).toHaveCount(1);
      await expect(kit.locator('.kit-window-rim')).toHaveCount(1);
      await expect(kit.locator('.kit-effect')).toHaveCount(3);
      await expect(kit.locator('.kit-effect .vintage-icon')).toHaveCount(3);
      await expect(kit.locator('.box-cost')).toBeVisible();
      await expect(kit.locator('.box-upkeep')).toContainText('/ 20s');
      // A single semantic control, no nested buttons that break dragging.
      await expect(kit.locator('button')).toHaveCount(0);
    }
    const data=await kits.evaluateAll(elements=>elements.map(el=>{
      const front=el.querySelector<HTMLElement>('.kit-front-face')!;
      const side=el.querySelector<HTMLElement>('.kit-side-face')!;
      const top=el.querySelector<HTMLElement>('.kit-top-face')!;
      const hole=el.querySelector<HTMLElement>('.box-hole')!;
      return {
        face:getComputedStyle(front).backgroundImage,
        side:getComputedStyle(side).clipPath,
        top:getComputedStyle(top).clipPath,
        width:side.getBoundingClientRect().width,
        topHeight:top.getBoundingClientRect().height,
        holeWidth:hole.getBoundingClientRect().width
      };
    }));
    expect(data.every(row=>row.face!=='none'&&row.side.startsWith('polygon')&&
      row.top.startsWith('polygon')&&row.width>=9&&row.topHeight>=9)).toBe(true);
    // The punch hole is present in the horizontal boxed products.
    expect(data[0].holeWidth).toBeGreaterThan(18);
    expect(errors).toEqual([]);
  });

test('the six showroom SVGs have distinct era-specific detail and are cached as Phaser textures',
  async({page})=>{
    await page.goto('/');
    const art=await page.evaluate(async()=>{
      const {miniatureSvg,miniatureDataUri,modelArtIdentifiers}=await import('/src/ui/modelArt.ts');
      return modelArtIdentifiers.map(id=>{
        const svg=miniatureSvg(id);
        const uri=miniatureDataUri(id);
        return {id,svg,uri,elements:(svg.match(/<(path|circle|ellipse|text|line|rect)\b/g)||[]).length};
      });
    });
    expect(art).toHaveLength(6);
    expect(new Set(art.map(item=>item.svg)).size).toBe(6);
    for(const row of art){
      expect(row.svg).toContain('viewBox="0 0 130 104"');
      expect(row.svg).toContain('display plinth');
      expect(row.elements).toBeGreaterThan(13);
      expect(row.uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
      expect(Buffer.from(row.uri.split(',')[1],'base64').toString('utf8')).toBe(row.svg);
    }
    // The period speed notice and constable post must not retain cheap modern
    // 20-in-a-red-circle or blue police telephone box silhouettes.
    expect(art.find(a=>a.id==='limit')!.svg).toContain('MOTOR CARS');
    expect(art.find(a=>a.id==='police')!.svg).toContain('CONSTABLE');
    const state=await snapshot(page);
    expect(state.loaded.sort()).toEqual(['bench','bin','lamp','limit','police','tree']);
    expect(state.placed).toHaveLength(0);
  });

test('purchased model and placement ghost are the SAME cached illustration as in the box',
  async({page})=>{
    await page.goto('/');
    const before=await snapshot(page);
    expect(before.loaded).toHaveLength(6);
    await page.getByRole('button',{name:/Select Gas Lamppost/}).click();
    const canvas=page.locator('#game-container canvas');
    const rect=await canvas.boundingBox();
    if(!rect)throw Error('Game did not initialize');
    const screenX=rect.x+(60+4.5*43)/1152*rect.width;
    const screenY=rect.y+(48+4.5*43)/620*rect.height;
    await page.mouse.move(screenX,screenY);
    const ghost=await snapshot(page);
    expect(ghost.ghost.texture).toBe('vintage-miniature-lamp');
    expect(ghost.ghost.visible).toBe(true);
    await page.mouse.click(screenX,screenY);
    await expect(page.locator('#coins')).toHaveText('110');
    const placed=await snapshot(page);
    expect(placed.placed).toEqual([{
      cell:'4,4',texture:'vintage-miniature-lamp',alpha:1
    }]);
    await expect(page.locator('#tile-panel')).toContainText('MODEL CARE');
    // No value, purchase, placement or condition behaviour changed.
    await expect(page.getByRole('button',{name:/Select Oak Tree/})).toHaveAttribute('aria-pressed','false');
  });

for(const view of viewports){
  test('real physical kit shelf at '+view.name+' remains readable and takes a screenshot',
    async({page})=>{
      const errors:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setViewportSize({width:view.width,height:view.height});
      await page.goto('/');
      await page.locator('#game-container canvas').waitFor({state:'visible'});
      const all=page.locator('.model-box.kit-carton');
      await expect(all).toHaveCount(6);
      const kit=all.first();
      const g=await kit.evaluate(el=>{
        const find=(sel:string)=>{
          const r=el.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
          return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
        };
        return {box:el.getBoundingClientRect().toJSON(),
          front:find('.kit-front-face'),side:find('.kit-side-face'),
          top:find('.kit-top-face'),window:find('.display-window'),
          cost:find('.box-cost'),title:find('.box-title'),
          panel:find('.kit-ledger')};
      });
      expect(g.front.width).toBeGreaterThan(115);
      expect(g.top.height).toBeGreaterThan(7);
      expect(g.side.width).toBeGreaterThanOrEqual(9);
      expect(g.window.width).toBeGreaterThan(view.width>=900&&view.height<=850?85:49);
      expect(g.window.height).toBeGreaterThan(view.width>=900&&view.height<=850?84:48);
      expect(g.cost.right).toBeLessThanOrEqual(g.front.right+3);
      expect(g.title.right).toBeLessThanOrEqual(g.front.right+3);
      expect(g.panel.right).toBeLessThanOrEqual(g.front.right+3);
      const shop=page.locator('#shop-section');
      await shop.scrollIntoViewIfNeeded();
      // Screenshots of actual working layouts, not a zoomed isolated mockup.
      await shop.screenshot({path:'test-results/visual-review/7c-'+view.name+
        '-cartons.png',animations:'disabled'});
      // Compact 1266px shelf retains all six selectable after vertical scroll.
      if(view.width>=900&&view.height<=850){
        await page.locator('#shop').evaluate(el=>{el.scrollTop=el.scrollHeight;});
        await page.getByRole('button',{name:/Select Cast-Iron Rubbish Bin/}).click();
        await expect(page.locator('#placement-status')).toContainText('Cast-Iron Rubbish Bin is ready');
      }
      expect(errors).toEqual([]);
    });
}

test('kit selection, prices, keyboard focus, reduced motion and drag semantics remain intact',
  async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/');
    const lamp=page.getByRole('button',{name:/Select Gas Lamppost/});
    await expect(lamp).toContainText('35');
    await lamp.focus();
    const style=await lamp.evaluate(el=>{
      const cs=getComputedStyle(el);
      return {outline:cs.outlineWidth,transition:cs.transitionDuration,
        draggable:el.getAttribute('draggable')};
    });
    expect(parseFloat(style.outline)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(style.transition)).toBeLessThanOrEqual(.0001);
    expect(style.draggable).toBe('true');
    await lamp.press('Enter');
    await expect(lamp).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.model-box.selected .kit-window-stamp')).toContainText('LIFTED');
    await expect(page.locator('#coins')).toHaveText('145');
  });
