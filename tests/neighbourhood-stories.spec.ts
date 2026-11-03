import { test, expect } from '@playwright/test';
import {
  HOMES, ROAD_CELLS, isRoad, isOnBoard, isScenery,
  type Cell
} from '../src/game/config';
import { GameStore } from '../src/game/state';
import { leftVergeContact, roadsideImpactChance,
  RoadsideAccidentEngine } from '../src/game/damage';
import { NeighbourhoodStories,
  MAX_NEIGHBOUR_NOTES, MAX_NEIGHBOUR_REQUESTS, NEIGHBOUR_RESPONSE_COOLDOWN,
  NEIGHBOUR_HELP_PROBABILITIES } from '../src/game/neighbours';

const site=ROAD_CELLS.flatMap(road=>[
  {road,model:{x:road.x+1,y:road.y}},{road,model:{x:road.x-1,y:road.y}},
  {road,model:{x:road.x,y:road.y+1}},{road,model:{x:road.x,y:road.y-1}}
]).find(({road,model})=>isOnBoard(model.x,model.y) &&
  !isRoad(model.x,model.y) && !isScenery(model.x,model.y) &&
  !HOMES.some(home=>home.x===model.x&&home.y===model.y) &&
  leftVergeContact(road,model))!;
const road:Cell={x:4,y:3};
const make=(seed=9331)=>{
  const store=new GameStore(true);store.newRun(seed);return store;
};
const avoidExtraActions=(store:GameStore,id:number)=>{
  store.residents[id].lastEventLap=store.residents[id].laps;
};

test('one concrete crash creates a linked but bounded Ward/Hale follow-up thread',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  expect(store.neighbours.pending.map(task=>task.kind).sort())
    .toEqual(['hale-restore','ward-visit']);
  expect(store.neighbours.history).toHaveLength(1);
  expect(store.neighbours.history[0]).toMatchObject({
    kind:'accident',sourceResidentId:0,cell:site.model
  });
  const thread=store.neighbours.history[0].storyId;
  expect(store.neighbours.pending.every(task=>task.storyId===thread)).toBe(true);
  expect(store.driverCautionFactor(0)).toBe(.82);
  expect(store.driverCautionFactor(5)).toBe(1);
  store.tickEconomy(3);
  expect(store.driverCautionFactor(0)).toBe(.82);
  avoidExtraActions(store,5);
  store.neighbours.rng.next=()=>0;
  store.passTile(5,site.road);
  expect(store.accidents.active[0]?.wardHelped).toBe(true);
  expect(store.runSummary.wardAssists).toBe(1);
  expect(store.neighbours.history[0]).toMatchObject({
    storyId:thread,kind:'ward-visit',actorId:5
  });
  const money=store.money,progress=store.progress;
  avoidExtraActions(store,4);
  store.passTile(4,site.road);
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  expect(store.neighbours.history[0]).toMatchObject({
    storyId:thread,kind:'hale-restore',actorId:4
  });
  expect(store.neighbours.pending).toHaveLength(0);
  expect(store.runSummary.neighbourResponses).toBe(2);
  expect(store.money).toBe(money);
  expect(store.progress).toBe(progress);
  expect(store.ledger.helpfulActions).toBe(0);
  expect(store.residents[0].irritation).toBeLessThan(15);
  expect(store.neighbours.notesForResident(0).length).toBe(3);
  store.tickEconomy(27);
  expect(store.driverCautionFactor(0)).toBe(1);
});

test('neighbours cannot teleport, respond while paused or create duplicate rewards',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'damage')).toBe(true);
  store.neighbours.rng.next=()=>0;
  avoidExtraActions(store,4);
  store.tickEconomy(3);
  const far=ROAD_CELLS.find(cell=>Math.abs(cell.x-site.road.x)+
    Math.abs(cell.y-site.road.y)>7)!;
  store.passTile(4,far);
  expect(store.neighbours.history).toHaveLength(1);
  const before=store.money;
  store.togglePause();
  store.passTile(4,site.road);
  expect(store.neighbours.history).toHaveLength(1);
  store.togglePause();
  store.passTile(4,site.road);
  expect(store.neighbours.history).toHaveLength(2);
  expect(store.money).toBe(before);
  const done=store.runSummary.neighbourResponses;
  store.passTile(4,site.road);
  expect(store.runSummary.neighbourResponses).toBe(done);
});

