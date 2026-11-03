import {test,expect,type Page} from '@playwright/test';
import {BOARD,ROAD_CELLS} from '../src/game/config';

type Detail={
  installed:string|null;texture:string;visible:boolean;alpha:number;
  x:number;y:number;width:number;height:number;depth:number;
};
type HouseArt={
  id:number;facing:'left'|'right'|'centre';
  garden:Detail;boundary:Detail;
};
type WorldArt={
  loadedHomeGrounds:string[];
  homeGrounds:HouseArt[];
  houses:Array<{id:number;texture:string;x:number;y:number;
    width:number;height:number;visible:boolean;alpha:number}>;
  gardens:Array<{residentId:number;key:string;x:number;y:number}>;
  cars:Array<{residentId:number;texture:string}>;
};
const getArt=async(page:Page):Promise<WorldArt>=>page.evaluate(()=>{
  const tools=(window as typeof window&{
    __modelLoopDebug?:{worldArt:()=>WorldArt}
  }).__modelLoopDebug;
  if(!tools)throw Error('World art diagnostics unavailable');
  return tools.worldArt();
});
async function ready(page:Page):Promise<void>{
  await page.goto('/?referenceTown=1');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect.poll(async()=>(await getArt(page)).houses.length).toBe(6);
  await expect.poll(async()=>(await getArt(page)).loadedHomeGrounds.length)
    .toBe(60);
}

test('house-ground art has 60 unique valid, bounded engraved SVG variants',async({page})=>{
  await page.goto('/?referenceTown=1');
  const art=await page.evaluate(async()=>{
    const grounds=await import('/src/ui/homeGroundsArt.ts');
    const textures=grounds.allHomeGroundTextures();
    const doc=new DOMParser();
    return {
      count:textures.length,
      keys:textures.map(v=>v.key),
      houses:[...new Set(textures.map(v=>v.residentId))],
      kinds:[...new Set(textures.map(v=>v.kind))],
      errors:textures.flatMap(v=>{
        const docSvg=doc.parseFromString(
          grounds.homeGroundsSvg(v.residentId,v.kind,v.facing),'image/svg+xml');
        const root=docSvg.documentElement;
        return root.querySelector('parsererror')
          ? [v.key+' XML parser error'] :
          root.getAttribute('viewBox')!=='0 0 140 148'
            ? [v.key+' incorrect house alignment'] :
          (root.querySelectorAll('path,circle,ellipse').length<5)
            ? [v.key+' lacks hand-engraved details'] : [];
      }),
      sourceCounts:textures.map(v=>(grounds.homeGroundsSvg(v.residentId,v.kind,v.facing)
        .match(/<(path|circle|ellipse)\b/g)||[]).length),
      differentHouses:grounds.homeGroundsSvg(0,'front')!==
        grounds.homeGroundsSvg(1,'front'),
      differentGates:grounds.homeGroundsSvg(1,'gate','left')!==
        grounds.homeGroundsSvg(1,'gate','right'),
      facing:{
        right:grounds.homeGateFacing(1,[{id:1,x:7,y:1},{id:4,x:9,y:1}]),
        left:grounds.homeGateFacing(4,[{id:1,x:7,y:1},{id:4,x:9,y:1}]),
        distant:grounds.homeGateFacing(1,[{id:1,x:7,y:1},{id:4,x:14,y:11}]),
        vertical:grounds.homeGateFacing(1,[{id:1,x:7,y:1},{id:4,x:7,y:3}])
      }
    };
  });
  expect(art.count).toBe(60);
  expect(new Set(art.keys).size).toBe(60);
  expect(art.houses).toEqual([0,1,2,3,4,5]);
  expect(art.kinds).toEqual([
    'picket','stone','hedge','gate','front','flowers','kitchen','patio'
  ]);
  expect(art.errors).toEqual([]);
  expect(art.sourceCounts.every(n=>n>=5)).toBe(true);
  expect(art.differentHouses).toBe(true);
  expect(art.differentGates).toBe(true);
  expect(art.facing).toEqual({
    right:'right',left:'left',distant:'centre',vertical:'centre'
  });
});

test('the untouched town starts with no paid grounds visible and original house footprints',async({page})=>{
  await ready(page);
  const snapshot=await getArt(page);
  expect(snapshot.cars).toHaveLength(6);
  expect(snapshot.homeGrounds).toHaveLength(6);
  expect(snapshot.homeGrounds.every(h=>
    !h.boundary.visible&&!h.garden.visible&&
    h.boundary.installed===null&&h.garden.installed===null)).toBe(true);
  for(let i=0;i<6;i++){
    expect(snapshot.houses[i].texture).toBe('vintage-house-'+i);
    expect(snapshot.homeGrounds[i].boundary.width).toBe(59);
    expect(snapshot.homeGrounds[i].boundary.height).toBe(70);
    expect(snapshot.homeGrounds[i].garden.width).toBe(59);
    expect(snapshot.homeGrounds[i].garden.height).toBe(70);
  }
});

