import {test,expect} from '@playwright/test';
import {mockDashboardApi,dashboardPayload} from './fixtures';

test('health history loads a real selected range and exposes gaps and coverage on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockDashboardApi(page);
 const ranges:string[]=[];
 await page.route('**/api/analytics/health?**',async route=>{
  const q=new URL(route.request().url()).searchParams;const start=q.get('start')!,end=q.get('end')!,metric=q.get('metrics')!;ranges.push(start);
  await route.fulfill({json:{ok:true,start,end,rows:[{date:start,[metric]:50,observations:{}},{date:end,[metric]:null,observations:{}}],coverage:{[metric]:{label:'HRV',unit:'ms',source:'Synthetic Garmin',days:1,expectedDays:365,fetchedDays:365,availableStart:start,availableEnd:start,missingDates:[],stale:false}}}});
 });
 await page.goto('/');await page.getByRole('tab',{name:'Laboratorij',exact:true}).click();
 await page.locator('#lab-recovery-tab-baseline').click();await page.locator('#health-history-panel > summary').click();
 await page.getByLabel('Razdoblje zdravstvene povijesti').selectOption('365');
 await expect(page.locator('#health-history-panel')).toContainText('1/365 dana s mjerenjem');
 await expect.poll(()=>ranges.length).toBeGreaterThan(0);
 await expect(page.locator('#health-history-panel')).toContainText('prazni dani ostaju prazni');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});

test('recovery contributions show independent values and insufficient baseline',async({page})=>{
 await mockDashboardApi(page);await page.route('**/api/dashboard**',async route=>{
  const payload=dashboardPayload(new URL(route.request().url()).searchParams.get('date')!) as unknown as {date:string;normalized:Record<string,unknown>};
  payload.normalized.recoveryContributions={date:payload.date,summary:'1/6 doprinosa ima zapis.',signals:[{key:'hrv',label:'HRV',value:60,unit:'ms',date:payload.date,source:'Synthetic',fetchedAt:null,sampleDays:1,expectedDays:1,baselineDays:6,baseline:null,delta:null,note:'Noćni prosjek.',partial:false}]};
  await route.fulfill({json:payload});
 });await page.goto('/');await page.locator('#recovery-contributions > summary').click();await expect(page.locator('#recovery-contributions')).toContainText('60 ms');await expect(page.locator('#recovery-contributions')).toContainText('6/28 dana');
});

test('nutrition training context explains incomplete days without inventing groups',async({page})=>{
 await mockDashboardApi(page);
 await page.route('**/api/analytics/nutrition-training?**',r=>r.fulfill({json:{ok:true,rows:[{date:'2026-11-01',load:null,kcal:null,carbs:null,complete:false,carbComparison:'unavailable',nextDate:'2026-11-02',nextHrv:null,nextSleep:null,nextRestingHeartRate:null,exclusions:['Dnevnik nije potvrđen kao potpun.']}],groups:[],eligibleDays:0,thresholds:{lowerMax:null,higherAbove:null},sufficient:false,note:'Opisna usporedba; povezanost nije dokaz uzroka.'}}));
 await page.goto('/');await page.getByRole('tab',{name:'Prehrana',exact:true}).click();
 await page.locator('#nutrition-training-context > summary').click();await expect(page.locator('#nutrition-training-context')).toContainText('Dnevnik nije potvrđen kao potpun.');await expect(page.locator('#nutrition-training-context')).toContainText('najmanje 5');
});

test('running comparison selects two runs and preserves unverified route warning',async({page})=>{
 await mockDashboardApi(page);const runs=[{id:'101',date:'2026-11-01',name:'Synthetic loop A',type:'running',distanceMeters:5000,durationSeconds:1800,paceSecondsPerKm:360,avgHeartRate:120,elevationGain:20,trace:[]},{id:'102',date:'2026-11-02',name:'Synthetic loop B',type:'running',distanceMeters:5000,durationSeconds:1700,paceSecondsPerKm:340,avgHeartRate:null,elevationGain:25,trace:[]}];
 await page.route('**/api/analytics/activities?**',r=>r.fulfill({json:{ok:true,items:runs,total:2,suggestions:[]}}));
 await page.route('**/api/analytics/running-comparison',r=>r.fulfill({json:{ok:true,runs,routeStatus:'Ruta nije provjerena',warnings:['Vremenski uvjeti i podloga nisu poznati.']}}));
 await page.goto('/');await page.getByRole('tab',{name:'Trening & Load',exact:true}).click();await page.locator('#performance-trends-disclosure > summary').click();await page.locator('#running-comparison > summary').click();
 await page.locator('#compare-run-101').check();await page.locator('#compare-run-102').check();await page.getByRole('button',{name:'Usporedi trčanja',exact:true}).click();
 await expect(page.locator('#running-comparison')).toContainText('Ruta nije provjerena');await expect(page.locator('#running-comparison')).toContainText('Vremenski uvjeti i podloga nisu poznati.');
});

