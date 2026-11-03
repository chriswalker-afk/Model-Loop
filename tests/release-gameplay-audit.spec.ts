import {test,expect,type Page} from '@playwright/test';
import {
  BOARD,HOMES,ROAD_CELLS,isRoad,manhattanDistance,type Cell
} from '../src/game/config';
import {GameStore} from '../src/game/state';
import {MAX_NEIGHBOUR_EFFECT_PER_LAP} from '../src/game/founding';

type Layout=readonly Cell[];
interface AuditSnap {
  elapsed:number;progress:number;phase:string;money:number;
  completedLaps:number;queued:number;trafficDelay:number;recoveries:number;
  residents:Array<{id:number;occupied:boolean;laps:number;irritation:number}>;
  traffic:Array<{residentId:number;phase:string;position:number;
    actualSpeed:number;stalledSeconds:number;recoveryCount:number}>;
}
const reference:Layout=HOMES.map(home=>({x:home.x,y:home.y}));
const clustered:Layout=[
  {x:7,y:1},{x:14,y:1},{x:21,y:5},
  {x:14,y:11},{x:1,y:7},{x:9,y:1}
];
const sharedEntrance:Layout=[
  {x:7,y:1},{x:7,y:3},{x:14,y:1},
  {x:21,y:5},{x:14,y:11},{x:1,y:7}
];

async function foundInBrowser(page:Page,layout:Layout,seed:number):Promise<void>{
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await page.evaluate(async({positions,seed})=>{
    const {store}=await import('/src/game/state.ts');
    store.newRun(seed);
    for(let id=0;id<6;id++){
      store.chooseFoundingFamily(id);
      if(store.foundingIntroId!==id)throw Error('Lost introduction for '+id);
      store.acknowledgeFoundingIntroduction();
      const plot=positions[id];
      const preview=store.previewFoundingHome(plot);
      if(!preview.allowed||!preview.relationshipForecast)
        throw Error('Plot rejected for '+id+': '+preview.reason);
      if(!store.placeFoundingHome(plot))
        throw Error('Unable to place family '+id);
    }
    if(store.foundingCount!==6||!store.openFoundingReview()||
       !store.beginVintageYears())throw Error('Vintage not founded');
  },{positions:layout,seed});
}

async function step(page:Page,frames:number):Promise<AuditSnap>{
  return page.evaluate(frames=>{
    const debug=(window as typeof window&{
      __modelLoopDebug?:{auditAdvance:(frames:number)=>AuditSnap}
    }).__modelLoopDebug;
    if(!debug)throw Error('Development-only audit helper unavailable');
    return debug.auditAdvance(frames);
  },frames);
}

