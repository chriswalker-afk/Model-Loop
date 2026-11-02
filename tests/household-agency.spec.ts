import { test, expect } from '@playwright/test';
import { GameStore } from '../src/game/state';
import {
  HOUSEHOLD_ACTIONS, MODEL_BEHAVIOUR_MODIFIERS,
  BEHAVIOUR_COOLDOWN_SECONDS, BEHAVIOUR_MAX_HISTORY,
  HouseholdBehaviourEngine, behaviourOdds, householdActionPair,
  previewBehaviourInfluence
} from '../src/game/behaviors';
import { ROAD_CELLS, type Cell } from '../src/game/config';

const road:Cell={x:4,y:3};
const make=(seed=31)=>{
  const store=new GameStore();
  store.newRun(seed);
  return store;
};

test('all six named households have exactly one helpful and one troublesome, unique action',()=>{
  expect(HOUSEHOLD_ACTIONS).toHaveLength(6);
  expect(HOUSEHOLD_ACTIONS.map(row=>row.residentId)).toEqual([0,1,2,3,4,5]);
  const used:string[]=[];
  for(const row of HOUSEHOLD_ACTIONS){
    expect(householdActionPair(row.residentId)).toEqual(row);
    expect(row.helpful.tone).toBe('helpful');
    expect(row.troublesome.tone).toBe('troublesome');
    expect(row.helpful.label.length).toBeGreaterThan(6);
    expect(row.troublesome.label.length).toBeGreaterThan(6);
    used.push(row.helpful.id,row.troublesome.id);
    const store=make(100+row.residentId);
    expect(store.debugHouseholdAction(row.residentId,row.helpful.id,road)).toBe(true);
    expect(store.behaviourHistory[0]).toMatchObject({
      residentId:row.residentId,action:row.helpful.id,tone:'helpful'
    });
    expect(store.debugHouseholdAction(row.residentId,row.troublesome.id,road)).toBe(true);
    expect(store.behaviourHistory[0]).toMatchObject({
      residentId:row.residentId,action:row.troublesome.id,tone:'troublesome'
    });
    expect(store.behaviourHistory).toHaveLength(2);
    expect(store.debugHouseholdAction(row.residentId,
      HOUSEHOLD_ACTIONS[(row.residentId+1)%6].helpful.id,road)).toBe(false);
  }
  expect(new Set(used).size).toBe(12);
});

test('mood shifts helpful/troublesome odds but neither outcome is guaranteed',()=>{
  const low=behaviourOdds(0,12,road,[]);
  const mid=behaviourOdds(0,55,road,[]);
  const high=behaviourOdds(0,84,road,[]);
  expect(low.helpfulChance).toBeGreaterThan(mid.helpfulChance);
  expect(mid.helpfulChance).toBeGreaterThan(high.helpfulChance);
  expect(low.helpfulChance).toBeCloseTo(.7);
  expect(mid.helpfulChance).toBeCloseTo(.5);
  expect(high.helpfulChance).toBeCloseTo(.3);
  expect(high.troublesomeChance).toBeLessThan(1);
  expect(low.troublesomeChance).toBeGreaterThan(0);
  expect(low.eventChance).toBeGreaterThan(.3);
  expect(low.eventChance).toBeLessThan(.65);
});

