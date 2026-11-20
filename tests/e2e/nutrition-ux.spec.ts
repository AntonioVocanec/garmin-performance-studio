import { expect, test, type Page } from '@playwright/test';
import { mockDashboardApi, openNutritionSection } from './fixtures';

async function setup(page: Page, section = 'overview') {
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true, data: {
    status: 'unavailable', totalCalories: null, history: [],
  } } }));
  await page.goto('/#nutrition-' + section);
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
}

async function go(page: Page, section: string) {
  await openNutritionSection(page, section);
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
}

test.describe('Nutrition chart day coverage', () => {
  test.use({ serviceWorkers: 'block' });
  const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${25 + i}`);
  const missingDay = (date: string) => ({ date, complete: false,
    nutrients: { kcal: null, protein: null, carbs: null, fat: null, fiber: null } });
  const scenarios = [
    { name: 'no rows', count: 0, values: [], expected: 'Nema dana za prikaz' },
    { name: 'all missing', count: 7, values: [], expected: '7 dana · bez dostupnih vrijednosti' },
    { name: 'partial', count: 7, values: [0, 100, null, null, null, null, null], expected: '7 dana · 3 dana s vrijednostima' },
    { name: 'all zero', count: 7, values: [0, 0, 0, 0, 0, 0, 0], expected: '7 dana · svi dani imaju dostupne vrijednosti' },
    { name: 'single missing', count: 1, values: [], expected: '1 dan · bez dostupnih vrijednosti' },
  ];

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }, testInfo) => {
      await mockDashboardApi(page);
      const rows = dates.slice(0, scenario.count).map((date, index) => ({ ...missingDay(date),
        nutrients: { ...missingDay(date).nutrients, kcal: scenario.values[index] ?? null } }));
      await page.route('**/api/nutrition/analytics?**', route => route.fulfill({ json: { ok: true, data: rows } }));
      await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true, data: {
        date: new URL(route.request().url()).searchParams.get('date'), status: 'unavailable', totalCalories: null,
        // The same day has two series; a third day has only expenditure.
        history: scenario.name === 'partial' ? [{ date: dates[1], totalCalories: 2000 }, { date: dates[5], totalCalories: 2500 }] : [],
      } } }));
      await page.goto('/#nutrition-trends');
      const chart = page.locator('#nutrition-energy-chart');
      const inspector = page.locator('details[data-chart-inspector-for="nutrition-energy-chart"]');
      await expect(inspector.locator('summary')).toHaveText('Unos i potrošnja · ' + scenario.expected);
      expect(await inspector.locator('summary').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
      await expect(chart).toHaveAttribute('aria-label', new RegExp(scenario.expected.replace(/[.*+?^$()|[\]\\]/g, '\\$&')));
      await inspector.locator('summary').click();
      await expect(inspector.locator('tbody tr')).toHaveCount(scenario.count);
      if (scenario.name === 'all zero' || scenario.name === 'partial') {
        await expect(chart.locator('canvas')).toBeVisible();
        await expect(inspector.locator('tbody tr').first()).toContainText('0 kcal');
        await chart.focus();
        await page.keyboard.press('Home');
        await expect(chart).toHaveAttribute('aria-label', /Odabrano:.*Unos: 0 kcal/);
      } else {
        await expect(chart.locator('.empty-chart')).toHaveText(scenario.expected);
        if (scenario.count) await expect(inspector.locator('tbody tr').first()).toContainText('nema podatka');
      }
      if (scenario.name === 'all missing' || scenario.name === 'partial') {
        const panel = page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: 'Unos i potrošnja · 7 dana', exact: true }) });
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 844 });
          await panel.scrollIntoViewIfNeeded();
          await panel.screenshot({ path: testInfo.outputPath(`nutrition-${scenario.name.replace(' ', '-')}-${width}.png`) });
          const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1] + 1);
        }
      }
    });
  }

  test('refreshes coverage after date changes and returning to the overview', async ({ page }) => {
    await mockDashboardApi(page);
    let rows: unknown[] = dates.map(missingDay);
    await page.route('**/api/nutrition/analytics?**', route => route.fulfill({ json: { ok: true, data: rows } }));
    await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true, data: { date: new URL(route.request().url()).searchParams.get('date'), totalCalories: null, history: [] } } }));
    await page.goto('/#nutrition-trends');
    const summary = page.locator('details[data-chart-inspector-for="nutrition-energy-chart"] > summary');
    await expect(summary).toContainText('7 dana · bez dostupnih vrijednosti');
    rows = dates.map(date => ({ ...missingDay(date), nutrients: { ...missingDay(date).nutrients, kcal: '0' } }));
    await page.locator('#date').fill('2020-01-06');
    await page.locator('#date').press('Tab');
    await expect(summary).toContainText('svi dani imaju dostupne vrijednosti');
    await go(page, 'diary');
    rows = [];
    await go(page, 'trends');
    await expect(summary).toContainText('Nema dana za prikaz');
  });

  test('counts valid zero but excludes absent and malformed values across Nutrition charts', async ({ page }) => {
    await mockDashboardApi(page);
    const rows = dates.map((date, index) => ({ date, complete: true, nutrients:
      index === 0 ? { kcal: '0', protein: '0', carbs: null, fat: null, fiber: null }
        : index === 1 ? { kcal: 'bad', protein: 'bad' }
        : index === 2 ? {} : { kcal: null, protein: null, fat: null },
    }));
    await page.route('**/api/nutrition/analytics?**', route => route.fulfill({ json: { ok: true, data: rows } }));
    await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true, data: {
      date: new URL(route.request().url()).searchParams.get('date'), history: [{ date: dates[0], totalCalories: 0 }], totalCalories: null,
    } } }));
    await page.goto('/#nutrition-trends');
    for (const id of ['nutrition-energy-chart', 'nutrition-macro-chart', 'nutrition-balance-chart']) {
      const inspector = page.locator(`details[data-chart-inspector-for="${id}"]`);
      await expect(inspector.locator('summary')).toContainText('7 dana · 1 dan s vrijednostima');
      if (id === 'nutrition-balance-chart') await page.locator('.nutrition details > summary').filter({ hasText: /^Energetska bilanca · potvrđeni dani$/ }).click();
      await inspector.locator('summary').click();
      await expect(inspector.locator('tbody tr')).toHaveCount(7);
      await expect(inspector.locator('tbody tr').first()).toContainText('0');
      await expect(inspector.locator('tbody tr').nth(1)).toContainText('nema podatka');
      await expect(inspector.locator('tbody')).not.toContainText('NaN');
    }
  });
});

test('nutrition notices stay in their action context including late success and errors', async ({ page }) => {
  await setup(page, 'shopping');
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.getByRole('status')).toContainText('Pregled manjka je spreman');
  await go(page, 'overview');
  await expect(page.locator('.nutrition [role="status"]')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Manjkovi za odabrano razdoblje' })).toBeVisible();
  for (const status of [200, 422]) {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/nutrition/shopping/preview?includeToken=true', async route => {
      await gate;
      await route.fulfill({ status, json: status === 200 ? { ok: true, data: { items:[], token:'a'.repeat(64) } } : { detail: 'Testna pogreška kupovine' } });
    });
    const sent = page.waitForRequest('**/api/nutrition/shopping/preview?includeToken=true');
    await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
    await sent;
    await openNutritionSection(page, 'overview');
    release();
    await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.nutrition [role="status"], .nutrition [role="alert"]')).toHaveCount(0);
    await go(page, 'shopping');
    await page.unroute('**/api/nutrition/shopping/preview?includeToken=true');
  }
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.locator('#date').fill('2018-03-12');
  await page.locator('#date').press('Tab');
  await expect(page.locator('.nutrition [role="status"]')).toHaveCount(0);
});

test('nutrition chart descriptions and tables preserve missing values and zero in Croatian', async ({ page }) => {
  await mockDashboardApi(page);
  const nutrients = (kcal: string | null) => ({ kcal, protein: kcal, carbs: kcal, fat: kcal, fiber: null });
  await page.route('**/api/nutrition/analytics?**', route => route.fulfill({ json: { ok: true, data: [
    { date: '2026-10-29', nutrients: nutrients(null), complete: false },
    { date: '2026-10-30', nutrients: nutrients('0'), complete: true },
    { date: '2026-10-31', nutrients: nutrients('100'), complete: true },
  ] } }));
  await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true, data: {
    date: '2026-10-31', totalCalories: 2000, history: [
      { date: '2026-10-29', totalCalories: null }, { date: '2026-10-30', totalCalories: 0 },
      { date: '2026-10-31', totalCalories: 2000 },
    ],
  } } }));
  await page.goto('/#nutrition-trends');
  const chart = page.locator('#nutrition-energy-chart');
  await expect(chart.locator('canvas')).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /Unos i potrošnja.*nema podatka.*0 kcal/);
  const labels = await chart.evaluate(node => [node.getAttribute('aria-label'), ...Array.from(node.querySelectorAll('[aria-label]')).map(n => n.getAttribute('aria-label'))]);
  expect(labels.join(' ')).not.toMatch(/NaN|This is|chart with|series in/i);
  expect(labels.join(' ')).toContain('nema podatka');
  const inspector = page.locator('details[data-chart-inspector-for="nutrition-energy-chart"]');
  await inspector.locator('summary').click();
  await expect(inspector.locator('tbody tr').nth(0)).toContainText('nema podatka');
  await expect(inspector.locator('tbody tr').nth(1)).toContainText('0 kcal');
  await chart.focus();
  await page.keyboard.press('Home');
  await expect(chart).toHaveAttribute('aria-label', /Odabrano:.*nema podatka/);
  await page.keyboard.press('ArrowRight');
  await expect(chart).toHaveAttribute('aria-label', /Odabrano:.*Unos: 0 kcal/);
  await page.keyboard.press('Escape');
  await chart.locator('canvas').hover({ position: { x: 220, y: 90 } });
  await expect(chart.locator('.dashboard-chart-tooltip')).not.toContainText('NaN');
});

test('nutrition empty shopping explains manual lists and clears stale dated previews', async ({ page, request }) => {
  const response = await request.post('/api/nutrition/foods', { headers: { 'Idempotency-Key': crypto.randomUUID() }, data: {
    name: 'Ručna stavka ' + crypto.randomUUID(), source: 'Izmišljena deklaracija', nutrients: { kcal: '100' },
  } });
  expect(response.ok()).toBeTruthy();
  const food = (await response.json()).data;
  await setup(page, 'shopping');
  await page.locator('#date').fill('2018-04-02');
  await page.locator('#date').press('Tab');
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.locator('.nutrition')).toContainText('Tjedni plan je prazan. Nema izračunatih stavki');
  await page.getByRole('button', { name: 'Izradi praznu listu' }).click();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
  const manual = page.locator('.nutrition summary').filter({ hasText: 'Ručno dodaj namirnicu' }).last();
  await expect(manual).toBeVisible();
  const list = manual.locator('..');
  if (await list.getAttribute('open') === null) await manual.click();
  await list.getByRole('combobox', { name: 'Namirnica', exact: true }).selectOption(food.id);
  await list.getByLabel('Količina', { exact: true }).fill('50');
  const add = list.getByRole('button', { name: 'Dodaj na listu' });
  await add.focus();
  await expect(add).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.nutrition')).toContainText(food.name + ' · 50 g');
  await page.locator('#date').fill('2018-04-03');
  await page.locator('#date').press('Tab');
  await expect(page.getByRole('button', { name: 'Izradi praznu listu' })).toHaveCount(0);
});

test('nutrition complete user flow creates food receipt recipe plan batch diary and shopping on mobile', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'catalog');
  await page.locator('#date').fill('2018-05-07');
  await page.locator('#date').press('Tab');
  const name = 'UX namirnica ' + crypto.randomUUID();
  const editor = page.locator('.nutrition details').filter({ has: page.locator('summary').filter({ hasText: /^Nova namirnica$/ }) });
  await editor.locator(':scope > summary').click();
  await editor.getByRole('button', { name: 'Spremi', exact: true }).click();
  expect(await editor.getByLabel('Naziv', { exact: true }).evaluate(input => (input as HTMLInputElement).validity.valueMissing)).toBeTruthy();
  await editor.getByLabel('Naziv', { exact: true }).fill(name);
  await editor.getByLabel('Izvor podataka', { exact: true }).fill('Izmišljena deklaracija');
  for (const [label, value] of [['Energija · kcal', '400'], ['Proteini · g', '10'], ['Ugljikohidrati · g', '60'], ['Masti · g', '8'], ['Vlakna · g', '5']]) {
    await editor.getByLabel(label + ' na 100 g', { exact: true }).fill(value);
  }
  await editor.getByLabel('Definicija ugljikohidrata').selectOption('eu_available');
  await editor.getByRole('button', { name: 'Spremi', exact: true }).click();
  await go(page, 'inventory');
  await page.getByRole('button',{name:'Zaprimi namirnicu'}).click();
  const receipt = page.getByRole('dialog', { name: 'Prijem namirnica' });
  await expect(receipt.getByRole('combobox', { name: 'Namirnica', exact: true })).toContainText(name);
  await receipt.getByRole('combobox', { name: 'Namirnica', exact: true }).selectOption({ label: name + ' · g' });
  await receipt.getByLabel('Količina za prijem · g', { exact: true }).fill('200');
  await receipt.getByLabel('Datum stvarnog primitka').fill('2018-05-06');
  await receipt.getByLabel('Rok', { exact: true }).fill('2099-12-01');
  await receipt.getByLabel('Nabavna cijena ukupno · EUR').fill('4');
  await receipt.getByLabel('Količina za prijem · g', { exact: true }).fill('-1');
  await receipt.getByRole('button', { name: 'Potvrdi prijem' }).click();
  await expect(page.locator('.nutrition [role="alert"]')).toBeVisible();
  await receipt.getByLabel('Količina za prijem · g', { exact: true }).fill('200');
  await receipt.getByRole('button', { name: 'Potvrdi prijem' }).click();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
  const inventory = async () => (await (await request.get('/api/nutrition/inventory')).json()).data;
  const raw = (await inventory()).find((lot: { name: string }) => lot.name === name);
  expect(raw.quantity).toBe('200');
  await go(page, 'catalog');
  await page.locator('.nutrition summary').filter({ hasText: /^Katalog namirnica/ }).click();
  await page.locator('.nutrition-row').filter({ hasText: name }).getByRole('button', { name: 'Uredi', exact: true }).click();
  const edit = page.locator('.nutrition details').filter({ has: page.locator('summary').filter({ hasText: /^Uredi namirnicu$/ }) });
  await expect(edit.getByLabel('Proteini · g na 100 g', { exact: true })).toHaveValue('10');
  await edit.getByRole('button', { name: 'Spremi novu verziju' }).click();
  await expect(page.locator('.nutrition summary').filter({ hasText: /^Nova namirnica$/ })).toBeVisible();
  await go(page, 'recipes');
  await page.locator('.nutrition summary').filter({ hasText: /^Novi recept$/ }).click();
  const recipeName = 'UX recept ' + crypto.randomUUID();
  await page.getByLabel('Naziv', { exact: true }).fill(recipeName);
  await page.getByLabel('Broj porcija', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Dodaj sastojak' }).click();
  await page.getByRole('combobox', { name: 'Namirnica', exact: true }).selectOption({ label: name + ' · g · label' });
  await page.getByLabel('Količina', { exact: true }).fill('100');
  await page.getByLabel('Koraci · svaki u novom retku').fill('Pomiješaj izmišljenu namirnicu.');
  await page.getByRole('button', { name: 'Spremi', exact: true }).click();
  await expect(page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) })).toContainText('200 kcal');
  await go(page, 'planner');
  await page.getByRole('button', { name: 'Planiraj obrok' }).click();
  await page.getByRole('combobox', { name: 'Recept', exact: true }).selectOption({ label: recipeName });
  await page.getByLabel('Porcije', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Dodaj u plan' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  expect((await inventory()).find((l: { id: string }) => l.id === raw.id).quantity).toBe('200');
  await go(page, 'shopping');
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.locator('.nutrition')).toContainText('Za odabrani plan nema izračunatih manjkova.');
  await go(page, 'prep');
  await page.getByRole('combobox', { name: 'Recept', exact: true }).selectOption({ label: recipeName });
  await page.getByLabel('Porcije', { exact: true }).fill('2');
  await page.getByLabel('Rok gotovog jela', { exact: true }).fill('2099-11-16');
  await page.getByRole('button', { name: 'Provjeri pripremu' }).click();
  await page.getByRole('button', { name: 'Potvrdi kuhanje i potrošnju sastojaka' }).click();
  await expect(page.getByRole('status')).toContainText('Kuhanje je potvrđeno');
  let lots = await inventory();
  expect(lots.find((l: { id: string }) => l.id === raw.id).quantity).toBe('100');
  const portion = lots.find((l: { name: string }) => l.name === recipeName);
  expect(portion.quantity).toBe('2');
  await page.getByRole('link', { name: 'Otvori gotove porcije' }).click();
  await page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) }).getByRole('link', { name: 'Zabilježi konzumaciju' }).click();
  await page.getByLabel(/Količina ·/).fill('0.5');
  await page.getByRole('button', { name: 'Potvrdi unos' }).click();
  await expect(page.getByRole('status')).toContainText('Obrok je zabilježen');
  lots = await inventory();
  expect(lots.find((l: { id: string }) => l.id === portion.id).quantity).toBe('1.5');
  const diary = (await (await request.get('/api/nutrition/diary?date=2018-05-07')).json()).data;
  expect(diary.entries.find((e: { name: string }) => e.name === recipeName).nutrients.kcal).toBe('100');
  await go(page, 'planner');
  await page.getByRole('button', { name: 'Planiraj obrok' }).click();
  await page.getByRole('combobox', { name: 'Recept', exact: true }).selectOption({ label: recipeName });
  await page.getByLabel('Porcije', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Dodaj u plan' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await go(page, 'shopping');
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.locator('.nutrition')).toContainText(name + ': nedostaje 225 g');
  await expect(page.getByRole('button', { name: 'Spremi novu listu' })).toBeVisible();
  const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1] + 1);
  await page.screenshot({ path: 'tmp/nutrition-ux-mobile.png' });
});
