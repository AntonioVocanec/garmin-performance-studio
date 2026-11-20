import { expect, test, type Page, type Route } from '@playwright/test';
import { mockDashboardApi, openNutritionSection } from './fixtures';

test.use({ serviceWorkers: 'block' });

async function chooseDate(page: Page, date: string) {
  await page.locator('#date').fill(date);
  await page.locator('#date').press('Tab');
  await expect(page.locator('.nutrition-toolbar .badge')).toContainText(date);
}

const nutrients = { kcal: '100', protein: '10', carbs: '10', fat: '2', fiber: '1' };
const food = { id: 'food-a', name: 'Testna namirnica', unit: 'g', state: 'raw', version: 1,
  nutrients, minimumQuantity: '0', allergens: [], dietaryTags: [], source: 'Izmišljena deklaracija' };
const recipes = ['a', 'b'].map(id => ({ id: 'recipe-' + id, versionId: 'version-' + id,
  version: 1, name: 'Testni recept ' + id, portions: '2', minutes: 5, method: 'other', category: 'lunch',
  ingredients: [{ foodId: food.id, quantity: '100', optional: false },
    { foodId: food.id, quantity: '10', optional: true }],
  steps: ['Pomiješaj.'], tags: [], nutrients, perPortion: nutrients, costPerPortion: null }));

async function setup(page: Page, section: string) {
  await mockDashboardApi(page);
  for (const [path, data] of Object.entries({ foods: [food], recipes,
    inventory: ['a', 'b'].map(id => ({ id: 'lot-' + id, food_id: food.id, batch_id: null,
      name: 'Testni lot ' + id, quantity: '100', unit: 'g', location: 'pantry', expires_on: '2099-12-01', version: 1 })),
  })) await page.route('**/api/nutrition/' + path, route => route.fulfill({ json: { ok: true, data } }));
  await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true,
    data: { status: 'unavailable', totalCalories: null, history: [] } } }));
  await page.goto('/#nutrition-' + section);
  await chooseDate(page, '2019-02-04');
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
}

async function defer(page: Page, pattern: string, reply: (route: Route) => Promise<void>) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(pattern, async route => { await gate; await reply(route); });
  return release;
}

async function navigateAwayAndBack(page: Page, section: string) {
  await openNutritionSection(page, 'overview');
  await openNutritionSection(page, section);
}

for (const change of ['date', 'date-return', 'portions', 'recipe', 'optional', 'mass', 'location', 'expiry', 'navigation', 'unchanged']) {
  test('meal prep delayed result respects ' + change, async ({ page }) => {
    await setup(page, 'prep');
    await page.getByRole('combobox', { name: 'Recept', exact: true }).selectOption('version-a');
    await page.getByLabel('Porcije', { exact: true }).fill('2');
    await page.getByLabel('Rok gotovog jela', { exact: true }).fill('2099-12-01');
    const release = await defer(page, '**/api/nutrition/prep/preview', async route => {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, data: { portions: body.portions, feasible: true,
        previewToken: 'synthetic-token', nutrients, ingredients: [], issues: [], warnings: [], missing: [],
        cost: null, massPerPortion: '50' } } });
    });
    const sent = page.waitForRequest('**/api/nutrition/prep/preview');
    await page.getByRole('button', { name: 'Provjeri pripremu', exact: true }).click();
    await sent;
    if (change === 'date') await chooseDate(page, '2019-02-05');
    if (change === 'date-return') {
      await chooseDate(page, '2019-02-05');
      await chooseDate(page, '2019-02-04');
    }
    if (change === 'portions') await page.getByLabel('Porcije', { exact: true }).fill('9');
    if (change === 'recipe') await page.getByRole('combobox', { name: 'Recept', exact: true }).selectOption('version-b');
    if (change === 'optional') await page.getByRole('checkbox', { name: /Uključi opcionalni/ }).check();
    if (change === 'mass') await page.getByLabel('Gotova masa · g').fill('900');
    if (change === 'location') await page.getByRole('combobox', { name: 'Lokacija', exact: true }).selectOption('freezer');
    if (change === 'expiry') await page.getByLabel('Rok gotovog jela', { exact: true }).fill('2099-12-02');
    if (change === 'navigation') await navigateAwayAndBack(page, 'prep');
    release();
    await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
    const commit = page.getByRole('button', { name: 'Potvrdi kuhanje i potrošnju sastojaka' });
    if (change === 'unchanged') await expect(commit).toBeEnabled();
    else {
      await expect(commit).toHaveCount(0);
      await page.getByRole('button', { name: 'Provjeri pripremu', exact: true }).click();
      await expect(commit).toBeEnabled();
    }
  });
}