test('every placed miniature has a grounded way to mitigate or amplify nearby actions',()=>{
  for(const model of ['lamp','tree','bench','limit','police','bin']){
    expect(MODEL_BEHAVIOUR_MODIFIERS.some(x=>x.modelId===model)).toBe(true);
  }
  const sign=behaviourOdds(0,40,road,[{x:4,y:4,id:'limit',care:'full'}]);
  const baseline=behaviourOdds(0,40,road,[]);
  expect(sign.helpfulChance).toBeGreaterThan(baseline.helpfulChance);
  expect(behaviourOdds(5,80,road,[{x:4,y:4,id:'lamp'}]).helpfulChance)
    .toBeGreaterThan(behaviourOdds(5,80,road,[]).helpfulChance);
  const bellsWithBench=behaviourOdds(1,42,road,[{x:4,y:4,id:'bench'}]);
  expect(bellsWithBench.eventChance).toBeGreaterThan(baseline.eventChance);
  expect(bellsWithBench.helpfulChance).toBeLessThan(
    behaviourOdds(1,42,road,[]).helpfulChance);
  const bare=behaviourOdds(0,40,road,[{x:4,y:4,id:'limit',care:'bare'}]);
  expect(bare.helpfulChance).toBeGreaterThan(baseline.helpfulChance);
  expect(bare.helpfulChance).toBeLessThan(sign.helpfulChance);
  const far=behaviourOdds(0,40,road,[{x:20,y:7,id:'limit'}]);
  expect(far).toEqual(baseline);
});

test('placement preview uses exactly the real, nearby and care-dependent probability model',()=>{
  const store=make();
  const cell={x:4,y:4};
  const p=store.previewPlacement(cell,'limit');
  expect(p.allowed).toBe(true);
  const finch=p.behaviourEffects.find(row=>row.residentId===0)!;
  const ward=p.behaviourEffects.find(row=>row.residentId===5)!;
  expect(finch.helpfulAfter).toBeGreaterThan(finch.helpfulBefore);
  expect(ward.helpfulAfter).toBeGreaterThan(ward.helpfulBefore);
  expect(finch.reasons[0]).toContain('Finches');
  expect(p.behaviourEffects.every(row=>row.reasons.length>0)).toBe(true);
  const direct=previewBehaviourInfluence(cell,'limit',[],store.residents);
  expect(p.behaviourEffects).toEqual(direct);
  expect(store.place(cell,'limit')).toBe(true);
  const full=behaviourOdds(0,12,road,store.placements);
  expect(store.setModelCare(cell,'bare')).toBe(true);
  const bare=behaviourOdds(0,12,road,store.placements);
  expect(bare.helpfulChance).toBeLessThan(full.helpfulChance);
});

test('one seeded opportunity per circuit, not two independent traffic and environment rolls',()=>{
  const store=make(555);
  const id=0;
  const offset=ROAD_CELLS.findIndex(cell=>cell.x===3&&cell.y===3);
  expect(offset).toBeGreaterThanOrEqual(0);
  for(let i=0;i<ROAD_CELLS.length;i++){
    store.passTile(id,ROAD_CELLS[(offset+i)%ROAD_CELLS.length]);
  }
  const before=store.behaviourHistory.length;
  expect(store.residents[id].lastEventLap).toBe(0);
  for(let i=0;i<ROAD_CELLS.length;i++){
    store.passTile(id,ROAD_CELLS[(offset+i)%ROAD_CELLS.length]);
  }
  expect(store.behaviourHistory.length).toBe(before);
  store.finishLap(id);
  for(let i=0;i<ROAD_CELLS.length;i++){
    store.passTile(id,ROAD_CELLS[(offset+i)%ROAD_CELLS.length]);
  }
  expect(store.residents[id].lastEventLap).toBe(1);
  expect(store.behaviourHistory.length).toBeLessThanOrEqual(before+1);
});

test('the same seed and movements give the same action choices and messages',()=>{
  const simulate=()=>{
    const store=make(931);
    const first=ROAD_CELLS.findIndex(cell=>cell.x===3&&cell.y===3);
    for(let lap=0;lap<7;lap++){
      for(let id=0;id<6;id++){
        for(let i=0;i<ROAD_CELLS.length;i++){
          store.passTile(id,ROAD_CELLS[(first+i)%ROAD_CELLS.length]);
        }
        store.finishLap(id);
      }
      store.tickEconomy(65);
    }
    return store.behaviourHistory.map(row=>({
      id:row.residentId,action:row.action,tone:row.tone,message:row.message
    }));
  };
  const a=simulate(),b=simulate();
  expect(a).toEqual(b);
  expect(a.length).toBeGreaterThan(0);
  expect(a.length).toBeLessThanOrEqual(BEHAVIOUR_MAX_HISTORY);
  expect(BEHAVIOUR_COOLDOWN_SECONDS).toBeGreaterThan(20);
});

