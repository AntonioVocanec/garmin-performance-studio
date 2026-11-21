import { expect, test } from '@playwright/test';
import { mockDashboardApi, openNutritionSection } from './fixtures';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const width of [390, 1440]) {
  test('nutrition redesign reference workflow at ' + width + ' px', async ({ page, request }, info) => {
    const foodName = 'Testna zob ' + width;
    const recipeName = 'Testni doručak ' + width;
    const post = async (path: string, data: object) => {
      const res = await request.post('/api/nutrition/' + path, { data, headers: { 'Idempotency-Key': crypto.randomUUID() } });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).data;
    };
    const food = await post('foods', { name: foodName, source: 'Izmišljena deklaracija', nutrients: { kcal: '400' } });
    await post('recipes', { name: recipeName, portions: '5', minutes: 10,
      ingredients: [{ foodId: food.id, quantity: '300' }], steps: ['Pomiješaj.'] });
    const inventory = async () => (await (await request.get('/api/nutrition/inventory')).json()).data as
      { id: string; name: string; quantity: string; unit: string }[];

    await page.setViewportSize({ width, height: 844 });
    await mockDashboardApi(page);
    await page.route('**/api/nutrition/energy?**', route => route.fulfill({json:{ok:true,data:{
      date:new URL(route.request().url()).searchParams.get('date'), status:'unavailable',totalCalories:null
    }}}));
    await page.goto('/#nutrition-inventory');
    const nutrition = page.locator('.nutrition');
    await page.getByRole('button', { name: 'Zaprimi namirnicu' }).click();
    const receipt = page.getByRole('dialog', { name: 'Prijem namirnica' });
    await receipt.getByRole('combobox', { name: 'Namirnica', exact: true }).selectOption(food.id);
    await receipt.getByLabel('Količina za prijem · g').fill('500');
    const today = await receipt.getByLabel('Datum stvarnog primitka').inputValue();
    await receipt.getByLabel('Rok', { exact: true }).fill(today);
    await receipt.screenshot({ path: info.outputPath('01-prijem.png') });
    await receipt.getByRole('button', { name: 'Potvrdi prijem' }).click();
    await expect(nutrition.getByRole('status')).toBeVisible();
    const raw = (await inventory()).find(lot => lot.name === foodName);
    expect(raw).toMatchObject({ quantity: '500', unit: 'g' });

    await openNutritionSection(page, 'recipes');
    const card = nutrition.locator('article').filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) });
    await card.getByRole('link', {name:'Pripremi', exact:true}).click();
    const prep = nutrition.locator('article').filter({ has: page.getByRole('heading', { name: 'Priprema unaprijed' }) });
    await expect(prep.getByRole('combobox', { name: 'Recept', exact: true }).locator('option:checked')).toHaveText(recipeName);
    await expect(prep.getByLabel('Porcije', { exact: true })).toHaveValue('5');
    await prep.getByLabel('Rok gotovog jela').fill('2099-12-01');
    await prep.getByRole('button', { name: 'Provjeri pripremu' }).click();
    const commit = prep.getByRole('button', { name: 'Potvrdi kuhanje i potrošnju sastojaka' });
    await expect(commit).toBeEnabled();
    await expect(prep).toContainText('Potrebno 300 g · raspoloživo 500 g');
    expect((await inventory()).find(lot => lot.id === raw!.id)?.quantity).toBe('500');
    await prep.screenshot({ path: info.outputPath('02-pregled-kuhanja.png') });
    await commit.click();
    await expect(nutrition.getByRole('status')).toContainText('Kuhanje je potvrđeno');
    const portions = (await inventory()).find(lot => lot.name === recipeName);
    expect(portions?.quantity).toBe('5');
    expect((await inventory()).find(lot => lot.id === raw!.id)?.quantity).toBe('200');

    await nutrition.getByRole('link', { name: 'Otvori gotove porcije' }).click();
    await expect(page).toHaveURL(/#nutrition-portions$/);
    await nutrition.locator('article').filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) })
      .getByRole('link', { name: 'Zabilježi konzumaciju' }).click();
    const log = page.getByRole('dialog', { name: 'Dodaj obrok' });
    await log.getByRole('combobox', { name: 'Obrok', exact: true }).selectOption('breakfast');
    await log.screenshot({ path: info.outputPath('03-dnevnik.png') });
    await log.getByRole('button', { name: 'Potvrdi unos' }).click();
    await expect(nutrition.getByRole('status')).toContainText('Obrok je zabilježen');
    const lots = await inventory();
    expect(lots.find(lot => lot.id === portions!.id)?.quantity).toBe('4');
    expect(lots.find(lot => lot.id === raw!.id)?.quantity).toBe('200');
    const day = await page.locator('#date').inputValue();
    const diary = (await (await request.get('/api/nutrition/diary?date=' + day)).json()).data;
    expect(diary.entries.filter((entry: {name:string}) => entry.name === recipeName)).toHaveLength(1);
    await expect(nutrition.getByRole('heading', { name: 'Upozorenja zaliha' })).toHaveCount(0);
    await expect(nutrition.getByRole('heading', { name: 'Meal Prep i plan' })).toHaveCount(0);
    await openNutritionSection(page, 'inventory');
    const alerts = nutrition.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Upozorenja zaliha' }) });
    await expect(alerts.getByText(foodName, { exact: true })).toBeVisible();
    await expect(alerts).toContainText('Rok ' + today);
    await page.locator('#date').fill('2020-01-01');
    await page.locator('#date').dispatchEvent('change');
    await expect(nutrition).toHaveAttribute('aria-busy', 'false');
    await expect(alerts.getByText(foodName, { exact: true })).toBeVisible();
  });
}