test('a purchased fence and garden join one house at exactly the same origin',async({page})=>{
  await ready(page);
  const original=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return {money:store.money,roadCount:ROAD_CELLS.length,
      models:store.placements.length,
      canPlace:store.canPlace({x:4,y:2}),
      details:store.gardenDetails.length};
  });
  const install=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return [store.installHomeImprovement(0,'picket'),
      store.installHomeImprovement(0,'front')];
  });
  expect(install).toEqual([true,true]);
  const snapshot=await getArt(page);
  const house=snapshot.houses[0],ground=snapshot.homeGrounds[0];
  expect(ground.boundary.installed).toBe('picket');
  expect(ground.garden.installed).toBe('front');
  expect(ground.boundary.texture).toBe('vintage-property-0-picket');
  expect(ground.garden.texture).toBe('vintage-property-0-front');
  expect(ground.boundary.visible).toBe(true);
  expect(ground.garden.visible).toBe(true);
  for(const layer of [ground.boundary,ground.garden]){
    expect(layer.x).toBe(house.x);
    expect(layer.y).toBe(house.y);
    expect(layer.width).toBe(house.width);
    expect(layer.height).toBe(house.height);
    expect(layer.depth).toBeGreaterThan(2);
    expect(layer.depth).toBeLessThan(3);
  }
  await expect.poll(async()=>{
    const art=await getArt(page);
    return Math.round(art.homeGrounds[0].boundary.alpha*100);
  }).toBe(100);
  const final=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return {money:store.money,roadCount:ROAD_CELLS.length,
      models:store.placements.length,
      canPlace:store.canPlace({x:4,y:2}),
      details:store.gardenDetails.length,
      upkeep:store.homeUpkeepFor(0)};
  });
  expect(final.money).toBe(original.money-24-28);
  expect(final.roadCount).toBe(original.roadCount);
  expect(final.models).toBe(original.models);
  expect(final.canPlace).toBe(original.canPlace);
  expect(final.details).toBe(original.details);
  expect(final.upkeep).toBe(3);
});

test('changing an owned style swaps one existing house layer without duplicate models',async({page})=>{
  await ready(page);
  const original=await getArt(page);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.installHomeImprovement(2,'picket');
    store.installHomeImprovement(2,'kitchen');
  });
  let snapshot=await getArt(page);
  const initial=snapshot.homeGrounds[2];
  expect(initial.boundary.visible).toBe(true);
  expect(initial.garden.visible).toBe(true);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.installHomeImprovement(2,'stone');
    store.installHomeImprovement(2,'flowers');
  });
  snapshot=await getArt(page);
  const after=snapshot.homeGrounds[2];
  expect(after.boundary.texture).toBe('vintage-property-2-stone');
  expect(after.garden.texture).toBe('vintage-property-2-flowers');
  expect(after.boundary.x).toBe(initial.boundary.x);
  expect(after.garden.y).toBe(initial.garden.y);
  expect(snapshot.houses).toEqual(original.houses);
  expect(snapshot.cars.map(c=>c.texture)).toEqual(original.cars.map(c=>c.texture));
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.removeHomeImprovement(2,'boundary');
  });
  snapshot=await getArt(page);
  expect(snapshot.homeGrounds[2].boundary.visible).toBe(false);
  expect(snapshot.homeGrounds[2].garden.visible).toBe(true);
  expect(snapshot.homeGrounds[1].garden.visible).toBe(false);
});

test('vacant houses keep faded property art but lose their care and relation effects',async({page})=>{
  await ready(page);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.installHomeImprovement(1,'hedge');
    store.installHomeImprovement(1,'flowers');
    store.residents[1].occupied=false;
    store.notify();
  });
  await expect.poll(async()=>
    (await getArt(page)).homeGrounds[1].garden.alpha).toBeCloseTo(.48,1);
  const art=await getArt(page);
  expect(art.homeGrounds[1].garden.visible).toBe(true);
  expect(art.homeGrounds[1].boundary.visible).toBe(true);
  expect(art.houses[1].alpha).toBeLessThan(.7);
  const upkeep=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.homeUpkeepFor(1);
  });
  expect(upkeep).toBe(0);
});

test('reduced motion shows finished art instantly; a new founding run hides it all',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.installHomeImprovement(3,'hedge');
    store.installHomeImprovement(3,'patio');
  });
  let snapshot=await getArt(page);
  expect(snapshot.homeGrounds[3].boundary.alpha).toBe(1);
  expect(snapshot.homeGrounds[3].garden.alpha).toBe(1);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.newRun(4444);
  });
  snapshot=await getArt(page);
  expect(snapshot.homeGrounds.every(h=>!h.boundary.visible&&!h.garden.visible))
    .toBe(true);
  expect(snapshot.loadedHomeGrounds).toHaveLength(60);
});

test('visual review: paired fitted grounds and house remain readable on desktop and phone',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await ready(page);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.money=1600;
    const styles=[
      ['picket','front'],['gate','flowers'],['stone','kitchen'],
      ['hedge','patio'],['picket','flowers'],['hedge','front']
    ] as const;
    for(let i=0;i<styles.length;i++){
      store.installHomeImprovement(i,styles[i][0]);
      store.installHomeImprovement(i,styles[i][1]);
    }
    store.notify();
  });
  await expect.poll(async()=> (await getArt(page)).homeGrounds
    .filter(h=>h.garden.visible&&h.boundary.visible).length).toBe(6);
  await page.waitForTimeout(550);
  await page.screenshot({
    path:'test-results/visual-review/pass-c-house-grounds-desktop.png',
    fullPage:true
  });
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({
    path:'test-results/visual-review/pass-c-house-grounds-phone.png',
    fullPage:true
  });
  const geometry=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    viewWidth:window.innerWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewWidth+2);
});