test('release audit: varied founding layouts, forecasts and free decor are safe',()=>{
  const seedSets=[6,11,26,71,119,421,1908,2026,3045,7711,8321,11133];
  const candidates:Cell[]=[];
  for(let y=0;y<BOARD.rows;y++)for(let x=0;x<BOARD.cols;x++){
    if(!isRoad(x,y)&&ROAD_CELLS.some(road=>
      Math.abs(x-road.x)+Math.abs(y-road.y)===1))candidates.push({x,y});
  }
  const signatures=new Set<string>();
  for(const seed of seedSets){
    const game=new GameStore();
    game.newRun(seed);
    for(let id=0;id<HOMES.length;id++){
      // Generate a reproducible, biased but dense mix of boundary, corner
      // and central placements; this isn't always the old reference town.
      const choices=candidates.filter(cell=>game.canPlaceHome(cell,id))
        .sort((a,b)=>{
          const hash=(c:Cell)=>Math.imul(seed*17+id*91+c.x*101+c.y*521,2654435761)>>>0;
          return hash(a)-hash(b);
        });
      expect(choices.length,'Not enough legal plots after '+id+' families').toBeGreaterThan(0);
      game.chooseFoundingFamily(id);
      game.acknowledgeFoundingIntroduction();
      const spot=choices[0];
      expect(game.previewFoundingHome(spot).relationshipForecast).not.toBeNull();
      expect(game.placeFoundingHome(spot)).toBe(true);
      expect(game.gardenDetails.every(d=>!isRoad(d.cell.x,d.cell.y))).toBe(true);
    }
    const sites=game.placedHomes;
    signatures.add(sites.map(x=>x.x+':'+x.y).join('|'));
    expect(game.openFoundingReview()).toBe(true);
    const last=sites[5];
    game.chooseFoundingFamily(5);
    const alternative=candidates.find(cell=>game.canPlaceHome(cell,5)&&
      (cell.x!==last.x||cell.y!==last.y));
    expect(alternative).toBeDefined();
    expect(game.previewFoundingHome(alternative!,5).allowed).toBe(true);
    expect(game.placeFoundingHome(alternative!,5)).toBe(true);
    const forecast=game.placedHomes.map(home=>({
      id:home.id,net:game.neighbourhoodFor(home.id).irritationPerLap
    }));
    expect(forecast.every(x=>Math.abs(x.net)<=MAX_NEIGHBOUR_EFFECT_PER_LAP)).toBe(true);
    const before=game.money;
    expect(game.beginVintageYears()).toBe(true);
    expect(game.money).toBe(before);
    expect(game.civicStage).toBe(0);
    expect(game.gardenDetails.every(d=>!isRoad(d.cell.x,d.cell.y))).toBe(true);
    expect(game.placements).toHaveLength(0);
    expect(game.elapsedSeconds).toBe(0);
  }
  expect(signatures.size).toBeGreaterThanOrEqual(9);
});

test('release audit: a completed chapter can restart with new cars and no old decorations',async({page})=>{
  await foundInBrowser(page,reference,1908);
  const old=await page.evaluate(()=>{
    const debug=(window as typeof window&{
      __modelLoopDebug?:{trafficSnapshot:()=>Array<{residentId:number}>;
        worldArt:()=>{gardens:unknown[];scenery:unknown[];cars:unknown[]}}
    }).__modelLoopDebug!;
    return {cars:debug.trafficSnapshot(),art:debug.worldArt()};
  });
  expect(old.cars).toHaveLength(6);
  expect(old.art.gardens.length).toBeGreaterThan(12);
  const restart=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const debug=(window as typeof window&{
      __modelLoopDebug?:{trafficSnapshot:()=>unknown[];
        worldArt:()=>{gardens:unknown[];scenery:unknown[];cars:unknown[]}}
    }).__modelLoopDebug!;
    store.endRun(true);
    store.newRun(4044);
    return {phase:store.phase,homes:store.foundingCount,
      cars:debug.trafficSnapshot(),art:debug.worldArt()};
  });
  expect(restart.phase).toBe('founding');
  expect(restart.homes).toBe(0);
  expect(restart.cars).toHaveLength(0);
  expect(restart.art.cars).toHaveLength(0);
  expect(restart.art.gardens).toHaveLength(0);
  expect(restart.art.scenery).toHaveLength(0);
  // Second Vintage has deliberately different plots and a shared entrance.
  await page.evaluate(async(positions)=>{
    const {store}=await import('/src/game/state.ts');
    for(let id=0;id<6;id++){
      store.chooseFoundingFamily(id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome(positions[id]))throw Error('Restart plot failed '+id);
    }
    if(!store.beginVintageYears())throw Error('Restart failed');
  },sharedEntrance);
  const replay=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const {ROAD_CELLS,manhattanDistance,BOARD}=await import('/src/game/config.ts');
    const cars=(window as typeof window&{
      __modelLoopDebug?:{trafficSnapshot:()=>Array<{
        residentId:number;phase:string;position:number
      }>}
    }).__modelLoopDebug!.trafficSnapshot();
    return {cars,expected:store.placedHomes.map(home=>{
      const idx=ROAD_CELLS.findIndex(cell=>manhattanDistance(cell,home)===1);
      return {id:home.id,position:idx*BOARD.tile};
    })};
  });
  expect(replay.cars).toHaveLength(6);
  expect(replay.cars.filter(car=>car.phase==='driving').length).toBeLessThan(6);
  for(const car of replay.cars){
    expect(car.position).toBe(replay.expected.find(p=>p.id===car.residentId)?.position);
  }
});

