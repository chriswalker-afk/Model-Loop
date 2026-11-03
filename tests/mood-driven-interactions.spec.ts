import {test,expect} from '@playwright/test';
import {GameStore} from '../src/game/state';
import {HouseholdBehaviourEngine,behaviourOdds} from '../src/game/behaviors';
import {NeighbourhoodStories,NEIGHBOUR_HELP_PROBABILITIES} from '../src/game/neighbours';
import {moodHelpfulChance,moodNeighbourHelpChance,moodLitterChance} from '../src/game/mood';
import {BOARD,type Cell} from '../src/game/config';

const road:Cell={x:4,y:3};

test('mood shifts helpful versus troublesome decisions smoothly, with uncertain outcomes',()=>{
  const moods=[0,1,12,15,30,44,45,55,71,72,84,95,99,100];
  const probabilities=moods.map(mood=>moodHelpfulChance(mood));
  expect(probabilities[0]).toBeCloseTo(.78,6);
  expect(probabilities.at(-1)).toBeCloseTo(.22,6);
  for(let i=1;i<moods.length;i++){
    expect(probabilities[i]).toBeLessThan(probabilities[i-1]);
    expect(probabilities[i]).toBeGreaterThan(0);
    expect(probabilities[i]).toBeLessThan(1);
  }
  expect(moodHelpfulChance(45)-moodHelpfulChance(45.01)).toBeLessThan(.001);
  expect(moodHelpfulChance(72)-moodHelpfulChance(72.01)).toBeLessThan(.001);
  expect(moodHelpfulChance(-50)).toBe(moodHelpfulChance(0));
  expect(moodHelpfulChance(140)).toBe(moodHelpfulChance(100));
  expect(moodHelpfulChance(Number.NaN)).toBeCloseTo(.50,3);
  for(const mood of [0,12,45,72,100]){
    const odds=behaviourOdds(0,mood,road,[]);
    expect(odds.helpfulChance).toBeCloseTo(moodHelpfulChance(mood),8);
    expect(odds.troublesomeChance).toBeCloseTo(1-odds.helpfulChance,8);
    expect(odds.eventChance).toBe(.38); // One existing event opportunity.
  }
});

test('low irritation favours helpful actions, high irritation favours troublesome actions',()=>{
  const choose=(irritation:number)=>{
    const behaviour=new HouseholdBehaviourEngine(811);
    const draws=[.05,.50];
    let index=0;
    behaviour.rng.next=()=>draws[index++%draws.length];
    return behaviour.choose(0,irritation,road,0,[],false);
  };
  expect(choose(12)?.tone).toBe('helpful');
  expect(choose(94)?.tone).toBe('troublesome');
});

test('seeded opportunity sampling shows a large but not absolute behavioural effect',()=>{
  const run=(irritation:number)=>{
    const behaviour=new HouseholdBehaviourEngine(7108);
    let good=0,bad=0;
    for(let i=0;i<600;i++){
      const chosen=behaviour.choose(3,irritation,road,i*60,[],false);
      if(!chosen)continue;
      chosen.tone==='helpful'?good++:bad++;
      behaviour.mark(3,i*60);
    }
    return {good,bad};
  };
  const calm=run(10),frustrated=run(90);
  expect(calm.good+calm.bad).toBeGreaterThan(160);
  expect(frustrated.good+frustrated.bad).toBeGreaterThan(160);
  expect(calm.good/(calm.good+calm.bad)).toBeGreaterThan(.6);
  expect(frustrated.good/(frustrated.good+frustrated.bad)).toBeLessThan(.4);
  expect(frustrated.bad).toBeGreaterThan(calm.bad);
  expect(run(10)).toEqual(calm);
});

