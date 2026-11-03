import {test,expect} from '@playwright/test';
import {
  BOARD, HOMES, SCENERY_CELLS, ROAD_CELLS, manhattanDistance
} from '../src/game/config';
import {GameStore} from '../src/game/state';
import {
  CIVIC_PROGRESS_THRESHOLDS, FAMILY_GARDEN_PROP,
  GARDEN_VARIANTS, planGardenDetails, gardenRespectsRoadAndModels,
  civicStageAt, civicRevealStage, eligibleCivicSites
} from '../src/game/livingScenery';
import {gardenSvg} from '../src/ui/gardenArt';

function settle(game:GameStore):void {
  game.newRun(1808);
  for(const home of HOMES){
    game.chooseFoundingFamily(home.id);
    game.acknowledgeFoundingIntroduction();
    expect(game.placeFoundingHome({x:home.x,y:home.y})).toBe(true);
  }
  expect(game.beginVintageYears()).toBe(true);
}
const unchanged=(game:GameStore)=>({
  money:game.money,progress:game.progress,safety:game.safety,
  community:game.community,irritation:game.residents.map(r=>r.irritation),
  ledger:JSON.stringify(game.ledger),placements:JSON.stringify(game.placements),
  elapsed:game.elapsedSeconds
});

test('family decorations are deterministic, distinctive, noninteractive and not road tiles',()=>{
  const homes=[{id:0,x:7,y:1},{id:1,x:14,y:1},
    {id:2,x:21,y:5},{id:3,x:14,y:11},
    {id:4,x:1,y:7},{id:5,x:9,y:1}];
  const props=planGardenDetails({homes,civicCells:SCENERY_CELLS});
  expect(props.length).toBeGreaterThanOrEqual(18);
  expect(props.length).toBeLessThanOrEqual(24);
  expect(planGardenDetails({homes,civicCells:SCENERY_CELLS})).toEqual(props);
  expect(new Set(props.map(p=>p.key)).size).toBe(props.length);
  expect(new Set(props.map(p=>p.cell.x+','+p.cell.y)).size).toBe(props.length);
  expect(planGardenDetails({homes:[...homes].reverse(),
    civicCells:SCENERY_CELLS})).toEqual(props);
  expect(gardenRespectsRoadAndModels(props,[])).toBe(true);
  for(const home of homes){
    const details=props.filter(prop=>prop.residentId===home.id);
    expect(details.length).toBeGreaterThanOrEqual(3);
    expect(details.some(detail=>detail.variant===FAMILY_GARDEN_PROP[home.id])).toBe(true);
    for(const detail of details){
      expect(manhattanDistance(detail.cell,home)).toBeLessThanOrEqual(2);
      expect(ROAD_CELLS.some(cell=>
        cell.x===detail.cell.x&&cell.y===detail.cell.y)).toBe(false);
    }
  }
});

test('cost-free gardens gracefully relocate around paid models and shared boundaries',()=>{
  const homes=[{id:0,x:7,y:1},{id:1,x:9,y:1}];
  const original=planGardenDetails({homes});
  const occupied=original[0].cell;
  const before=new Set(original.map(d=>d.key));
  const next=planGardenDetails({homes,modelCells:[occupied],
    boundaryPoints:[{x:8,y:1}]});
  expect(gardenRespectsRoadAndModels(next,[occupied])).toBe(true);
  expect(next.some(detail=>detail.cell.x===occupied.x&&
    detail.cell.y===occupied.y)).toBe(false);
  expect(next.some(detail=>!before.has(detail.key))).toBe(true);
  expect(planGardenDetails({homes})).toEqual(original);
});

test('all eleven small etched miniature assets are unique and parse as valid SVG',()=>{
  expect(GARDEN_VARIANTS).toHaveLength(11);
  expect(new Set(GARDEN_VARIANTS).size).toBe(11);
  const art=GARDEN_VARIANTS.map(gardenSvg);
  expect(new Set(art).size).toBe(11);
  for(const svg of art){
    expect(svg).toContain('viewBox="0 0 72 72"');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('#d8dace');
  }
});

