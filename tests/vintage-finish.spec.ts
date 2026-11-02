import {test,expect,type Page} from '@playwright/test';

type ArtSnapshot={
  loaded:string[];
  sprites:Array<{id:string;texture:string;x:number;y:number;
    alpha:number;depth:number;width:number;height:number}>;
  environmentCount:number;activityCount:number;incidentCount:number;
};
async function art(page:Page):Promise<ArtSnapshot>{
  return page.evaluate(()=>{
    const debug=(window as typeof window & {
      __modelLoopDebug?:{eventArt:()=>ArtSnapshot}
    }).__modelLoopDebug;
    if(!debug)throw Error('Visual diagnostics unavailable');
    return debug.eventArt();
  });
}
async function ready(page:Page):Promise<void>{
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect.poll(async()=>(await art(page)).loaded.length,{timeout:15000})
    .toBe(22);
}

test('every activity, roadside trace, condition and care engraving is valid distinct XML',
  async({page})=>{
    await page.goto('/');
    const result=await page.evaluate(async()=>{
      const {eventArtIds,eventSvg,eventDataUri,eventUiIcon,traceKinds,
        activityKinds}=await import('/src/ui/vintageEventArt.ts');
      const parser=new DOMParser();
      return { ids:eventArtIds,trace:traceKinds,activities:activityKinds,
        drawings:eventArtIds.map(id=>({
          id,svg:eventSvg(id),uri:eventDataUri(id),dom:eventUiIcon(id),
          parseError:!!parser.parseFromString(
            eventSvg(id),'image/svg+xml').querySelector('parsererror'),
          marks:(eventSvg(id).match(/<(?:path|ellipse|circle|rect|text)\b/g)||[]).length
        })) };
    });
    expect(result.ids).toHaveLength(22);
    expect(new Set(result.ids).size).toBe(22);
    expect(result.trace).toHaveLength(10);
    expect(result.activities).toHaveLength(8);
    expect(new Set(result.drawings.map(x=>x.svg)).size).toBe(22);
    for(const drawing of result.drawings){
      expect(drawing.parseError,drawing.id).toBe(false);
      expect(drawing.svg).toContain('viewBox="0 0 72 62"');
      expect(drawing.marks,drawing.id).toBeGreaterThanOrEqual(2);
      expect(drawing.dom).toContain('aria-hidden="true"');
      expect(drawing.dom).toContain('focusable="false"');
      expect(drawing.uri).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(Buffer.from(drawing.uri.split(',')[1],'base64').toString('utf8'))
        .toBe(drawing.svg);
    }
  });

test('reused live event textures match visible inspector icons and expire cleanly',
  async({page})=>{
    await ready(page);
    const triggered=await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      const success=store.debugEnvironmentEvent('litter',2,{x:4,y:3});
      const effect=store.environment.effects.find(x=>x.kind==='litter');
      if(effect)store.inspectTile(effect.cell);
      return {success,effect};
    });
    expect(triggered.success).toBe(true);
    expect(triggered.effect).toBeTruthy();
    await expect.poll(async()=>(await art(page)).sprites.some(item=>
      item.id==='trace:'+triggered.effect!.id)).toBe(true);
    const state=await art(page);
    expect(state.sprites.find(x=>x.id==='trace:'+triggered.effect!.id)!.texture)
      .toBe('vintage-event-trace-litter');
    const panel=page.locator('#tile-panel');
    await expect(panel).toContainText('Discarded packaging');
    await expect(panel.locator('.environment-note .vintage-event-icon')).toHaveCount(1);
    const markup=await panel.locator('.environment-note .vintage-event-icon')
      .evaluate(el=>el.outerHTML);
    expect(markup).toContain('viewBox="0 0 72 62"');
    // Clear without changing the environment generator or reusing wrong props.
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      const cell=store.environment.effects.find(x=>x.kind==='litter')!.cell;
      store.cleanLitter(cell);
    });
    await expect.poll(async()=>(await art(page)).sprites.some(item=>
      item.id==='trace:'+triggered.effect!.id)).toBe(false);
  });

test('a real Marsh picnic has a wicker basket, is accessible in tile details and keeps its phases',
  async({page})=>{
    await ready(page);
    const started=await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      const valid=store.debugActivity('picnic',{x:4,y:3});
      const activity=store.activities.active.find(x=>x.kind==='picnic');
      if(activity)store.inspectTile(activity.cell);
      return {valid,activity};
    });
    expect(started.valid).toBe(true);
    expect(started.activity).toBeTruthy();
    await expect.poll(async()=>(await art(page)).sprites.some(item=>
      item.id==='activity:'+started.activity!.id)).toBe(true);
    await expect(page.locator('#tile-panel')).toContainText('A Sunday picnic');
    await expect(page.locator('.activity-notes .vintage-event-icon')).toHaveCount(1);
    let sprite=(await art(page)).sprites.find(x=>
      x.id==='activity:'+started.activity!.id)!;
    expect(sprite.texture).toBe('vintage-event-activity-picnic');
    expect(sprite.alpha).toBeLessThan(1);
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.tickEconomy(4);
    });
    sprite=(await art(page)).sprites.find(x=>
      x.id==='activity:'+started.activity!.id)!;
    expect(sprite.alpha).toBe(1);
    await page.screenshot({path:'test-results/visual-review/7e-picnic-scene.png',
      animations:'disabled'});
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.tickEconomy(20);
    });
    await expect.poll(async()=>(await art(page)).sprites.some(item=>
      item.id==='activity:'+started.activity!.id)).toBe(false);
  });