test('nutrition navigation keeps legacy deep links and restores the correct group', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**', route => route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'), status:'unavailable',totalCalories:null
  }}}));
  const navigation = page.locator('.quick-nav');
  const toolbar = page.locator('.nutrition-toolbar h2');
  const expected = [
    ['overview','Moj dan','Moj dan'],
    ['diary','Moj dan','Moj dan'],
    ['trends','Moj dan','Trendovi prehrane'],
    ['planner','Planer','Tjedni planer'],
    ['recipes','Kuhinja','Recepti'],
    ['prep','Kuhinja','Meal Prep'],
    ['portions','Kuhinja','Gotove porcije'],
    ['ai-recipes','Kuhinja','AI recepti'],
    ['inventory','Zalihe','Zalihe'],
    ['catalog','Zalihe','Katalog namirnica'],
    ['inventory-history','Zalihe','Povijest inventara'],
    ['shopping','Zalihe','Kupovina'],
  ];
  for (const [section, group, title] of expected) {
    await page.goto('/#nutrition-' + section);
    await expect(toolbar).toHaveText(title);
    if(section==='diary'||section==='overview'){
      await expect(page.getByRole('heading',{name:'Dnevnik prehrane'})).toBeVisible();
      const dayNav=page.getByRole('navigation',{name:'Odjeljci · Moj dan'});
      await expect(dayNav.getByRole('link')).toHaveText(['Moj dan','Trendovi']);
      await expect(dayNav.getByRole('link',{name:'Moj dan',exact:true})).toHaveAttribute('aria-current','page');
    }
    await expect(navigation.getByRole('link')).toHaveText(['Moj dan','Planer','Kuhinja','Zalihe']);
    await expect(navigation.getByRole('link', { name: group })).toHaveAttribute('aria-current','location');
  }

  await page.goto('/#nutrition-diary');
  await page.locator('.nutrition-subnav').getByRole('link',{name:'Trendovi',exact:true}).click();
  await expect(toolbar).toHaveText('Trendovi prehrane');
  await page.goBack();
  await expect(page).toHaveURL(/#nutrition-diary$/);
  await expect(toolbar).toHaveText('Moj dan');
  await expect(page.locator('#nutrition-diary')).toBeInViewport();
  await page.goto('/#nutrition-shopping');
  await page.reload();
  await expect(toolbar).toHaveText('Kupovina');
  await expect(page.getByRole('link', { name: 'Kupovina', exact: true })).toHaveAttribute('aria-current','page');
  const kitchen = navigation.getByRole('link', { name:'Kuhinja' });
  await kitchen.focus();
  await page.keyboard.press('Enter');
  await expect(toolbar).toHaveText('Recepti');
  await page.getByRole('link', { name:'Priprema', exact:true }).click();
  await expect(toolbar).toHaveText('Meal Prep');
  await page.goBack();
  await expect(toolbar).toHaveText('Recepti');
  await page.goBack();
  await expect(toolbar).toHaveText('Kupovina');
  await page.goForward();
  await expect(toolbar).toHaveText('Recepti');
  await expect(kitchen).toHaveAttribute('aria-current','location');
  await page.getByRole('tab', { name:'Prehrana' }).click();
  await expect(toolbar).toHaveText('Moj dan');
  await expect(navigation.getByRole('link', { name:'Moj dan' })).toHaveAttribute('aria-current','location');
  expect(await navigation.locator('.quick-nav-links').evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
});


