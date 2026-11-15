import {expect, test, type Page} from '@playwright/test';
import {mockDashboardApi} from './fixtures';

test.use({serviceWorkers:'block'});

async function openEditor(page:Page) {
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy?**', route=>route.fulfill({json:{ok:true,data:{
    date:new URL(route.request().url()).searchParams.get('date'),status:'unavailable',totalCalories:null
  }}}));
  await page.goto('/#nutrition-inventory');
  const editor=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Nova namirnica$/})});
  await editor.locator(':scope > summary').click();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy','false');
  return editor;
}

function fixture() {
  const sourceId=String(Math.floor(100000000+Math.random()*800000000));
  const nutrients={kcal:'300',protein:'12',carbs:'60',fat:'0',fiber:null};
  const hit={sourceId,name:'Synthetic rolled oats',dataType:'Branded',brand:'Test'};
  const draft={sourceId,source:'USDA FoodData Central · /100 g',nutrients,micronutrients:{},
    nutritionData:{usda:{description:hit.name,dataType:hit.dataType,nutrients,carbDefinition:'unknown',energyMethod:'usda_1008'},
      carbDefinition:'unknown',energyMethod:'usda_1008',originalValues:[{nutrientId:'1008',unit:'kcal',value:'300'}]}};
  return {hit,draft};
}

for (const width of [1280,390]) {
  test('USDA reviewed create, corrections and duplicate choice at '+width, async({page,request})=>{
    await page.setViewportSize({width,height:844});
    const editor=await openEditor(page);
    const {hit,draft}=fixture();
    const name='Zobene pahuljice '+hit.sourceId;
    const search=editor.getByRole('button',{name:'Pretraži USDA',exact:true});
    const kcal=editor.getByLabel('Energija · kcal na 100 g');
    const foods=async()=> (await (await request.get('/api/nutrition/foods')).json()).data.filter((food:{sourceId:string})=>food.sourceId===hit.sourceId);
    await page.route('**/api/nutrition/food-search?**',r=>r.fulfill({json:{ok:true,data:[hit]}}));
    await page.route('**/api/nutrition/food-imports/*/preview',r=>r.fulfill({json:{ok:true,data:draft}}));
    await editor.getByLabel('Naziv',{exact:true}).fill(name);
    await expect(editor.getByLabel('Upit za USDA')).toHaveValue(name);
    await kcal.fill('420');
    await editor.getByLabel('Upit za USDA').fill('rolled oats');
    await search.press('Enter');
    await editor.getByRole('button',{name:'Pregledaj '+hit.name}).press('Enter');
    await expect(editor).toContainText('420 → 300');
    await expect(kcal).toHaveValue('420');
    await editor.getByRole('button',{name:'Primijeni u obrazac'}).press('Enter');
    await expect(kcal).toHaveValue('300');
    await expect(editor.getByLabel('Vlakna · g na 100 g')).toHaveValue('');
    await expect(editor.getByLabel('Masti · g na 100 g')).toHaveValue('0');
    await expect(editor.getByLabel('Sastav i alergeni provjereni na izvoru')).not.toBeChecked();
    expect(await foods()).toHaveLength(0);
    await kcal.fill('333');
    await editor.getByRole('combobox',{name:'Stanje',exact:true}).selectOption('dry');
    await editor.getByRole('button',{name:'Spremi',exact:true}).click();
    await expect.poll(async()=>(await foods()).length).toBe(1);
    const [saved]=await foods();
    expect(saved).toMatchObject({name,state:'dry',sourceId:hit.sourceId,nutrients:{kcal:'333',fiber:null,fat:'0'},
      nutritionData:{energyMethod:'unknown',usda:{description:hit.name,nutrients:{kcal:'300'}}}});
    await editor.getByLabel('Naziv',{exact:true}).fill(name);
    await search.click();
    await editor.getByRole('button',{name:'Pregledaj '+hit.name}).click();
    await editor.getByRole('button',{name:'Primijeni u obrazac'}).click();
    await expect(editor.getByRole('button',{name:'Spremi',exact:true})).toBeDisabled();
    await editor.getByLabel('Želim spremiti zasebnu namirnicu').check();
    await expect(editor.getByRole('button',{name:'Spremi',exact:true})).toBeEnabled();
    await editor.getByRole('button',{name:/Odaberi postojeći zapis/}).click();
    await expect(page.getByRole('button',{name:'Spremi novu verziju'})).toBeVisible();
    expect(await foods()).toHaveLength(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('USDA short, empty and unavailable search preserve manual entry', async({page})=>{
  const editor=await openEditor(page);
  let attempts=0;
  await page.route('**/api/nutrition/food-search?**',r=>{
    attempts++;
    return attempts===1 ? r.fulfill({json:{ok:true,data:[]}}) : r.fulfill({status:503,json:{ok:false,error:'USDA nije konfiguriran.'}});
  });
  const search=editor.getByRole('button',{name:'Pretraži USDA',exact:true});
  await search.click();
  await expect(editor).toContainText('od 2 do 100 znakova');
  expect(attempts).toBe(0);
  await editor.getByLabel('Naziv',{exact:true}).fill('Ručni test');
  await search.click();
  await expect(editor).toContainText('rolled oats');
  await search.click();
  await expect(editor).toContainText('USDA nije konfiguriran.');
  await editor.getByLabel('Izvor podataka').fill('Testna deklaracija');
  await editor.getByRole('button',{name:'Spremi',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Namirnica je spremljena u katalog.'})).toBeVisible();
});

test('USDA delayed detail is discarded after form closes',async({page})=>{
  const editor=await openEditor(page);
  const {hit,draft}=fixture();
  await page.route('**/api/nutrition/food-search?**',r=>r.fulfill({json:{ok:true,data:[hit]}}));
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/nutrition/food-imports/*/preview',async r=>{await gate;await r.fulfill({json:{ok:true,data:draft}})});
  await editor.getByLabel('Naziv',{exact:true}).fill('Zob');
  await editor.getByRole('button',{name:'Pretraži USDA',exact:true}).click();
  const sent=page.waitForRequest('**/api/nutrition/food-imports/*/preview');
  await editor.getByRole('button',{name:'Pregledaj '+hit.name}).click();
  await sent;
  await editor.locator(':scope > summary').click();
  await editor.locator(':scope > summary').click();
  release();
  await expect(editor.getByRole('button',{name:'Primijeni u obrazac'})).toHaveCount(0);
  await expect(editor.getByLabel('Energija · kcal na 100 g')).toHaveValue('');
});