test('civic progression is phased, reproducible and never reveals a blocked tile',()=>{
  expect(CIVIC_PROGRESS_THRESHOLDS).toEqual([8,24,48,72]);
  expect([0,7,8,23,24,47,48,71,72,100].map(civicStageAt))
    .toEqual([0,0,1,1,2,2,3,3,4,4]);
  expect(civicRevealStage({x:11,y:6})).toBe(4);
  expect(civicRevealStage({x:16,y:6})).toBe(3);
  expect(civicRevealStage({x:7,y:5})).toBe(2);
  const blocked=SCENERY_CELLS.find(cell=>civicRevealStage(cell)===2)!;
  const stage=eligibleCivicSites(4,SCENERY_CELLS,[],[blocked]);
  expect(stage).toHaveLength(12);
  expect(stage).not.toContainEqual(blocked);
  expect(eligibleCivicSites(0,SCENERY_CELLS,[],[])).toEqual([]);
});

test('the founding phase and cosmetic planning do not change any game resources',()=>{
  const game=new GameStore();
  game.newRun(22);
  const bare=unchanged(game);
  expect(game.scenerySites).toHaveLength(0);
  expect(game.gardenDetails).toHaveLength(0);
  expect(game.civicStage).toBe(0);
  game.chooseFoundingFamily(0);
  game.acknowledgeFoundingIntroduction();
  expect(game.placeFoundingHome({x:7,y:1})).toBe(true);
  expect(game.gardenDetails).toHaveLength(4);
  const gardenBefore=unchanged(game);
  const first=game.gardenDetails;
  for(let i=0;i<25;i++)expect(game.gardenDetails).toEqual(first);
  expect(unchanged(game)).toEqual(gardenBefore);
  expect(gardenBefore).toEqual(bare);
  game.tickEconomy(200);
  expect(game.elapsedSeconds).toBe(0);
});

test('the live town adds civic pieces at milestones without silently reserving future plots',()=>{
  const game=new GameStore();
  settle(game);
  expect(game.civicStage).toBe(0);
  expect(game.scenerySites).toHaveLength(0);
  const future=SCENERY_CELLS.find(cell=>
    game.canPlace(cell)&&civicRevealStage(cell)===1);
  expect(future).toBeDefined();
  const before=unchanged(game);
  // A future park plot remains available to a real paid miniature.
  expect(game.place(future!,'bench')).toBe(true);
  expect(game.placements).toHaveLength(1);
  expect(game.scenerySites).not.toContainEqual(future);
  let expected=0;
  for(let i=0;i<24;i++){
    game.finishLap(0);
    const stage=civicStageAt(game.progress);
    expect(game.civicStage).toBe(stage);
    expect(game.scenerySites.every(cell=>
      civicRevealStage(cell)<=stage&&!game.placements.some(p=>
        p.x===cell.x&&p.y===cell.y))).toBe(true);
    expect(game.scenerySites).not.toContainEqual(future);
    expected=stage;
  }
  expect(expected).toBeGreaterThanOrEqual(3);
  const fixed=new Set(game.scenerySites.map(c=>c.x+','+c.y));
  for(const cell of game.scenerySites){
    expect(game.canPlace(cell)).toBe(false);
  }
  expect(fixed.size).toBe(game.scenerySites.length);
  expect(unchanged(game).money).toBeGreaterThan(before.money-25);
});

test('reference fixture retains the full historic 13 landmark view',()=>{
  const game=new GameStore(true);
  expect(game.phase).toBe('playing');
  expect(game.civicStage).toBe(4);
  expect(game.scenerySites).toHaveLength(13);
});