for (const width of [320, 390, 1440]) {
  test('Moj dan opens meal entry without scrolling at ' + width + ' px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await mockDashboardApi(page);
    await page.route('**/api/nutrition/diary?**', route => route.fulfill({json:{ok:true,data:{
      date:new URL(route.request().url()).searchParams.get('date'),complete:false,targets:{},entries:[],
      nutrients:{kcal:null,protein:null,carbs:null,fat:null,fiber:null}
    }}}));
    await page.route('**/api/nutrition/dashboard?**', route => route.fulfill({ json: { ok: true, data: {
      diary: { date: new URL(route.request().url()).searchParams.get('date') },
      meals: [], portions: [], alerts: [], lowStock: [],
    } } }));
    await page.route('**/api/nutrition/energy?**', route => route.fulfill({json:{ok:true,data:{
      date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null
    }}}));
    await page.goto('/#view-nutrition');
    const trigger = page.getByRole('button',{name:'Evidentiraj obrok'});
    await expect(trigger).toBeEnabled();
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#nutrition-energy-chart')).toHaveCount(0);
    const diary=page.locator('#nutrition-diary');
    const mealGroups=diary.locator('.nutrition-meal');
    const meals=[['Doručak','breakfast'],['Ručak','lunch'],['Međuobrok','snack'],['Večera','dinner']];
    await expect(mealGroups.getByRole('heading')).toHaveText(meals.map(([label])=>label));
    await expect(diary.getByText('Nema unosa',{exact:true})).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Upozorenja zaliha' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Meal Prep i plan' })).toHaveCount(0);
    if(width>320)await page.screenshot({path:info.outputPath('moj-dan.png')});
    await trigger.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Dodaj obrok'});
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(await page.locator('#date').inputValue());
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    for(const [label,value] of meals){
      const add=diary.getByRole('button',{name:'Dodaj unos · '+label,exact:true});
      await add.press('Enter');
      await expect(dialog.getByRole('combobox',{name:'Obrok',exact:true})).toHaveValue(value);
      await dialog.getByRole('button',{name:'Odustani',exact:true}).click();
      await expect(add).toBeFocused();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}


