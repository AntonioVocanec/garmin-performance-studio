import {expect,test} from '@playwright/test';
import {mockDashboardApi} from './fixtures';

for (const [width,kcal,target,remaining,caption] of [
  [390,'558','2062','1.504','kcal do cilja'],
  [836,'2162','2062','100','kcal iznad cilja'],
  [1440,'0','2062','2.062','kcal do cilja'],
  [320,null,null,'—','kcal do cilja'],
] as const) {
  test('daily energy budget at '+width+' px',async({page},info)=>{
    await mockDashboardApi(page);
    await page.setViewportSize({width,height:900});
    let complete=false;
    await page.route('**/api/nutrition/diary?**',route=>{
      const nutrients={kcal,protein:'60',carbs:'72',fiber:'4',fat:'18'};
      return route.fulfill({json:{ok:true,data:{date:new URL(route.request().url()).searchParams.get('date'),
        entries:[],targets:{calories:target,protein:'83',carbs:'330',fat:'60'},nutrients,
        comparableNutrients:{...nutrients,carbs:'70'},complete}}});
    });
    await page.route('**/api/nutrition/diary/days/*',route=>{
      complete=route.request().postDataJSON().complete;
      return route.fulfill({json:{ok:true,data:{}}});
    });
    await page.route('**/api/nutrition/energy?**',route=>route.fulfill({json:{ok:true,data:{
      date:width===320?'1999-01-01':new URL(route.request().url()).searchParams.get('date'),
      status:'available',activeCalories:width===1440?0:701,provisional:true}}}));
    await page.goto('/#nutrition-overview');
    const card=page.getByRole('article',{name:'Energija'});
    await expect(card.locator('.reading strong')).toHaveText(remaining);
    const layout=await card.evaluate(node=>{
      const energy=node.getBoundingClientRect();
      const diary=document.getElementById('nutrition-diary')!.getBoundingClientRect();
      return {verticalGap:diary.top-energy.bottom, horizontalOffset:diary.left-energy.left};
    });
    expect(layout.verticalGap).toBeGreaterThanOrEqual(0);
    expect(Math.abs(layout.horizontalOffset)).toBeLessThan(2);
    await expect(card.locator('.reading small')).toHaveText(caption);
    await expect(card.locator('.side').last().locator('strong')).toHaveText(width===320?'—':width===1440?'0':'701');
    await expect(card.getByText('70 / 330 g')).toBeVisible();
    await expect(card.getByText('4 g',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await card.screenshot({path:info.outputPath('energija.png')});
    if(width===1440)await page.screenshot({path:info.outputPath('moj-dan-desktop.png')});
    const toggle=card.getByRole('switch',{name:'Dnevnik je potpun'});
    await toggle.press('Space');
    await expect(toggle).toBeChecked();
    await card.getByRole('button',{name:'Uredi ciljeve prehrane'}).click();
    await expect(page.locator('.nutrition-profile')).toHaveAttribute('open','');
  });
}
