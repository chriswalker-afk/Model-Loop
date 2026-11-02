import { expect,test,type Page } from '@playwright/test';

/**
 * Real working 1908 art gate. Proves textures load, cached images are reused
 * through state updates, lane/rotation/vehicle alignment are unchanged and
 * full-size desktop/compact/phone screenshots are generated for visual review.
 */
type WorldSnapshot = {
  loadedCars:string[];loadedHouses:string[];loadedScenery:string[];
  variants:string[];
  cars:Array<{residentId:number;texture:string;width:number;height:number;
    x:number;y:number;rotation:number;lane:string;changingTo:string|null;
    phase:string;brakeVisible:boolean}>;
  houses:Array<{id:number;texture:string;alpha:number;x:number;y:number;
    width:number;height:number}>;
  scenery:Array<{texture:string;x:number;y:number;width:number;height:number}>;
};

async function world(page:Page):Promise<WorldSnapshot>{
  return page.evaluate(()=>{
    const debug=(window as typeof window & {
      __modelLoopDebug?:{worldArt:()=>WorldSnapshot}
    }).__modelLoopDebug;
    if(!debug)throw Error('Development world-art diagnostic unavailable');
    return debug.worldArt();
  });
}
async function ready(page:Page):Promise<void>{
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect.poll(async()=> (await world(page)).cars.length,{timeout:15000})
    .toBe(6);
}

test('1908 motorcars, six homes and seven civic/scenery textures are unique valid SVG originals',
  async({page})=>{
    await page.goto('/');
    const result=await page.evaluate(async()=>{
      const art=await import('/src/ui/vintageWorldArt.ts');
      const doc=new DOMParser();
      const cars=Array.from({length:6},(_,i)=>art.carSvg(i));
      const houses=Array.from({length:6},(_,i)=>art.houseSvg(i));
      const scenes=art.sceneryVariants.map(v=>art.scenerySvg(v));
      return {
        variants:art.carVariants,
        cars, houses, scenes,
        names:art.sceneryVariants,
        errors:[...cars,...houses,...scenes].map(svg=>!!doc.parseFromString(
          svg,'image/svg+xml').querySelector('parsererror')),
        elements:[...cars,...houses,...scenes].map(svg=>
          (svg.match(/<(?:path|circle|ellipse|rect|text)\b/g)||[]).length),
        uriRoundTrip:art.worldSvgDataUri(art.houseSvg(0))
      };
    });
    expect(result.variants).toEqual([
      'runabout','tourer','delivery','tourer','delivery','landaulette'
    ]);
    expect(new Set(result.cars).size).toBe(6);
    expect(new Set(result.houses).size).toBe(6);
    expect(new Set(result.scenes).size).toBe(7);
    expect(result.errors).toEqual(Array(19).fill(false));
    expect(result.elements.every(n=>n>=16)).toBe(true);
    expect(result.scenes.find((_,i)=>result.names[i]==='clock-hall'))
      .toContain('TOWN HALL');
    expect(result.scenes.find((_,i)=>result.names[i]==='park-notice'))
      .toContain('TOWN PARK');
    expect(result.uriRoundTrip).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(result.uriRoundTrip.split(',')[1],'base64').toString('utf8'))
      .toBe(result.houses[0]);
  });

test('the actual Phaser scene displays six individually illustrated cars and homes, plus period landmarks',
  async({page})=>{
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await ready(page);
    const state=await world(page);
    expect(state.loadedCars).toEqual(Array.from({length:6},(_,i)=>'vintage-car-'+i));
    expect(state.loadedHouses).toEqual(Array.from({length:6},(_,i)=>'vintage-house-'+i));
    expect(state.loadedScenery).toHaveLength(7);
    expect(state.scenery).toHaveLength(13);
    expect(state.scenery.filter(s=>s.texture==='vintage-scenery-bandstand'))
      .toHaveLength(1);
    expect(state.scenery.filter(s=>s.texture.startsWith('vintage-scenery-oak-')))
      .toHaveLength(9);
    for(let i=0;i<6;i++){
      expect(state.cars[i].residentId).toBe(i);
      expect(state.cars[i].texture).toBe('vintage-car-'+i);
      expect(state.houses[i].texture).toBe('vintage-house-'+i);
      expect(state.cars[i].width).toBe(45);
      expect(state.cars[i].height).toBe(26);
      expect(state.houses[i].width).toBe(59);
      expect(state.houses[i].height).toBe(70);
    }
    for(const scene of state.scenery){
      expect(scene.width).toBeGreaterThanOrEqual(50);
      expect(scene.height).toBeGreaterThanOrEqual(47);
    }
    expect(errors).toEqual([]);
  });

