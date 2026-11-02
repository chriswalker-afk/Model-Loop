import {test,expect} from '@playwright/test';

// Temporary visual QA companion: the final PR does not need this logging.
test('visual QA compact screenshot',async({page})=>{
  await page.setViewportSize({width:1266,height:548});
  await page.goto('/');
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await page.waitForTimeout(500);
  const screenshot=await page.screenshot({type:'png',animations:'disabled'});
  console.log('VISUAL_QA_BEGIN'+screenshot.toString('base64')+'VISUAL_QA_END');
});