test('a player repair cancels the unnecessary Hale response',()=>{
  const store=make();
  expect(store.place(site.model,'bench')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  expect(store.neighbours.pending.some(task=>task.kind==='hale-restore')).toBe(true);
  expect(store.repairModel(site.model)).toBe(true);
  expect(store.neighbours.pending.some(task=>task.kind==='hale-restore')).toBe(false);
  avoidExtraActions(store,4);
  store.tickEconomy(3);
  store.neighbours.rng.next=()=>0;
  store.passTile(4,site.road);
  expect(store.getPlacedModel(site.model)?.condition).toBe('intact');
  expect(store.runSummary.neighbourResponses).toBe(0);
});

test('the Marshes clean real scraps from a picnic, not unrelated road tiles',()=>{
  const store=make(2008);
  expect(store.debugActivity('picnic',road)).toBe(true);
  store.activities.rng.next=()=>0;
  store.tickEconomy(13.1);
  const task=store.neighbours.pending.find(task=>task.kind==='marsh-clean')!;
  expect(task).toBeTruthy();
  expect(store.environment.effects.some(effect=>effect.id===task.effectId)).toBe(true);
  const before=store.money;
  store.tickEconomy(2.1); // let the other car genuinely arrive later
  avoidExtraActions(store,3);
  store.neighbours.rng.next=()=>0;
  store.passTile(3,road);
  expect(store.environment.effects.some(effect=>effect.id===task.effectId)).toBe(false);
  expect(store.neighbours.history[0]).toMatchObject({
    kind:'marsh-clean',storyId:task.storyId,actorId:3
  });
  expect(store.money).toBe(before);
  expect(store.runSummary.neighbourResponses).toBe(1);
  expect(store.ledger.manualClearances).toBe(0);
});

test('bin capture and paid cleanup cannot leave ghost requests',()=>{
  const caught=make();
  expect(caught.place({x:4,y:4},'bin')).toBe(true);
  expect(caught.debugActivity('picnic',road)).toBe(true);
  caught.activities.rng.next=()=>0;
  caught.environment.rng.next=()=>0;
  caught.tickEconomy(13.1);
  expect(caught.neighbours.pending.some(t=>t.kind==='marsh-clean')).toBe(false);

  const dirty=make();
  expect(dirty.debugActivity('picnic',road)).toBe(true);
  dirty.activities.rng.next=()=>0;
  dirty.tickEconomy(13.1);
  const task=dirty.neighbours.pending.find(t=>t.kind==='marsh-clean')!;
  expect(task).toBeTruthy();
  expect(dirty.cleanLitter(task.target)).toBe(true);
  expect(dirty.neighbours.pending.some(t=>t.kind==='marsh-clean')).toBe(false);
});

test('the Bells leave art that the Marshes can genuinely notice',()=>{
  const store=make(109);
  expect(store.debugActivity('sketch',road)).toBe(true);
  store.tickEconomy(11.1);
  const task=store.neighbours.pending.find(t=>t.kind==='marsh-admire')!;
  expect(task).toBeTruthy();
  store.tickEconomy(2.1); // neighbours cannot respond at the instant a sketch is made
  avoidExtraActions(store,3);
  store.neighbours.rng.next=()=>0;
  store.passTile(3,road);
  expect(store.neighbours.history[0]).toMatchObject({
    kind:'marsh-admire',actorId:3,sourceResidentId:1
  });
  expect(store.neighbours.history[0].message).toContain('sketch');
  expect(store.runSummary.neighbourResponses).toBe(1);
  expect(store.environment.effects.some(e=>e.kind==='sketch')).toBe(true);
});

test('existing Hale and Ward helpful actions fulfil the same pending story',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  expect(store.debugHouseholdAction(5,'guide',site.road)).toBe(true);
  expect(store.debugHouseholdAction(4,'restore',site.road)).toBe(true);
  expect(store.neighbours.pending).toHaveLength(0);
  expect(store.neighbours.history.filter(x=>x.storyId===1)).toHaveLength(3);
  // These were already legitimate household actions, not rolled again.
  expect(store.ledger.helpfulActions).toBe(2);
  expect(store.runSummary.neighbourResponses).toBe(0);
  expect(store.runSummary.wardAssists).toBe(1);
  expect(store.runSummary.haleRestorations).toBe(1);
});

test('an ordinary helpful Hale action prevents a second response on that same tile',()=>{
  const store=make();
  expect(store.place(site.model,'lamp')).toBe(true);
  expect(store.debugRoadsideAccident(0,site.road,site.model,'break')).toBe(true);
  store.tickEconomy(3);
  store.residents[4].nextEventOffset=0;
  store.residents[4].lastEventLap=-1;
  store.neighbours.rng.next=()=>0;
  store.behaviour.choose=()=>({
    id:'restore',tone:'helpful',mechanic:'roadside',environmentKind:'heritage',
    label:'Restores a familiar detail',
    message:'The Hales carefully restored an old roadside detail.',
    afterRemark:'We should look after it.'
  });
  store.passTile(4,site.road);
  expect(store.ledger.helpfulActions).toBe(1);
  expect(store.runSummary.neighbourResponses).toBe(0);
  expect(store.getPlacedModel(site.model)?.condition).toBe('damaged');
  expect(store.neighbours.history.filter(x=>x.kind==='hale-restore')).toHaveLength(1);
});