for (const change of ['date', 'portions', 'navigation']) {
  test('scaling delayed result respects ' + change, async ({ page }) => {
    await setup(page, 'recipes');
    const card = page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: 'Testni recept a', exact: true }) });
    const release = await defer(page, '**/api/nutrition/recipes/recipe-a/scale-preview', route =>
      route.fulfill({ json: { ok: true, data: { portions: '777', factor: '388.5', feasible: true, missing: [], warnings: [] } } }));
    const sent = page.waitForRequest('**/api/nutrition/recipes/recipe-a/scale-preview');
    await card.getByRole('button', { name: 'Pregled skaliranja' }).click();
    await sent;
    if (change === 'date') await chooseDate(page, '2019-02-05');
    if (change === 'portions') await card.getByLabel('Željene porcije').fill('9');
    if (change === 'navigation') await navigateAwayAndBack(page, 'recipes');
    release();
    await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
    await expect(card).not.toContainText('777 porcija');
  });
}

test('USDA ignores results for an edited query', async ({ page }) => {
  await setup(page, 'catalog');
  await page.locator('.nutrition summary').filter({ hasText: 'Provjereni nutritivni izvori' }).click();
  await page.getByRole('button', {name:'Otvori USDA pretragu u obrascu'}).click();
  await page.getByLabel('Upit za USDA').fill('apple');
  const release = await defer(page, '**/api/nutrition/food-search?**', route => route.fulfill({ json: {
    ok: true, data: [{ sourceId: '123', name: 'ZASTARJELI USDA REZULTAT' }] } }));
  const sent = page.waitForRequest('**/api/nutrition/food-search?**');
  await page.getByRole('button', { name: 'Pretraži USDA', exact:true }).click();
  await sent;
  await page.getByLabel('Upit za USDA').fill('pear');
  release();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.nutrition')).not.toContainText('ZASTARJELI USDA REZULTAT');
});

for (const stage of ['preview', 'generate']) {
  test('AI ignores delayed ' + stage + ' after changing selected lots', async ({ page }) => {
    await setup(page, 'ai-recipes');
    const assistant = page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: 'AI Recipe Assistant' }) });
    await assistant.getByRole('checkbox', { name: /Testni lot a/ }).check();
    const previewData = { previewId: 'synthetic-preview', items: [{ name: 'STARI AI PREGLED', quantity: '100', unit: 'g' }], staticInstructions: 'Testne upute' };
    let release: () => void;
    if (stage === 'preview') {
      release = await defer(page, '**/api/nutrition/ai/preview', route => route.fulfill({ json: { ok: true, data: previewData } }));
      const sent = page.waitForRequest('**/api/nutrition/ai/preview');
      await assistant.getByRole('button', { name: 'Prikaži sadržaj za slanje' }).click();
      await sent;
    } else {
      await page.route('**/api/nutrition/ai/preview', route => route.fulfill({ json: { ok: true, data: previewData } }));
      await assistant.getByRole('button', { name: 'Prikaži sadržaj za slanje' }).click();
      await assistant.getByRole('checkbox', { name: /Potvrđujem slanje/ }).check();
      release = await defer(page, '**/api/nutrition/ai/generate', route => route.fulfill({ json: { ok: true, data: {
        drafts: [{ id: 'old-draft', recipe: { name: 'STARI AI RECEPT', ingredients: [], steps: [] } }],
      } } }));
      const sent = page.waitForRequest('**/api/nutrition/ai/generate');
      await assistant.getByRole('button', { name: 'Generiraj recepte' }).click();
      await sent;
    }
    await assistant.getByRole('checkbox', { name: /Testni lot b/ }).check();
    release();
    await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
    await expect(assistant).not.toContainText('STARI AI PREGLED');
    await expect(assistant).not.toContainText('STARI AI RECEPT');
    await expect(page.locator('.nutrition [role="status"]')).toHaveCount(0);
  });
}

const validItem = { name: 'Testna kupovina', quantity: '0', unit: 'g', cost: null, priceDate: null };
for (const [name, data] of Object.entries({ absent: [{}], invalid: [{ ...validItem, quantity: 'bad' }],
  blank: [{ ...validItem, quantity: '' }], negative: [{ ...validItem, quantity: '-1' }],
  null: [{ ...validItem, quantity: null }], boolean: [{ ...validItem, quantity: true }],
  overflow: [{ ...validItem, quantity: '1e999' }], structure: { items: [] },
  mixed: [validItem, { ...validItem, quantity: 'bad' }],
})) {
  test('shopping rejects malformed response ' + name, async ({ page }) => {
    await setup(page, 'shopping');
    await page.route('**/api/nutrition/shopping/preview?includeToken=true', route => route.fulfill({ json: { ok: true, data: { items:data, token:'a'.repeat(64) } } }));
    await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
    await expect(page.locator('.nutrition [role="alert"]')).toContainText('Podaci pregleda kupovine nisu valjani');
    await expect(page.getByRole('button', { name: /Spremi novu listu|Izradi praznu listu/ })).toHaveCount(0);
    await expect(page.locator('.nutrition')).not.toContainText('Nema izračunatih stavki');
  });
}