test('a real roadside impact shows a seal without hiding the canonical model and removes markers on repair',
  async({page})=>{
    await ready(page);
    const outcome=await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      const {ROAD_CELLS,HOMES,isOnBoard,isRoad,isScenery}=await import('/src/game/config.ts');
      const {leftVergeContact}=await import('/src/game/damage.ts');
      for(const road of ROAD_CELLS){
        for(const model of [{x:road.x-1,y:road.y},{x:road.x+1,y:road.y},
          {x:road.x,y:road.y-1},{x:road.x,y:road.y+1}]){
          if(!isOnBoard(model.x,model.y)||isRoad(model.x,model.y)||
            isScenery(model.x,model.y)||HOMES.some(h=>h.x===model.x&&h.y===model.y)||
            !leftVergeContact(road,model))continue;
          if(!store.place(model,'lamp'))continue;
          const impacted=store.debugRoadsideAccident(0,road,model,'break');
          store.inspectTile(model);
          return {road,model,impacted};
        }
      }
      return null;
    });
    expect(outcome).toBeTruthy();
    expect(outcome!.impacted).toBe(true);
    const s=await art(page);
    expect(s.sprites.some(x=>x.texture==='vintage-event-incident-break'))
      .toBe(true);
    expect(s.sprites.some(x=>x.id.startsWith('condition:'))).toBe(true);
    await expect(page.locator('#tile-panel .accident-notes .vintage-event-icon'))
      .toHaveCount(1);
    await expect(page.locator('#tile-panel')).toContainText('Broken');
    await page.screenshot({
      path:'test-results/visual-review/7e-broken-miniature.png',
      animations:'disabled'
    });
    await page.evaluate(async(model)=>{
      const {store}=await import('/src/game/state.ts');
      store.repairModel(model);
    },outcome!.model);
    await expect.poll(async()=>(await art(page)).sprites.some(x=>
      x.id.startsWith('condition:'))).toBe(false);
    expect((await art(page)).loaded).toHaveLength(22);
  });

test('workshop and story share the original kit/car art, with predictable keyboard focus',
  async({page})=>{
    await ready(page);
    const workshopButton=page.getByRole('button',{name:'Workshop'}).first();
    await workshopButton.click();
    const modal=page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.vintage-dialog')).toHaveCount(1);
    await expect(modal.locator('.vintage-frame-corners')).toHaveCount(1);
    await expect(modal.locator('.workbench-engraving .miniature-svg')).toHaveCount(1);
    await expect(modal.locator('#workshop-title')).toBeFocused();
    await expect(page.locator('#app > header')).toHaveAttribute('inert','');
    await expect(page.locator('#app > main')).toHaveAttribute('inert','');
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts'); store.notify();
    });
    await expect(modal.locator('#workshop-title')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(modal.locator('[data-action="workshop"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('#app > header')).not.toHaveAttribute('inert');
    await expect(page.locator('#app > main')).not.toHaveAttribute('inert');
    await expect(workshopButton).toBeFocused();
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');store.endRun(true);
    });
    await expect(modal.locator('.vintage-story-frame .story-vehicle svg')).toHaveCount(1);
    await expect(modal.locator('#chapter-title')).toBeFocused();
    await expect(modal.locator('.story-car')).toHaveCount(0);
    await page.screenshot({
      path:'test-results/visual-review/7e-chapter-plate.png',
      animations:'disabled'
    });
    await page.getByRole('button',{name:'Visit workshop'}).click();
    await expect(modal.locator('#workshop-title')).toBeFocused();
    await page.getByRole('button',{name:/Back to the chapter/}).click();
    await expect(modal.locator('#chapter-title')).toBeFocused();
  });

const views=[
  {name:'desktop',width:1440,height:900},
  {name:'compact-laptop',width:1266,height:548},
  {name:'portrait-phone',width:390,height:844},
  {name:'landscape-phone',width:844,height:390},
  {name:'double-zoom-equivalent',width:720,height:450}
] as const;
for(const view of views){
  test('vintage end-of-run modal remains readable at '+view.name,
    async({page})=>{
      await page.setViewportSize({width:view.width,height:view.height});
      await ready(page);
      await page.evaluate(async()=>{
        const {store}=await import('/src/game/state.ts');store.endRun(false);
      });
      const dialog=page.locator('.vintage-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.vintage-frame-corners')).toHaveCount(1);
      await expect(dialog.locator('.story-vehicle svg')).toHaveCount(1);
      const size=await dialog.evaluate(el=>{
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
          scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
          fontSize:parseFloat(s.fontSize)};
      });
      expect(size.left).toBeGreaterThanOrEqual(-2);
      expect(size.right).toBeLessThanOrEqual(view.width+2);
      expect(size.bottom).toBeLessThanOrEqual(view.height+2);
      expect(size.top).toBeGreaterThanOrEqual(-2);
      const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
      expect(scroll).toBeLessThanOrEqual(view.width+2);
      await page.screenshot({path:'test-results/visual-review/7e-'+view.name+
        '-chapter.png',animations:'disabled'});
      await page.getByRole('button',{name:'Visit workshop'}).click();
      await expect(page.locator('.workshop-dialog')).toBeVisible();
      await expect(page.locator('.workbench-engraving .miniature-svg')).toHaveCount(1);
      await page.screenshot({path:'test-results/visual-review/7e-'+view.name+
        '-workshop.png',animations:'disabled'});
    });
}