for(const {name,layout,seed} of [
  {name:'reference-like distribution',layout:reference,seed:118},
  {name:'closely grouped neighbours',layout:clustered,seed:401},
  {name:'opposite houses sharing an entrance',layout:sharedEntrance,seed:882}
]){
  test('extended real-scene traffic: '+name,async({page})=>{
    test.setTimeout(105000);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await foundInBrowser(page,layout,seed);
    const checkpoints:AuditSnap[]=[];
    for(let i=0;i<4;i++){
      const sample=await step(page,650);
      checkpoints.push(sample);
      expect(sample.elapsed).toBeGreaterThanOrEqual((i+1)*35);
      expect(sample.queued).toBeLessThanOrEqual(6);
      expect(sample.traffic.every(car=>
        Number.isFinite(car.position)&&Number.isFinite(car.actualSpeed)&&
        Number.isFinite(car.stalledSeconds))).toBe(true);
      expect(sample.residents.every(r=>r.irritation>=0&&r.irritation<=100)).toBe(true);
      if(sample.phase!=='playing')break;
    }
    const last=checkpoints.at(-1)!;
    console.log('RELEASE_TRAFFIC_AUDIT '+JSON.stringify({name,seed,
      checkpoints:checkpoints.map(s=>({time:Math.round(s.elapsed),
        laps:s.completedLaps,progress:+s.progress.toFixed(2),
        phase:s.phase,occupied:s.residents.filter(r=>r.occupied).length,
        recoveries:s.recoveries,maxStall:Math.max(0,...s.traffic.map(c=>c.stalledSeconds))
      }))}));
    expect(last.completedLaps,'No real circuits completed').toBeGreaterThanOrEqual(8);
    expect(last.progress).toBeGreaterThan(15);
    expect(checkpoints.every((s,i)=>i===0||
      s.completedLaps>=checkpoints[i-1].completedLaps)).toBe(true);
    expect(last.residents.every(r=>r.laps>=0)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('audit: boundary previews, purchases, running laps and garden safety agree',async({page})=>{
  await foundInBrowser(page,clustered,143);
  const result=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const a=store.neighbourhoodFor(0).irritationPerLap;
    const beforeMoney=store.money;
    const picket=store.previewBoundaryInstallation(0,5,'picket');
    const installed=store.installBoundary(0,5,'picket');
    const after=store.neighbourhoodFor(0).irritationPerLap;
    const boardOpen=store.canPlace({x:8,y:1});
    const modelPreview=store.previewPlacement({x:8,y:1},'limit');
    const sign=store.place({x:8,y:1},'limit');
    const postSign=store.neighbourhoodFor(5).irritationPerLap;
    const garden=store.gardenDetails.map(g=>({x:g.cell.x,y:g.cell.y}));
    const expectedBefore=store.residents[0].irritation;
    const lap=store.finishLap(0);
    const expectedAfter=store.residents[0].irritation;
    store.togglePause();
    const whilePaused=store.installBoundary(0,5,'stone');
    store.togglePause();
    return {a,beforeMoney,picket,installed,after,boardOpen,modelPreview,
      sign,postSign,garden,lap,expectedBefore,expectedAfter,whilePaused,
      balance:store.money,spent:store.ledger.miniaturePurchases,
      models:store.placements.length};
  });
  expect(result.picket.allowed).toBe(true);
  expect(result.installed).toBe(true);
  expect(result.picket.affected[0].predictedPerLap).toBe(result.after);
  expect(result.after).toBeLessThan(result.a);
  expect(result.boardOpen).toBe(true);
  expect(result.modelPreview.allowed).toBe(true);
  expect(result.sign).toBe(true);
  expect(result.models).toBe(1);
  expect(result.garden.some(c=>c.x===8&&c.y===1)).toBe(false);
  expect(result.lap).toBe(15);
  expect(result.expectedAfter).toBeCloseTo(result.expectedBefore+result.after,5);
  expect(result.whilePaused).toBe(false);
  expect(result.spent).toBe(24+30);
  expect(result.balance).toBe(result.beforeMoney-result.spent+result.lap);
});

for(const size of [{width:390,height:844},{width:844,height:390},{width:1280,height:720}]){
  test('audit: founding, optional model shop and panels fit '+size.width+'×'+size.height,
    async({page})=>{
      await page.setViewportSize(size);
      await foundInBrowser(page,clustered,1181);
      const studio=page.locator('#boundary-studio');
      await expect(page.getByRole('button',{name:'Fences & gardens'})).toBeVisible();
      await expect(studio).toBeHidden();
      await page.getByRole('button',{name:'Fences & gardens'}).click();
      await expect(studio).toBeVisible();
      await expect(studio.locator('[data-boundary-pair="0:5"]')).toBeVisible();
      await studio.locator('[data-boundary-pair="0:5"]').click();
      await expect(studio.locator('.boundary-forecast')).toContainText('The Finches');
      await page.keyboard.press('Escape');
      // Escape is a convenience, but closing through summary must always work.
      if(await studio.getAttribute('open')!==null)
        await studio.locator('summary').click();
      await expect(studio).toBeHidden();
      const dimensions=await page.evaluate(()=>({
        body:document.documentElement.scrollWidth,screen:window.innerWidth,
        board:document.querySelector('#game-container canvas')?.getBoundingClientRect(),
        shop:document.querySelector('#shop-section')?.getBoundingClientRect()
      }));
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.screen+2);
      expect(dimensions.board?.width).toBeGreaterThan(200);
      expect(dimensions.shop?.width).toBeGreaterThan(150);
      await page.screenshot({path:
        'test-results/visual-review/gameplay-audit-'+size.width+'x'+size.height+'.png'});
    });
}

test('audit: a player can introduce and place all six families using the real UI',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  const layout=clustered;
  const order=[1,4,2,5,0,3];
  for(const [i,id] of order.entries()){
    const name=HOMES[id].name;
    await page.getByRole('button',{name:new RegExp(name+', awaiting a plot')}).click();
    const dialog=page.getByRole('dialog',{name});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Choose their plot'}).click();
    const rect=await page.locator('#game-container canvas').boundingBox();
    if(!rect)throw Error('Road canvas not visible');
    const cell=layout[id];
    const x=rect.x+(BOARD.left+(cell.x+.5)*BOARD.tile)/BOARD.width*rect.width;
    const y=rect.y+(BOARD.top+(cell.y+.5)*BOARD.tile)/BOARD.height*rect.height;
    await page.mouse.click(x,y);
    await expect(page.locator('#founding-progress')).toHaveText((i+1)+' OF 6 HOMES');
  }
  await page.getByRole('button',{name:'Review the founding town'}).click();
  const review=page.getByRole('dialog',{name:'A Town Begins'});
  await expect(review.locator('.founding-review-list li')).toHaveCount(6);
  await review.getByRole('button',{name:'Begin the Vintage Years'}).click();
  await expect(page.locator('#founding-panel')).toBeHidden();
  await expect(page.locator('#shop-section')).toBeVisible();
  const snapshot=await step(page,400);
  expect(snapshot.completedLaps).toBeGreaterThanOrEqual(0);
  expect(snapshot.traffic.length).toBe(6);
  expect(errors).toEqual([]);
});