test('shopping keeps its explicit range and rejects a shortage that changed before save', async ({page,request}) => {
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**', route=>route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null
  }}}));
  const post=async(path:string,data:object)=>{
    const response=await request.post('/api/nutrition/'+path,{data,headers:{'Idempotency-Key':crypto.randomUUID()}});
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
  };
  const name='Namirnica za manjak '+crypto.randomUUID();
  const food=await post('foods',{name,source:'Testna deklaracija'});
  const recipe=await post('recipes',{name,portions:1,minutes:1,ingredients:[{foodId:food.id,quantity:100}],steps:['Pomiješaj.']});
  const start='2020-02-10';
  const end='2020-02-11';
  await post('plan/entries',{date:start,meal:'lunch',recipeVersionId:recipe.versionId,portions:1});
  await page.goto('/#nutrition-shopping');
  const from=page.getByLabel('Početak razdoblja',{exact:true}),to=page.getByLabel('Kraj razdoblja',{exact:true});
  await from.fill(start);
  await to.fill(end);
  const calculate=page.getByRole('button',{name:'Izračunaj manjkove'});
  const save=page.getByRole('button',{name:'Spremi novu listu'});
  await calculate.click();
  await expect(page.locator('.nutrition')).toContainText(name+': nedostaje 100 g');
  await post('inventory/receipts',{foodId:food.id,location:'pantry',quantity:50,receivedOn:start});
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Manjkovi su se promijenili');
  await expect(save).toHaveCount(0);
  const before=(await (await request.get('/api/nutrition/shopping/lists')).json()).data;
  expect(before.some((list:{items:{food_id:string}[]})=>list.items.some(item=>item.food_id===food.id))).toBeFalsy();

  await calculate.click();
  await expect(page.locator('.nutrition')).toContainText(name+': nedostaje 50 g');
  await to.fill('2020-02-12');
  await expect(save).toHaveCount(0);
  await calculate.click();
  await save.click();
  const item=page.locator('.nutrition summary').filter({hasText:name});
  await expect(item).toContainText('50 g');
  await item.click();
  await page.getByRole('checkbox',{name:/Kupljeno/}).check();
  await page.getByRole('button',{name:'Spremi stavku'}).click();
  await expect(item).toContainText('kupljeno');
  const stock=async()=> (await (await request.get('/api/nutrition/inventory')).json()).data
    .filter((lot:{food_id:string})=>lot.food_id===food.id);
  expect(await stock()).toMatchObject([{quantity:'50'}]);

  const receiving=item.locator('..').locator(':scope > details');
  await receiving.locator(':scope > summary').click();
  await receiving.getByLabel('Stvarno primljena količina · g').fill('75');
  await receiving.getByLabel('Datum stvarnog primitka',{exact:true}).fill(start);
  await receiving.getByRole('button',{name:'Potvrdi prijem u inventar'}).click();
  await expect(item).toContainText('zaprimljeno');
  const final=await stock();
  expect(final).toHaveLength(2);
  expect(final).toEqual(expect.arrayContaining([expect.objectContaining({quantity:'75',receivedOn:start})]));
});


