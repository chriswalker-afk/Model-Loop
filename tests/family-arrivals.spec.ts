import { test, expect, type Page } from '@playwright/test';
import { FOUNDING_STORIES, foundingNeighbourHints } from '../src/game/founding';
import { GameStore } from '../src/game/state';

function canvasPoint(page:Page,x:number,y:number) {
  return page.locator('#game-container canvas').boundingBox().then(bounds => {
    if (!bounds) throw new Error('Town canvas missing');
    return {
      x:bounds.x+(60+(x+.5)*43)/1152*bounds.width,
      y:bounds.y+(48+(y+.5)*43)/620*bounds.height
    };
  });
}

test('six founding stories, keepsakes and directional neighbour instincts stay distinct', () => {
  expect(FOUNDING_STORIES).toHaveLength(6);
  expect(new Set(FOUNDING_STORIES.map(s=>s.keepsake)).size).toBe(6);
  expect(FOUNDING_STORIES.map(s=>s.id)).toEqual([0,1,2,3,4,5]);
  expect(FOUNDING_STORIES[2].closeTo).toContain(5);
  expect(FOUNDING_STORIES[5].closeTo).not.toContain(2); // Directional by design.
  const nearby=foundingNeighbourHints(4,{x:6,y:4},[
    {id:1,x:6,y:6},{id:0,x:8,y:4},{id:2,x:11,y:4}
  ]);
  expect(nearby.map(n=>({id:n.id,tone:n.tone}))).toEqual([
    {id:0,tone:'wary'},{id:1,tone:'warm'}
  ]);
});

test('an arrival requires deliberate acknowledgement and never starts the economy', () => {
  const game=new GameStore();
  game.newRun(6);
  game.chooseFoundingFamily(4);
  expect(game.foundingIntroId).toBe(4);
  game.tickEconomy(50);
  expect(game.elapsedSeconds).toBe(0);
  game.acknowledgeFoundingIntroduction();
  expect(game.foundingIntroId).toBeNull();
  const preview=game.previewFoundingHome({x:14,y:11});
  expect(preview.allowed).toBe(true);
  expect(game.placeFoundingHome({x:14,y:11})).toBe(true);
  expect(game.foundingRecentArrival).toMatchObject({
    id:4,cell:{x:14,y:11},revision:1,moved:false
  });
  game.chooseFoundingFamily(4);
  expect(game.foundingIntroId).toBeNull(); // Never replay for ordinary moving.
  expect(game.openFoundingReview()).toBe(false);
  expect(game.phase).toBe('founding');
});

test('illustrated first arrival, plot preview and miniature settling are playable', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:/The Bells, awaiting a plot/}).click();
  const dialog=page.getByRole('dialog',{name:'The Bells'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('travel sketchbook');
  await expect(dialog).toContainText('The Hales');
  await expect(dialog).toContainText('The Millers');
  await page.getByRole('button',{name:'Choose their plot'}).click();
  await expect(dialog).toHaveCount(0);
  const plot=await canvasPoint(page,7,1);
  await page.mouse.move(plot.x,plot.y);
  await expect(page.locator('#tile-peek')).toContainText('READY FOR A HOME');
  await page.mouse.click(plot.x,plot.y);
  await expect(page.locator('#founding-progress')).toHaveText('1 OF 6 HOMES');
  await expect(page.getByRole('button',{name:/The Bells, settled/})).toBeVisible();
  const traffic=await page.evaluate(() =>
    (window as typeof window&{__modelLoopDebug?:{worldArt:()=>{cars:unknown[]}}})
      .__modelLoopDebug?.worldArt().cars.length);
  expect(traffic).toBe(0);
  expect(errors).toEqual([]);
});

test('review lets the player relocate a home and explicitly begin Vintage', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    const {HOMES}=await import('/src/game/config.ts');
    for(const home of HOMES){
      store.chooseFoundingFamily(home.id);
      store.acknowledgeFoundingIntroduction();
      if(!store.placeFoundingHome({x:home.x,y:home.y}))
        throw new Error('Unable to settle '+home.name);
    }
  });
  await expect(page.locator('#founding-progress')).toHaveText('6 OF 6 HOMES');
  await expect(page.locator('#begin-vintage')).toBeEnabled();
  await page.getByRole('button',{name:'Review the founding town'}).click();
  const review=page.getByRole('dialog',{name:'A Town Begins'});
  await expect(review).toBeVisible();
  await expect(review.locator('.founding-review-list li')).toHaveCount(6);
  await review.getByRole('button',{name:'Move home'}).first().click();
  await expect(review).toHaveCount(0);
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    if(!store.placeFoundingHome({x:4,y:2}))
      throw new Error('Cannot rearrange Finches');
  });
  await page.getByRole('button',{name:'Review the founding town'}).click();
  await expect(review).toContainText('Plot 5 / 3');
  await review.getByRole('button',{name:'Begin the Vintage Years'}).click();
  await expect(page.locator('#founding-panel')).toBeHidden();
  await expect(page.locator('#shop-section')).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>
    (window as typeof window&{__modelLoopDebug?:{worldArt:()=>{cars:unknown[]}}})
      .__modelLoopDebug?.worldArt().cars.length)).toBe(6);
  expect(errors).toEqual([]);
});

test('the founding tray remains distinct from the board on tall, compact and phone screens', async ({page}) => {
  for(const size of [
    {width:1440,height:900},{width:1266,height:548},{width:390,height:844}
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const board=page.locator('.world-frame');
    const tray=page.locator('#founding-panel');
    await expect(tray).toBeVisible();
    await expect(tray.locator('.founding-card')).toHaveCount(6);
    await tray.scrollIntoViewIfNeeded();
    const a=await board.boundingBox(),b=await tray.boundingBox();
    if(!a||!b)throw new Error('Board or founding tray missing');
    const overlapX=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
    const overlapY=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    // A few overlapping border pixels are harmless; no tray may cover a
    // meaningful share of the smaller surface (the old absolute-area rule
    // incorrectly treated a thin CSS edge as an obscured town).
    const overlapFraction=(overlapX*overlapY)/
      Math.min(a.width*a.height,b.width*b.height);
    console.log('FOUNDING_LAYOUT',JSON.stringify({
      size,board:{x:a.x,y:a.y,width:a.width,height:a.height},
      tray:{x:b.x,y:b.y,width:b.width,height:b.height},
      overlapX,overlapY,overlapFraction
    }));
    expect(overlapFraction).toBeLessThan(0.02);
    expect(b.width).toBeGreaterThan(250);
  }
});
