import {test,expect,type Page} from '@playwright/test';
import {BOARD} from '../src/game/config';

const family=(page:Page,id:number)=>page.locator(
  '#household-list [data-resident="'+id+'"]');
const section=(page:Page)=>page.locator(
  '#household-detail .family-home-improvements');
const slot=(page:Page,kind:'boundary'|'garden')=>
  section(page).locator('.home-improvement-slot[data-home-slot="'+kind+'"]');

async function selectFamily(page:Page,id:number):Promise<void>{
  await family(page,id).click();
  await expect(page.locator('#household-detail')).toBeVisible();
  await expect(section(page)).toBeVisible();
}
async function openSlot(page:Page,kind:'boundary'|'garden'):Promise<void>{
  const detail=slot(page,kind);
  if(await detail.getAttribute('open')===null)
    await detail.locator('summary').first().click();
}

test('selecting a household exposes two home-owned care slots, not the old pair shop',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?referenceTown=1');
  await selectFamily(page,0);
  const home=section(page);
  await expect(home.locator('summary').first()).toContainText('Home & grounds');
  await expect(home.locator('.home-improvements-total')).toHaveText('Care 0 / 20s');
  await expect(slot(page,'boundary').locator('.home-slot-current')).toHaveText('No boundary');
  await expect(slot(page,'garden').locator('.home-slot-current')).toHaveText('No garden');
  await openSlot(page,'boundary');
  await expect(slot(page,'boundary').locator('[data-home-option]')).toHaveCount(4);
  await openSlot(page,'garden');
  await expect(slot(page,'garden').locator('[data-home-option]')).toHaveCount(4);
  await expect(page.locator('[data-boundary-pair]')).toHaveCount(0);
  await expect(page.locator('#boundary-studio')).toHaveCount(0);
  await expect(page.locator('#shop-section [data-model]')).toHaveCount(6);
  await expect(page.locator('#tile-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a purchase needs selection then confirmation; real upkeep and different slots remain visible',async({page})=>{
  await page.goto('/?referenceTown=1');
  await selectFamily(page,0);
  await openSlot(page,'boundary');
  const boundary=slot(page,'boundary');
  const purchasesBefore=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.ledger.miniaturePurchases;
  });
  await boundary.locator('[data-home-option="picket"]').click();
  await expect(boundary.locator('.home-improvement-forecast')).toContainText('Low Picket Fence');
  await expect(boundary.locator('.home-forecast-upkeep')).toContainText('0 → 1 coins / 20s');
  await expect(boundary.locator('.home-forecast-owner')).toContainText('irritation/circuit');
  await expect(boundary.locator('.home-forecast-note')).toContainText('Previewing is free');
  const noPurchase=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return {purchases:store.ledger.miniaturePurchases,home:store.homeImprovements.length};
  });
  expect(noPurchase).toEqual({purchases:purchasesBefore,home:0});
  await boundary.locator('[data-action="install-home-improvement"]').click();
  await expect(boundary.locator('.home-slot-current')).toHaveText('Low Picket Fence');
  await expect(section(page).locator('.home-improvements-total')).toHaveText('Care 1 / 20s');
  await expect(boundary.locator('[data-action="remove-home-improvement"]')).toBeEnabled();
  await expect(boundary.locator('[data-action="install-home-improvement"]')).toBeDisabled();
  await openSlot(page,'garden');
  const garden=slot(page,'garden');
  await garden.locator('[data-home-option="front"]').click();
  await expect(garden.locator('.home-forecast-upkeep')).toContainText('1 → 3 coins / 20s');
  await expect(garden.locator('.home-forecast-personal')).toContainText('-0.22 irritation');
  await expect(garden.locator('.home-forecast-local')).toContainText('Beauty +2');
  await garden.locator('[data-action="install-home-improvement"]').click();
  await expect(garden.locator('.home-slot-current')).toHaveText('Front Garden');
  await expect(boundary.locator('.home-slot-current')).toHaveText('Low Picket Fence');
  await expect(section(page).locator('.home-improvements-total')).toHaveText('Care 3 / 20s');
  const result=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return {items:store.homeImprovements.map(x=>({residentId:x.residentId,slot:x.slot,kind:x.kind})),
      paid:store.ledger.miniaturePurchases,cashflow:store.cashflow.nextUpkeep};
  });
  expect(result.items).toEqual([
    {residentId:0,slot:'boundary',kind:'picket'},
    {residentId:0,slot:'garden',kind:'front'}
  ]);
  expect(result.paid).toBe(purchasesBefore+24+28);
  expect(result.cashflow).toBe(3);
});