test('real Phaser board starts with only a road, then assembles four family details',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  const initial=await page.evaluate(()=>{
    const debug=(window as typeof window&{
      __modelLoopDebug:{worldArt:()=>{gardens:unknown[];scenery:unknown[];cars:unknown[]}}
    }).__modelLoopDebug;
    return debug.worldArt();
  });
  expect(initial.scenery).toHaveLength(0);
  expect(initial.gardens).toHaveLength(0);
  expect(initial.cars).toHaveLength(0);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.chooseFoundingFamily(1);
    store.acknowledgeFoundingIntroduction();
    if(!store.placeFoundingHome({x:7,y:1}))throw Error('Bell house unavailable');
  });
  await expect.poll(async()=>page.evaluate(()=>{
    const debug=(window as typeof window&{
      __modelLoopDebug:{worldArt:()=>{gardens:Array<{variant:string;residentId:number}>}}
    }).__modelLoopDebug;
    return debug.worldArt().gardens.length;
  })).toBe(4);
  const art=await page.evaluate(()=>{
    const debug=(window as typeof window&{
      __modelLoopDebug:{worldArt:()=>{loadedGardens:string[];
        gardens:Array<{variant:string;residentId:number;visible:boolean;alpha:number}>}}
    }).__modelLoopDebug;
    return debug.worldArt();
  });
  expect(art.loadedGardens).toHaveLength(11);
  expect(art.gardens.some(g=>g.variant==='bell-easel'&&g.residentId===1)).toBe(true);
  expect(art.gardens.every(g=>g.visible)).toBe(true);
  await page.waitForTimeout(1400);
  const final=await page.evaluate(()=>(
    window as typeof window&{__modelLoopDebug:{worldArt:()=>{gardens:Array<{alpha:number}>}}}
  ).__modelLoopDebug.worldArt().gardens);
  expect(final.every(g=>g.alpha>.95)).toBe(true);
  expect(errors).toEqual([]);
});

test('existing houses grow scenery while civic pieces emerge only after genuine circuit progress',async({page})=>{
  await page.goto('/');
  const stages=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const {HOMES}=await import('/src/game/config.ts');
    for(const home of HOMES){
      store.chooseFoundingFamily(home.id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome({x:home.x,y:home.y}))throw Error('Invalid plot');
    }
    if(!store.beginVintageYears())throw Error('Vintage did not begin');
    const debug=(window as typeof window&{
      __modelLoopDebug:{worldArt:()=>{gardens:unknown[];scenery:unknown[];civicStage:number}}
    }).__modelLoopDebug;
    const result=[{progress:store.progress,art:debug.worldArt()}];
    for(const count of [3,8,16,25]){
      while(store.residents[0].laps<count)store.finishLap(0);
      result.push({progress:store.progress,art:debug.worldArt()});
    }
    return result;
  });
  expect(stages[0].art.scenery).toHaveLength(0);
  expect(stages[0].art.gardens.length).toBeGreaterThan(15);
  expect(stages.map(s=>s.art.civicStage)).toEqual([0,1,2,3,4]);
  for(let i=1;i<stages.length;i++){
    expect(stages[i].art.scenery.length).toBeGreaterThan(stages[i-1].art.scenery.length);
  }
});

test('reduced motion keeps all decorative arrivals and civic objects instantly visible',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const stages=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const {HOMES}=await import('/src/game/config.ts');
    for(const home of HOMES){
      store.chooseFoundingFamily(home.id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome({x:home.x,y:home.y}))throw Error('Invalid plot');
    }
    store.beginVintageYears();
    for(let i=0;i<3;i++)store.finishLap(0);
    return (window as typeof window&{
      __modelLoopDebug:{worldArt:()=>{gardens:Array<{alpha:number}>;
        scenery:Array<{x:number;y:number}>}}
    }).__modelLoopDebug.worldArt();
  });
  expect(stages.gardens.length).toBeGreaterThan(15);
  expect(stages.gardens.every(g=>g.alpha>.95)).toBe(true);
  expect(stages.scenery.length).toBeGreaterThan(0);
});

for(const size of [{width:390,height:844},{width:844,height:390}]){
  test('family gardens do not create browser overflow at '+size.width+'x'+size.height,
    async({page})=>{
      await page.setViewportSize(size);
      await page.goto('/');
      await page.evaluate(async()=>{
        const {store}=await import('/src/game/state.ts');
        const {HOMES}=await import('/src/game/config.ts');
        for(const home of HOMES){
          store.chooseFoundingFamily(home.id);
          store.acknowledgeFoundingIntroduction();
          store.placeFoundingHome({x:home.x,y:home.y});
        }
      });
      const check=await page.evaluate(()=>({
        body:document.documentElement.scrollWidth,
        screen:window.innerWidth,
        canvas:document.querySelector<HTMLCanvasElement>('#game-container canvas')?.width
      }));
      expect(check.body).toBeLessThanOrEqual(check.screen+2);
      expect(check.canvas).toBe(BOARD.width);
    });
}