test('Millers genuinely mend tyre scuffs, improving Safety; Marshes actually remove litter',()=>{
  const store=make();
  expect(store.debugHouseholdAction(0,'skid',road)).toBe(true);
  expect(store.environment.effects.some(e=>e.kind==='skid')).toBe(true);
  expect(store.safety).toBe(78);
  expect(store.debugHouseholdAction(2,'mend',road)).toBe(true);
  expect(store.environment.effects.some(e=>e.kind==='skid')).toBe(false);
  expect(store.environment.effects.some(e=>e.kind==='mended')).toBe(true);
  expect(store.safety).toBeGreaterThanOrEqual(90);
  const before=store.environment.effects.length;
  expect(store.debugHouseholdAction(2,'litter',road)).toBe(true);
  expect(store.environment.effects.filter(e=>e.kind==='litter')).toHaveLength(1);
  expect(store.debugHouseholdAction(3,'tidy',road)).toBe(true);
  expect(store.environment.effects.some(e=>e.kind==='litter')).toBe(false);
  expect(store.environment.effects.some(e=>e.kind==='tidied')).toBe(true);
  expect(store.environment.effects.length).toBeLessThanOrEqual(before+2);
  expect(store.behaviourHistory[0].message).toContain('wrapper was collected');
});

test('Finch courtesy and Ward guidance can shorten real traffic stops',()=>{
  const store=make();
  expect(store.debugTrafficStop(1,road,6)).toBe(true);
  const before=store.traffic.activeStop!.endsAt;
  expect(store.debugHouseholdAction(0,'courtesy',road)).toBe(true);
  expect(store.traffic.activeStop!.endsAt).toBeLessThan(before);
  expect(store.debugHouseholdAction(5,'guide',road)).toBe(true);
  expect(store.traffic.activeStop!.endsAt).toBeLessThan(before-1.8);
  expect(store.environment.effects.some(e=>e.kind==='guidance')).toBe(true);
  expect(store.behaviourHistory[0].message).toContain('queue began to clear sooner');
});

test('Hales display slows actual cars until it fades, and Marsh roadside chat creates a real stop',()=>{
  const store=make();
  expect(store.speedMultiplierAt(road)).toBe(1);
  expect(store.debugHouseholdAction(4,'display',road)).toBe(true);
  expect(store.speedMultiplierAt(road)).toBe(.7);
  expect(store.environment.effects.some(e=>e.kind==='display')).toBe(true);
  expect(store.debugHouseholdAction(3,'chat',road)).toBe(true);
  expect(store.traffic.activeStop).toMatchObject({residentId:3,kind:'chatting'});
  expect(store.debugHouseholdAction(1,'admire',road)).toBe(false);
  store.tickEconomy(65);
  expect(store.speedMultiplierAt(road)).toBe(1);
  expect(store.traffic.activeStop).toBeNull();
  expect(store.cashflow.gross).toBe(0);
});

test('new positive effects actually improve Beauty, Noise, Safety or resident comfort',()=>{
  const store=make();
  const target=store.tileInfo(road)!;
  expect(store.debugHouseholdAction(5,'guide',road)).toBe(true);
  const helped=store.tileInfo(road)!;
  expect(helped.noise).toBeLessThan(target.noise);
  expect(helped.roadSafety).toBe(target.roadSafety);
  expect(store.safety).toBeGreaterThanOrEqual(90);
  expect(store.debugHouseholdAction(4,'restore',road)).toBe(true);
  const detail=store.environment.effects.find(e=>e.kind==='heritage')!;
  expect(store.tileInfo(detail.cell)!.beauty).toBeGreaterThan(1);
  const before=store.residents[5].irritation;
  store.passTile(5,road);
  expect(store.residents[5].irritation).toBeLessThan(before+.35);
});