test('replacement and removal have full costs, no refund and immediate upkeep adjustments',async({page})=>{
  await page.goto('/?referenceTown=1');
  await selectFamily(page,1);
  await openSlot(page,'boundary');
  const boundary=slot(page,'boundary');
  await boundary.locator('[data-home-option="picket"]').click();
  await boundary.locator('[data-action="install-home-improvement"]').click();
  await boundary.locator('[data-home-option="stone"]').click();
  await expect(boundary.locator('.home-forecast-upkeep')).toContainText('1 → 2 coins / 20s');
  await expect(boundary.locator('[data-action="install-home-improvement"]')).toContainText('Replace');
  const afterFirst=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.ledger.miniaturePurchases;
  });
  await boundary.locator('[data-action="install-home-improvement"]').click();
  await expect(boundary.locator('.home-slot-current')).toHaveText('Stone Boundary Wall');
  await expect(section(page).locator('.home-improvements-total')).toHaveText('Care 2 / 20s');
  const afterSecond=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.ledger.miniaturePurchases;
  });
  expect(afterSecond-afterFirst).toBe(38);
  await boundary.locator('[data-action="remove-home-improvement"]').click();
  await expect(boundary.locator('.home-slot-current')).toHaveText('No boundary');
  await expect(section(page).locator('.home-improvements-total')).toHaveText('Care 0 / 20s');
  const afterRemove=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return {purchases:store.ledger.miniaturePurchases,
      items:store.homeImprovements.length,upkeep:store.cashflow.nextUpkeep};
  });
  expect(afterRemove.purchases).toBe(afterSecond);
  expect(afterRemove.items).toBe(0);
  expect(afterRemove.upkeep).toBe(0);
});

test('pause, inadequate funds and vacant homes prevent purchases with readable reasons',async({page})=>{
  await page.goto('/?referenceTown=1');
  await selectFamily(page,3);
  await openSlot(page,'garden');
  const garden=slot(page,'garden');
  await garden.locator('[data-home-option="flowers"]').click();
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.money=0;store.notify();
  });
  await expect(garden.locator('[data-action="install-home-improvement"]')).toBeDisabled();
  await expect(garden.locator('.home-forecast-reason')).toContainText('Not enough coins');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.money=145;store.togglePause();
  });
  await expect(garden.locator('[data-action="install-home-improvement"]')).toBeDisabled();
  await expect(garden.locator('.home-forecast-reason')).toContainText('Resume the town');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.togglePause();
    store.residents[3].occupied=false;
    store.notify();
  });
  await expect(garden.locator('[data-action="install-home-improvement"]')).toBeDisabled();
  await expect(section(page).locator('.home-improvements-note')).toContainText('vacant');
  await expect(section(page).locator('.home-improvements-total')).toHaveText('Care 0 / 20s');
  await expect(garden.locator('.home-forecast-reason')).toContainText('moved away');
});

test('a live update preserves nested disclosures, the chosen option, focus and scroll',async({page})=>{
  await page.goto('/?referenceTown=1');
  await selectFamily(page,4);
  await openSlot(page,'boundary');
  await openSlot(page,'garden');
  const option=slot(page,'garden').locator('[data-home-option="kitchen"]');
  await option.click();
  await option.focus();
  await expect(option).toHaveAttribute('aria-pressed','true');
  await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    store.money=86;
    store.notify();
  });
  await expect(slot(page,'boundary')).toHaveAttribute('open','');
  await expect(slot(page,'garden')).toHaveAttribute('open','');
  await expect(option).toBeFocused();
  await expect(option).toHaveAttribute('aria-pressed','true');
  const preview=slot(page,'garden').locator('.home-improvement-forecast');
  await expect(preview).toContainText('Kitchen Garden');
  await expect(preview).toContainText('House care');
  await page.keyboard.press('Tab');
  await expect(slot(page,'garden').locator('[data-home-option="patio"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(slot(page,'garden').locator('[data-action="install-home-improvement"]')).toBeFocused();
});

test('clicking the visible house roof selects that family, not a competing tile inspector',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/?referenceTown=1');
  const home=await page.evaluate(async()=>{
    const {store}=await import('/src/game/state.ts');
    return store.homeFor(1)!;
  });
  const box=await page.locator('#game-container canvas').boundingBox();
  if(!box)throw Error('Missing game canvas');
  const x=box.x+(BOARD.left+(home.x+.5)*BOARD.tile)/BOARD.width*box.width;
  const y=box.y+(BOARD.top+(home.y+.5)*BOARD.tile-29)/BOARD.height*box.height;
  await page.mouse.click(x,y);
  await expect(page.locator('#household-detail')).toBeVisible();
  await expect(page.locator('#household-detail h3')).toHaveText('The Bells');
  await expect(page.locator('#tile-panel')).toBeHidden();
  await page.mouse.click(x,y);
  await expect(page.locator('#household-detail')).toBeVisible();
  await expect(page.locator('#household-detail h3')).toHaveText('The Bells');
  await expect(page.locator('#household-detail .family-home-improvements')).toBeVisible();
});

for(const viewport of [
  {width:390,height:844},{width:844,height:390},{width:1280,height:720}
]){
  test('home improvements remain usable without horizontal overflow at '+viewport.width+
    '×'+viewport.height,async({page})=>{
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/?referenceTown=1');
    await selectFamily(page,0);
    await openSlot(page,'boundary');
    await slot(page,'boundary').locator('[data-home-option="picket"]').click();
    await expect(slot(page,'boundary').locator('.home-improvement-forecast')).toBeVisible();
    await expect(slot(page,'boundary').locator('[data-action="install-home-improvement"]'))
      .toBeEnabled();
    await slot(page,'boundary').locator('[data-action="install-home-improvement"]').click();
    await expect(slot(page,'boundary').locator('.home-slot-current')).toHaveText('Low Picket Fence');
    const width=await page.evaluate(()=>({
      document:document.documentElement.scrollWidth,viewport:window.innerWidth
    }));
    expect(width.document).toBeLessThanOrEqual(width.viewport+2);
    await expect(page.locator('#shop-section')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