test('shopping preserves positive decimals and removes only real zeros', async ({ page }) => {
  await setup(page, 'shopping');
  await page.route('**/api/nutrition/shopping/preview?includeToken=true', route => route.fulfill({ json: { ok: true,
    data: { items:[validItem, { ...validItem, name: 'Decimalna količina', quantity: '0.001' }], token:'a'.repeat(64) } } }));
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.locator('.nutrition')).toContainText('Decimalna količina: nedostaje 0.001 g');
  await expect(page.locator('.nutrition')).not.toContainText('Testna kupovina: nedostaje');
});

test('accepted scaling is cleared on a date change and invalid shopping clears an older valid preview', async ({ page }) => {
  await setup(page, 'recipes');
  const card = page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: 'Testni recept a', exact: true }) });
  await page.route('**/api/nutrition/recipes/recipe-a/scale-preview', route => route.fulfill({ json: {
    ok: true, data: { portions: '777', factor: '388.5', feasible: true, missing: [], warnings: [] },
  } }));
  await card.getByRole('button', { name: 'Pregled skaliranja' }).click();
  await expect(card).toContainText('777 porcija');
  await chooseDate(page, '2019-02-05');
  await expect(card).not.toContainText('777 porcija');
  await openNutritionSection(page, 'shopping');
  let data: unknown = [{ ...validItem, quantity: 12 }];
  await page.route('**/api/nutrition/shopping/preview?includeToken=true', route => route.fulfill({ json: { ok: true, data: { items:data, token:'a'.repeat(64) } } }));
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.getByRole('button', { name: 'Spremi novu listu' })).toBeVisible();
  data = [{ ...validItem, quantity: 'bad' }];
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.locator('.nutrition [role="alert"]')).toContainText('Podaci pregleda kupovine nisu valjani');
  await expect(page.getByRole('button', { name: 'Spremi novu listu' })).toHaveCount(0);
});

test('an already received AI recipe stays available when navigating away and back', async ({ page }) => {
  await setup(page, 'ai-recipes');
  await page.route('**/api/nutrition/ai/preview', route => route.fulfill({ json: { ok: true,
    data: { previewId: 'accepted-preview', items: [], staticInstructions: 'Testne upute' } } }));
  await page.route('**/api/nutrition/ai/generate', route => route.fulfill({ json: { ok: true,
    data: { drafts: [{ id: 'accepted', recipe: { name: 'Primljeni recept', ingredients: [], steps: [] } }] } } }));
  const assistant = page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: 'AI Recipe Assistant' }) });
  await assistant.getByRole('checkbox', { name: /Testni lot a/ }).check();
  await assistant.getByRole('button', { name: 'Prikaži sadržaj za slanje' }).click();
  await assistant.getByRole('checkbox', { name: /Potvrđujem slanje/ }).check();
  await assistant.getByRole('button', { name: 'Generiraj recepte' }).click();
  await expect(assistant).toContainText('Primljeni recept');
  await navigateAwayAndBack(page, 'ai-recipes');
  await expect(assistant).toContainText('Primljeni recept');
});

test('AI failure requires a refreshed preview and fresh confirmation', async ({ page }) => {
  await setup(page, 'ai-recipes');
  const panel = page.locator('.nutrition article').filter({has:page.getByRole('heading',{name:'AI Recipe Assistant'})});
  let previews=0, generations=0;
  await page.route('**/api/nutrition/ai/preview', route=>route.fulfill({json:{ok:true,data:{
    previewId:'preview-'+(++previews),items:[{name:'Test',quantity:String(12000/previews),unit:'g'}],staticInstructions:'Provjeri količine.'
  }}}));
  await page.route('**/api/nutrition/ai/generate', route=>{
    generations++;
    expect(route.request().postDataJSON().previewId).toBe('preview-'+generations);
    return generations===1 ? route.fulfill({status:422,json:{ok:false,error:'Prijedlog 2: nedostaje sastojak.'}})
      : route.fulfill({json:{ok:true,data:{drafts:[{id:'draft',recipe:{name:'Potvrđen nacrt',ingredients:[],steps:[]}}]}}});
  });
  await panel.getByLabel(/Testni lot a/).check();
  await panel.getByRole('button',{name:'Prikaži sadržaj za slanje'}).click();
  await panel.getByLabel(/Potvrđujem slanje/).check();
  const generate=panel.getByRole('button',{name:'Generiraj recepte'});
  await generate.click();
  await expect(page.locator('.nutrition [role=alert]')).toContainText('Prijedlog 2');
  await panel.getByRole('button',{name:'Novi pregled za slanje'}).click();
  await expect(panel).toContainText('6000 g');
  await expect(panel.getByLabel(/Testni lot a/)).toBeChecked();
  await expect(generate).toBeDisabled();
  expect(generations).toBe(1);
  await panel.getByLabel(/Potvrđujem slanje/).check();
  await generate.click();
  await expect(panel).toContainText('Potvrđen nacrt');
  expect(generations).toBe(2);
});