test('browser shows the source family, all twelve actions and an optional model forecast',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/The Generational Cycle/);
  await page.locator('[data-resident="4"]').first().click();
  await expect(page.locator('#household-detail')).toContainText('Restores a familiar detail');
  await expect(page.locator('#household-detail')).toContainText('Puts out a roadside display');
  const ok=await page.evaluate(()=>(
    window as typeof window & {__modelLoopDebug:{
      behaviourAction:(id:number,action:string,x:number,y:number)=>boolean
    }}
  ).__modelLoopDebug.behaviourAction(4,'display',4,3));
  expect(ok).toBe(true);
  await expect(page.locator('#household-detail')).toContainText('little display');
  await expect(page.locator('#notice')).toContainText('Hales');
  const effects=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.environment.effects.map(e=>({kind:e.kind,cell:e.cell}));
  });
  const patch=effects.find(effect=>effect.kind==='display');
  expect(patch).toBeDefined();
  await page.evaluate(async (cell)=>{
    // Pressed into an existing, inspectable tile panel: no new floating HUD.
    const {store}=await import('/src/game/state.ts');
    store.selectTile(cell);
  },patch!.cell);
  await expect(page.locator('#tile-panel')).toContainText('Roadside display');
  await page.locator('[data-action="close-household"]').click();
  await page.getByRole('button',{name:/Select Speed Sign/}).click();
  const rect=await page.locator('#game-container canvas').boundingBox();
  if(!rect)throw new Error('No canvas');
  // Use a clear square away from the Hales' new roadside display.
  const x=rect.x+(60+6.5*43)/1152*rect.width;
  const y=rect.y+(48+3.5*43)/620*rect.height;
  await page.mouse.move(x,y);
  await expect(page.locator('.behaviour-forecast summary')).toBeVisible();
  await page.locator('.behaviour-forecast summary').click();
  await expect(page.locator('.behaviour-forecast')).toContainText('The Finches');
  await expect(page.locator('.behaviour-forecast')).toContainText('Helpful action');
  expect(errors).toEqual([]);
});

test('compact and phone layouts preserve readable behaviour details and usual shop',async({page})=>{
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  await page.locator('[data-resident="3"]').first().click();
  await expect(page.locator('#household-detail')).toContainText('Tidies the verge');
  await expect(page.locator('#household-detail')).toContainText('Stops for a conversation');
  const box=await page.locator('#game-container canvas').boundingBox();
  expect(box?.width).toBeGreaterThan(700);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#shop-section')).toBeVisible();
  await expect(page.locator('.model-box')).toHaveCount(6);
  await expect(page.locator('#household-detail')).toContainText('The Marshes');
  const bodyWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(392);
});


test('non-Miller roadside pauses can generate incidental litter without a second action',()=>{
  const store=make(441);
  const bin={x:4,y:4};
  expect(store.place(bin,'bin')).toBe(true);
  store.residents[1].nextEventOffset=0;
  // Force the normal opportunity's result while preserving the *natural*
  // action path. A tiny wrapper is a consequence of the same Bell pause.
  store.behaviour.choose=()=>householdActionPair(1).troublesome;
  store.environment.rng.next=()=>0;
  store.passTile(1,road);
  expect(store.traffic.activeStop?.kind).toBe('admiring');
  expect(store.behaviourHistory).toHaveLength(1);
  expect(store.behaviourHistory[0]).toMatchObject({
    residentId:1,action:'admire',tone:'troublesome'
  });
  expect(store.getBinStatus(bin)?.fill).toBe(1);
  expect(store.environment.effects.filter(x=>x.kind==='litter')).toHaveLength(0);
  expect(store.behaviourHistory[0].message).toContain('rubbish bin');
  // The household's second lap over the same square produces no new act.
  store.passTile(1,road);
  expect(store.behaviourHistory).toHaveLength(1);
});