test('planner selects a day, edits and copies a plan, and prefills a separate diary entry', async ({page,request}, info)=>{
  const send=async(path:string,data:object,method='POST')=>{
    const response=await request.fetch('/api/nutrition/'+path,{method,data,headers:{'Idempotency-Key':crypto.randomUUID()}});
    expect(response.ok(),await response.text()).toBeTruthy();
    return (await response.json()).data;
  };
  const name='Testni plan '+crypto.randomUUID().slice(0,8);
  const food=await send('foods',{name:'Namirnica za '+name,source:'Izmišljena deklaracija',nutrients:{kcal:200}});
  const recipeData={name,portions:2,minutes:12,ingredients:[{foodId:food.id,quantity:100}],steps:['Pomiješaj.']};
  const recipe=await send('recipes',recipeData);
  const monday='2017-05-08',tuesday='2017-05-09',wednesday='2017-05-10';
  await send('plan/entries',{date:tuesday,meal:'dinner',recipeVersionId:recipe.versionId,portions:'1.5'});
  await send('recipes/'+recipe.id,{...recipeData,ingredients:[{foodId:food.id,quantity:200}]},'PATCH');
  const diary=async(day:string)=>(await (await request.get('/api/nutrition/diary?date='+day)).json()).data;
  await page.setViewportSize({width:390,height:844});
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**',route=>route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null
  }}}));
  await page.goto('/#nutrition-planner');
  await page.locator('#date').fill(monday);
  const picker=page.getByRole('group',{name:'Odaberi dan u tjednu'});
  await expect(picker.getByRole('button')).toHaveCount(7);
  await expect(page.locator('.nutrition-plan-day:visible')).toHaveCount(1);
  await picker.getByRole('button',{name:/uto/}).click();
  await expect(page.locator('#date')).toHaveValue(tuesday);
  await expect(picker.getByRole('button',{name:/uto/})).toHaveAttribute('aria-pressed','true');
  const selected=page.locator('.nutrition-plan-day:visible');
  const row=selected.locator('.nutrition-plan-item').filter({hasText:name});
  await expect(row).toBeVisible();
  const dimensions=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
  expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1]+1);
  await selected.screenshot({path:info.outputPath('planer-390.png')});
  await row.getByRole('button',{name:'Uredi / premjesti'}).click();
  const form=page.locator('#nutrition-plan-form');
  await expect(form.getByLabel('Recept')).toHaveValue(recipe.versionId);
  await form.getByLabel('Porcije').fill('2');
  await form.getByRole('button',{name:'Spremi izmjenu plana'}).click();
  await expect(row).toContainText('2 porcija');
  await row.getByRole('button',{name:'Kopiraj na sljedeći dan'}).click();
  await expect(form.getByLabel('Datum')).toHaveValue(wednesday);
  await form.getByRole('button',{name:'Dodaj u plan'}).click();
  await expect(form).toBeHidden();
  await row.getByLabel('Status plana').selectOption('consumed');
  await expect(page.locator('.nutrition [role=status]')).toContainText('Oznaka obroka u planu');
  expect((await diary(tuesday)).entries).toEqual([]);
  expect((await diary(wednesday)).entries).toEqual([]);

  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('.nutrition-plan-day:visible')).toHaveCount(7);
  const copy=page.locator('.nutrition-plan-day[data-date="'+wednesday+'"] .nutrition-plan-item').filter({hasText:name});
  await expect(copy).toContainText('2 porcija');
  await page.locator('.nutrition-week').screenshot({path:info.outputPath('planer-1440.png')});
  await copy.getByRole('link',{name:'Evidentiraj obrok'}).click();
  const dialog=page.getByRole('dialog',{name:'Dodaj obrok'});
  await expect(dialog).toContainText(wednesday);
  await expect(dialog.getByLabel('Odaberi')).toHaveValue(recipe.versionId);
  await expect(dialog.getByRole('combobox',{name:'Obrok',exact:true})).toHaveValue('dinner');
  await expect(dialog.getByLabel(/Količina/)).toHaveValue('2');
  await dialog.getByRole('button',{name:'Odustani'}).click();
  expect((await diary(wednesday)).entries).toEqual([]);
  await openNutritionSection(page,'planner');
  await copy.getByRole('link',{name:'Evidentiraj obrok'}).click();
  await dialog.getByRole('button',{name:'Potvrdi unos'}).click();
  await expect(dialog).toBeHidden();
  expect((await diary(wednesday)).entries).toEqual([expect.objectContaining({name,nutrients:expect.objectContaining({kcal:'200'})})]);
  expect((await diary(tuesday)).entries).toEqual([]);
  await openNutritionSection(page,'planner');
  await page.getByRole('link',{name:'Izradi popis za kupovinu'}).click();
  await expect(page).toHaveURL(/#nutrition-shopping$/);
  await expect(page.getByRole('heading',{name:'Manjkovi za odabrano razdoblje'})).toBeFocused();
  await expect(page.locator('.nutrition').getByLabel('Početak razdoblja',{exact:true})).toHaveValue(monday);
  await expect(page.locator('.nutrition').getByLabel('Kraj razdoblja',{exact:true})).toHaveValue('2017-05-14');
});