test('requests, histories and cooldowns are capped and reproducible',()=>{
  const run=()=>{
    const engine=new NeighbourhoodStories(44);
    const root=engine.begin('accident',0,site.model,0,'A roadside mishap.');
    const task=engine.request(root,'hale-restore',0,site.road,site.model,0)!;
    expect(engine.request(root,'hale-restore',0,site.road,site.model,0)).toBeNull();
    expect(engine.candidate(4,site.road,0)).toBeNull(); // no immediate arrival
    engine.rng.next=()=>0;
    const first=engine.candidate(4,site.road,3)!;
    expect(first?.id).toBe(task.id);
    expect(engine.complete(first,3,'The Hales fixed one loose part.')).toBeTruthy();
    expect(engine.candidate(4,site.road,3)).toBeNull();
    for(let i=0;i<40;i++){
      const id=engine.begin('litter',2,{x:i,y:0},10+i,'A delivery left paper.');
      engine.request(id,'marsh-clean',2,site.road,{x:i,y:0},10+i);
    }
    expect(engine.history.length).toBe(MAX_NEIGHBOUR_NOTES);
    expect(engine.pending.length).toBeLessThanOrEqual(MAX_NEIGHBOUR_REQUESTS);
    engine.tick(500);
    expect(engine.pending).toHaveLength(0);
    return engine.history.map(note=>({story:note.storyId,kind:note.kind,
      message:note.message,actor:note.actorId,time:note.time}));
  };
  expect(NEIGHBOUR_RESPONSE_COOLDOWN).toBeGreaterThanOrEqual(60);
  expect(run()).toEqual(run());
});

test('multi-seed risk calibration prefers slower, protected drivers without frequent damage',()=>{
  const high={speed:103,bend:true,obscured:true,protected:false};
  const safe={speed:75,bend:true,obscured:false,protected:true};
  let highTotal=0,safeTotal=0;
  const samples=Array.from({length:18},(_,i)=>i+1);
  for(const seed of samples){
    for(const [resident,risk,level] of [
      [0,high,'high'],[5,safe,'safe']
    ] as const){
      const engine=new RoadsideAccidentEngine(seed);
      let condition:'intact'|'damaged'='intact';
      for(let t=0;t<480;t+=.5){
        engine.tick(t);
        const model={...site.model,id:'lamp' as const,condition};
        const event=engine.consider(resident,site.road,[model],t,risk);
        if(event){
          if(level==='high')highTotal++;
          else safeTotal++;
          condition='intact'; // repair between independent opportunities
        }
      }
    }
  }
  expect(highTotal).toBeGreaterThan(safeTotal);
  expect(highTotal).toBeLessThan(samples.length*8);
  expect(roadsideImpactChance(5,safe)).toBeLessThan(roadsideImpactChance(0,high));
  console.log('NEIGHBOURHOOD_RISK_TRIALS '+JSON.stringify({seeds:samples.length,
    highTotal,safeTotal}));
});

test('browser offers compact, keyboard-accessible story details on desktop and mobile',async({page})=>{
  await page.goto('/?referenceTown=1');
  const placed=await page.evaluate(async({model})=>{
    const {store}=await import('/src/game/state.ts');
    return store.place(model,'lamp');
  },{model:site.model});
  expect(placed).toBe(true);
  const success=await page.evaluate(({road,model})=>(
    window as typeof window & {__modelLoopDebug:{
      impact:(id:number,rx:number,ry:number,mx:number,my:number,kind:string)=>boolean
    }}).__modelLoopDebug.impact(0,road.x,road.y,model.x,model.y,'damage'),
    {road:site.road,model:site.model});
  expect(success).toBe(true);
  await page.locator('[data-resident="0"]').first().click();
  const family=page.locator('#household-detail');
  await expect(family.locator('.family-neighbourhood summary'))
    .toContainText('Shared moments');
  await family.locator('.family-neighbourhood summary').click();
  await expect(family.locator('.neighbourhood-story-list'))
    .toContainText('clipped');
  await page.evaluate(async(cell)=>{
    const {store}=await import('/src/game/state.ts');
    store.selectTile(cell);
  },site.model);
  const details=page.locator('#tile-panel .neighbourhood-stories');
  await expect(details.locator('summary')).toContainText('What happened nearby');
  await details.locator('summary').click();
  await expect(details.locator('.neighbourhood-story-list')).toContainText('clipped');
  // A repaint must not collapse the user's story or steal keyboard focus.
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.notify();
  });
  await expect(details).toHaveAttribute('open','');
  await page.setViewportSize({width:390,height:790});
  await expect(page.locator('#household-detail .family-neighbourhood summary'))
    .toBeVisible();
  await expect(details.locator('summary')).toBeVisible();
  expect(await page.evaluate(()=>{
    const e=document.querySelector('.neighbourhood-stories');
    return e?getComputedStyle(e).display!=='none':false;
  })).toBe(true);
});