test('training response keeps same and next day fatigue apart with incomplete RPE',async({page})=>{
 await mockDashboardApi(page);await page.route('**/api/analytics/training-response?**',r=>r.fulfill({json:{ok:true,rows:[{id:'101',date:'2026-11-01',name:'Synthetic run',type:'running',sportGroup:'running',durationSeconds:1800,trainingLoad:30,rpe:null,nextDate:'2026-11-02',sameDayFatigue:{fatigue:2},nextDayFatigue:{fatigue:7},activitiesOnDay:2,dayCoverage:true}],groups:[{sport:'running',label:'Trčanje',activities:1,rated:0,medianRpe:null}],sports:{running:'Trčanje'},rated:0,total:1,note:'Umor je dnevni zapis.'}}));
 await page.goto('/');await page.getByRole('tab',{name:'Trening & Load',exact:true}).click();await page.locator('#weekly-plan-disclosure > summary').click();await page.locator('#training-response > summary').click();
 await expect(page.locator('#training-response')).toContainText('0/1 aktivnosti');await expect(page.locator('#training-response')).toContainText('2 aktivnosti tog dana');await expect(page.locator('#training-response')).toContainText('7 / 10');await expect(page.locator('#training-response')).toContainText('Dopuni RPE');
});

test('analytics HTTP contracts reject oversized ranges and duplicate IDs without external calls',async({request})=>{
 const range='start=2000-01-01&end=2000-01-01';
 expect((await request.get(`/api/analytics/health?${range}`)).status()).toBe(200);
 expect((await request.get(`/api/analytics/health?${range}&metrics=unknown`)).status()).toBe(422);
 expect((await request.post('/api/analytics/health/fetch',{data:{start:'2000-01-01',end:'2000-01-15',metrics:['hrv']}})).status()).toBe(422);
 expect((await request.post('/api/analytics/running-comparison',{data:{activityIds:['1','1']}})).status()).toBe(422);
 expect((await request.get(`/api/analytics/nutrition-training?${range}`)).status()).toBe(200);
 expect((await request.get(`/api/analytics/training-response?${range}`)).status()).toBe(200);
});

test('late health history responses cannot overwrite a newer range',async({page})=>{
 await mockDashboardApi(page);await page.route('**/api/analytics/health?**',async route=>{
  const q=new URL(route.request().url()).searchParams,start=q.get('start')!,end=q.get('end')!,metric=q.get('metrics')!;
  const count=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
  await new Promise(resolve=>setTimeout(resolve,count===365?20:250));
  await route.fulfill({json:{ok:true,start,end,rows:[{date:start,[metric]:60,observations:{}}],coverage:{[metric]:{label:'HRV',unit:'ms',source:'Synthetic',days:1,expectedDays:count,fetchedDays:count,missingDates:[],availableStart:start,availableEnd:start,stale:false}}}}).catch(()=>{});
 });
 await page.goto('/');await page.getByRole('tab',{name:'Laboratorij',exact:true}).click();await page.locator('#lab-recovery-tab-baseline').click();await page.locator('#health-history-panel > summary').click();
 await page.getByLabel('Razdoblje zdravstvene povijesti').selectOption('90');await page.getByLabel('Razdoblje zdravstvene povijesti').selectOption('365');
 await expect(page.locator('#health-history-panel')).toContainText('1/365 dana s mjerenjem');await page.waitForTimeout(350);await expect(page.locator('#health-history-panel')).toContainText('1/365 dana s mjerenjem');
});