test('scheduled preparation keeps its recipe version and only cooking changes stock', async ({page,request})=>{
  const send=async(path:string,data:object,method='POST')=>{
    const response=await request.fetch('/api/nutrition/'+path,{method,data,headers:{'Idempotency-Key':crypto.randomUUID()}});
    expect(response.ok(),await response.text()).toBeTruthy();
    return (await response.json()).data;
  };
  const name='Priprema '+crypto.randomUUID().slice(0,8);
  const food=await send('foods',{name:name+' · sastojak',source:'Izmišljena deklaracija',nutrients:{kcal:180}});
  await send('inventory/receipts',{foodId:food.id,quantity:200,location:'pantry'});
  const recipeData={name,portions:2,minutes:10,ingredients:[{foodId:food.id,quantity:100},
    {foodId:food.id,quantity:10,optional:true}],steps:['Pomiješaj.']};
  const recipe=await send('recipes',recipeData);
  const relevantStock=async()=>{
    const items=(await (await request.get('/api/nutrition/inventory')).json()).data;
    return items.filter((item:{name:string})=>item.name.startsWith(name));
  };
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**',route=>route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null
  }}}));
  await page.goto('/#nutrition-prep');
  await page.getByLabel('Recept za zakazivanje').selectOption(recipe.versionId);
  await page.getByLabel('Porcije za zakazivanje').fill('3');
  await page.getByRole('button',{name:'Zakaži pripremu'}).click();
  const scheduled=page.locator('.nutrition-row').filter({hasText:name});
  await expect(scheduled).toContainText('3 porcija');
  expect(await relevantStock()).toEqual([expect.objectContaining({quantity:'200'})]);
  await send('recipes/'+recipe.id,{...recipeData,ingredients:[{foodId:food.id,quantity:300}]},'PATCH');
  await page.getByRole('button',{name:'Osvježi prehranu'}).click();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy','false');
  await scheduled.getByRole('button',{name:'Odaberi za kuhanje'}).click();
  await expect(page.getByRole('combobox',{name:'Recept',exact:true})).toHaveValue(recipe.versionId);
  await expect(page.getByLabel('Porcije',{exact:true})).toHaveValue('3');
  await page.getByRole('checkbox',{name:/Uključi opcionalni sastojak/}).check();
  await page.getByLabel('Rok gotovog jela').fill('2099-12-01');
  await page.getByRole('button',{name:'Provjeri pripremu'}).click();
  await expect(page.getByText('Potrebno 165 g · raspoloživo 200 g')).toBeVisible();
  expect(await relevantStock()).toEqual([expect.objectContaining({quantity:'200'})]);
  await page.getByRole('button',{name:'Potvrdi kuhanje i potrošnju sastojaka'}).click();
  await expect(scheduled).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Otvori gotove porcije'})).toBeVisible();
  expect(await relevantStock()).toEqual(expect.arrayContaining([
    expect.objectContaining({name,quantity:'3'}),
    expect.objectContaining({name:name+' · sastojak',quantity:'35'}),
  ]));
});