test('new car art follows the same left-lane, passing and position data as the existing simulation',
  async({page})=>{
    await ready(page);
    const comparison=await page.evaluate(()=>{
      type Row={residentId:number;x:number;y:number;lane:string;
        changingTo:string|null;phase:string};
      const debug=(window as typeof window & {
        __modelLoopDebug?:{
          worldArt:()=>WorldSnapshot;
          trafficSnapshot:()=>Row[];
        }
      }).__modelLoopDebug!;
      return {visual:debug.worldArt(),traffic:debug.trafficSnapshot()};
    });
    expect(comparison.traffic).toHaveLength(6);
    for(const car of comparison.visual.cars){
      const data=comparison.traffic.find(v=>v.residentId===car.residentId)!;
      expect(car.x).toBeCloseTo(data.x,5);
      expect(car.y).toBeCloseTo(data.y,5);
      expect(car.lane).toBe(data.lane);
      expect(car.changingTo).toBe(data.changingTo);
      expect(car.phase).toBe(data.phase);
      expect(['left','passing']).toContain(car.lane);
    }
    const prior=comparison.visual.cars.map(c=>c.texture);
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.selectTile({x:6,y:5});
    });
    const updated=await world(page);
    expect(updated.cars.map(c=>c.texture)).toEqual(prior);
    expect(updated.loadedCars).toHaveLength(6);
  });

test('period house images remain in place while occupied, mood and selected state stay live',
  async({page})=>{
    await ready(page);
    const initial=await world(page);
    await page.evaluate(async()=>{
      const {store}=await import('/src/game/state.ts');
      store.selectResident(0);
      store.residents[0].occupied=false;
      store.notify();
    });
    const updated=await world(page);
    expect(updated.houses[0].texture).toBe(initial.houses[0].texture);
    expect(updated.houses[0].x).toBe(initial.houses[0].x);
    expect(updated.houses[0].y).toBe(initial.houses[0].y);
    expect(updated.houses[0].alpha).toBeLessThan(.7);
    expect(updated.houses[1].alpha).toBe(1);
    await page.screenshot({
      path:'test-results/visual-review/7d-house-status-states.png',
      animations:'disabled'
    });
  });

const views=[
  {name:'desktop',width:1440,height:900},
  {name:'compact-laptop',width:1266,height:548},
  {name:'phone-portrait',width:390,height:844},
  {name:'phone-landscape',width:844,height:390}
] as const;

for(const view of views){
  test('period town art renders without errors at '+view.name+' at real gameplay scale',
    async({page})=>{
      await page.setViewportSize({width:view.width,height:view.height});
      const errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      await ready(page);
      const state=await world(page);
      expect(state.cars).toHaveLength(6);
      expect(state.houses).toHaveLength(6);
      expect(state.scenery).toHaveLength(13);
      const viewport=await page.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,
        width:innerWidth
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(view.width+2);
      const canvas=page.locator('#game-container canvas');
      const rect=await canvas.boundingBox();
      expect(rect!.width).toBeGreaterThan(view.width<=700?450:530);
      await page.screenshot({
        path:'test-results/visual-review/7d-'+view.name+'-full-town.png',
        animations:'disabled'
      });
      // On phones the town is intentionally pannable. This second frame
      // explicitly shows the hall, fountain and houses beyond the left edge.
      if(view.width<=700){
        await page.locator('#town-pan').evaluate(el=>{
          el.scrollLeft=el.scrollWidth/2;
        });
        await page.screenshot({
          path:'test-results/visual-review/7d-phone-pan-civic.png',
          animations:'disabled'
        });
      }
      expect(errors).toEqual([]);
    });
}