test('real outstanding neighbourly help is more likely when actor irritation is low',()=>{
  for(const [kind,base] of Object.entries(NEIGHBOUR_HELP_PROBABILITIES)){
    const low=moodNeighbourHelpChance(base,10);
    const neutral=moodNeighbourHelpChance(base,50);
    const high=moodNeighbourHelpChance(base,90);
    expect(low).toBeGreaterThan(neutral);
    expect(neutral).toBeGreaterThan(high);
    expect(neutral).toBeCloseTo(base,8);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeLessThan(1);
  }
  const engine=new NeighbourhoodStories(931);
  const story=engine.begin('sketch',1,{x:4,y:4},0,'A sketch appeared.');
  const request=engine.request(story,'marsh-admire',1,road,{x:4,y:4},0)!;
  engine.rng.next=()=>.36;
  expect(engine.candidate(3,road,3,8)?.id).toBe(request.id);
  expect(engine.candidate(3,road,3,92)).toBeNull();
  expect(engine.pending).toHaveLength(1); // A missed offer isn't destroyed.
  expect(engine.complete(request,3,'A neighbour admired the sketch.')).toBeTruthy();
  expect(engine.pending).toHaveLength(0);
});

test('activities become messier under strain without giving non-food tasks litter',()=>{
  for(const base of [.12,.20,.42,.78]){
    const low=moodLitterChance(base,10);
    const high=moodLitterChance(base,90);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThan(1);
    expect(low).toBeGreaterThan(0);
  }
  expect(moodLitterChance(0,100)).toBe(0);
  expect(moodLitterChance(.20,50)).toBeCloseTo(.215,4);
  const start=(irritation:number)=>{
    const game=new GameStore(true);
    game.newRun(71);
    game.residents[3].irritation=irritation;
    expect(game.debugActivity('picnic',road)).toBe(true);
    return game.activities.forResident(3)!.litterChance;
  };
  expect(start(95)).toBeGreaterThan(start(10));
  expect(start(95)).toBeLessThan(1);
  expect(start(10)).toBeGreaterThan(0);
});

test('an actual family response respects mood and still grants no extra coins or actions',()=>{
  const make=(irritation:number)=>{
    const game=new GameStore(true);
    game.newRun(134);
    expect(game.debugActivity('sketch',road)).toBe(true);
    game.tickEconomy(11.1);
    game.tickEconomy(2.1);
    expect(game.neighbours.pending.some(t=>t.kind==='marsh-admire')).toBe(true);
    game.residents[3].irritation=irritation;
    game.residents[3].lastEventLap=game.residents[3].laps;
    game.neighbours.rng.next=()=>.36;
    return game;
  };
  const calm=make(8);
  const calmCoins=calm.money;
  const calmHelp=calm.ledger.helpfulActions;
  calm.passTile(3,road);
  expect(calm.neighbours.pending.some(t=>t.kind==='marsh-admire')).toBe(false);
  expect(calm.ledger.neighbourResponses).toBe(1);
  expect(calm.money).toBe(calmCoins);
  expect(calm.ledger.helpfulActions).toBe(calmHelp);
  const tense=make(92);
  tense.passTile(3,road);
  expect(tense.neighbours.pending.some(t=>t.kind==='marsh-admire')).toBe(true);
  expect(tense.ledger.neighbourResponses).toBe(0);
});

test('household detail explains its mood-dependent choices without an extra permanent HUD',async({page})=>{
  await page.goto('/?referenceTown=1');
  await page.locator('[data-resident="3"]').first().click();
  const details=page.locator('#household-detail');
  await expect(details).toBeVisible();
  const section=details.locator('.family-mood-influence');
  await expect(section.locator('summary')).toHaveText('How mood shapes their choices');
  await section.locator('summary').click();
  await expect(section.locator('.family-mood-odds')).toContainText('spontaneous actions are helpful');
  const textBefore=await section.locator('.family-mood-odds').textContent();
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.residents[3].irritation=95;
    store.notify();
  });
  const textAfter=await section.locator('.family-mood-odds').textContent();
  expect(textBefore).not.toEqual(textAfter);
  expect(await section.getAttribute('open')).not.toBeNull();
  await expect(section).toContainText('Nearby miniatures');
  expect((await page.evaluate(()=>document.documentElement.scrollWidth)))
    .toBeLessThanOrEqual((await page.evaluate(()=>window.innerWidth))+2);
});