test('meal dialog validates each source in Croatian and preserves successful logging', async ({ page, request }, info) => {
  const token = crypto.randomUUID().slice(0,8);
  const post = async (path: string, data: object) => {
    const response = await request.post('/api/nutrition/' + path, {data,headers:{'Idempotency-Key':crypto.randomUUID()}});
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).data;
  };
  const food = await post('foods',{name:'Testna namirnica '+token,source:'Izmišljena deklaracija',nutrients:{kcal:'400'}});
  const recipe = await post('recipes',{name:'Testni recept '+token,portions:'2',minutes:10,
    ingredients:[{foodId:food.id,quantity:'100'}],steps:['Pripremi probnu namirnicu.']});
  await post('inventory/receipts',{foodId:food.id,quantity:'200',location:'pantry',expiresOn:'2099-12-01'});

  const browserErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/nutrition/') && response.status() >= 400) apiErrors.push(path + ' ' + response.status());
  });
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**', route => route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null,
  }}}));
  await page.goto('/#nutrition-prep');
  await page.getByRole('combobox',{name:'Recept',exact:true}).selectOption(recipe.versionId);
  await page.getByLabel('Porcije',{exact:true}).fill('2');
  await page.getByLabel('Rok gotovog jela',{exact:true}).fill('2099-11-16');
  await page.getByRole('button',{name:'Provjeri pripremu',exact:true}).click();
  await page.getByRole('button',{name:'Potvrdi kuhanje i potrošnju sastojaka',exact:true}).click();
  await expect(page.locator('.nutrition').getByRole('status')).toContainText('Kuhanje je potvrđeno');
  const lots = (await (await request.get('/api/nutrition/inventory')).json()).data;
  const portion = lots.find((lot: {name:string}) => lot.name === recipe.name);
  expect(portion?.id).toBeTruthy();

  const sent: unknown[] = [];
  page.on('request', req => {
    if (req.method()==='POST' && new URL(req.url()).pathname==='/api/nutrition/diary/entries') sent.push(req.postDataJSON());
  });
  await openNutritionSection(page,'overview');
  const trigger = page.getByRole('button',{name:'Evidentiraj obrok'});
  const dialog = page.getByRole('dialog',{name:'Dodaj obrok'});
  const kind = dialog.getByRole('combobox',{name:'Vrsta'});
  const source = dialog.getByRole('combobox',{name:'Odaberi',exact:true});
  const submit = dialog.getByRole('button',{name:'Potvrdi unos'});
  const error = dialog.locator('#meal-source-error');
  const date = await page.locator('#date').inputValue();
  const diaryCount = async () => (await (await request.get('/api/nutrition/diary?date='+date)).json()).data.entries.length;
  const initial = await diaryCount();
  const cases = [
    ['food', food.id, 'Odaberi namirnicu.'],
    ['recipe', recipe.versionId, 'Odaberi recept.'],
    ['portion', portion.id, 'Odaberi gotovu porciju.'],
  ];
  const locale = test.info().project.use.locale ?? 'en-US';
  await expect.poll(() => page.evaluate(() => navigator.language)).toBe(locale);
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await trigger.click();
    await expect(dialog).toBeVisible();
    await submit.press('Enter');
    await expect(source).toBeFocused();
    await expect(source).toHaveAccessibleDescription('Odaberi namirnicu.');
    await expect(error).toBeVisible();
    await expect(source).toHaveAttribute('aria-invalid','true');
    expect(await dialog.evaluate(d => d.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
    if (width===390) {
      await dialog.getByLabel(/Količina ·/).clear();
      await submit.press('Enter');
      await expect(source).toBeFocused();
      await dialog.screenshot({path:info.outputPath('qa-001-validacija.png')});
    }
    await dialog.getByRole('button',{name:'Odustani'}).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  expect(sent).toHaveLength(0);
  expect(await diaryCount()).toBe(initial);
  for (const [index,[type,id,message]] of cases.entries()) {
    await trigger.click();
    await expect(error).toBeHidden();
    await kind.selectOption(type);
    await submit.press('Enter');
    await expect(source).toBeFocused();
    await expect(source).toHaveAccessibleDescription(message);
    expect(sent).toHaveLength(index);
    await source.selectOption(id);
    await expect(error).toBeHidden();
    const amount=dialog.getByLabel(/Količina ·/);
    await amount.clear();
    await submit.click();
    await expect(amount).toBeFocused();
    expect(sent).toHaveLength(index);
    await amount.fill('1');
    await submit.click();
    await expect(dialog).toBeHidden();
    expect(sent).toHaveLength(index+1);
    expect(await diaryCount()).toBe(initial+index+1);
  }
  expect(browserErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});


test('adding from Međuobrok stores a snack and updates only its diary section', async ({page,request}) => {
  const create=await request.post('/api/nutrition/foods',{
    data:{name:'Probni međuobrok '+crypto.randomUUID(),source:'Izmišljena deklaracija',nutrients:{kcal:'100'}},
    headers:{'Idempotency-Key':crypto.randomUUID()},
  });
  expect(create.ok()).toBeTruthy();
  const food=(await create.json()).data;
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**',route=>route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null,
  }}}));
  await page.goto('/#nutrition-overview');
  const diary=page.locator('#nutrition-diary');
  const snack=diary.getByRole('region',{name:'Međuobrok',exact:true});
  const add=snack.getByRole('button',{name:'Dodaj unos · Međuobrok'});
  await add.click();
  const dialog=page.getByRole('dialog',{name:'Dodaj obrok'});
  await expect(dialog.getByRole('combobox',{name:'Obrok',exact:true})).toHaveValue('snack');
  const submit=dialog.getByRole('button',{name:'Potvrdi unos'});
  await submit.click();
  await expect(dialog.getByRole('combobox',{name:'Odaberi',exact:true})).toHaveAccessibleDescription('Odaberi namirnicu.');
  await dialog.getByRole('combobox',{name:'Odaberi',exact:true}).selectOption(food.id);
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(snack).toContainText(food.name);
  for(const meal of ['Doručak','Ručak','Večera']){
    await expect(diary.getByRole('region',{name:meal,exact:true})).not.toContainText(food.name);
  }
  const date=await page.locator('#date').inputValue();
  const response=await request.get('/api/nutrition/diary?date='+date);
  const entries=(await response.json()).data.entries;
  expect(entries.filter((entry:{name:string})=>entry.name===food.name)).toEqual([expect.objectContaining({meal:'snack'})]);
});
