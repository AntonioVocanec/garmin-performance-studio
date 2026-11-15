import { expect, test, type Page } from '@playwright/test';
import { mockDashboardApi } from './fixtures';

async function setup(page: Page, section = 'overview') {
  await mockDashboardApi(page);
  await page.route('**/api/nutrition/energy**', route => route.fulfill({ json: { ok: true, data: {
    status: 'unavailable', totalCalories: null, history: [],
  } } }));
  await page.goto('/#nutrition-' + section);
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
}

async function go(page: Page, section: string) {
  await page.locator(`.quick-nav a[href="#nutrition-${section}"]`).click();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
}

test('nutrition notices stay in their action context including late success and errors', async ({ page }) => {
  await setup(page, 'shopping');
  await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
  await expect(page.getByRole('status')).toContainText('Pregled manjka je spreman');
  await go(page, 'overview');
  await expect(page.locator('.nutrition [role="status"]')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Kupovina iz tjednog plana' })).toBeVisible();
  for (const status of [200, 422]) {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/nutrition/shopping/preview', async route => {
      await gate;
      await route.fulfill({ status, json: status === 200 ? { ok: true, data: [] } : { detail: 'Testna pogreška kupovine' } });
    });
    const sent = page.waitForRequest('**/api/nutrition/shopping/preview');
    await page.getByRole('button', { name: 'Izračunaj manjkove' }).click();
    await sent;
    await page.locator('.quick-nav a[href="#nutrition-overview"]').click();
    release();
    await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.nutrition [role="status"], .nutrition [role="alert"]')).toHaveCount(0);
    await go(page, 'shopping');
    await page.unroute('**/api/nutrition/shopping/preview');
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
  await page.goto('/#nutrition-overview');
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
  await setup(page, 'inventory');
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
  const receipt = page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: 'Prijem namirnica' }) });
  await expect(receipt.getByRole('combobox', { name: 'Namirnica', exact: true })).toContainText(name);
  await receipt.getByRole('combobox', { name: 'Namirnica', exact: true }).selectOption({ label: name + ' · g' });
  await receipt.getByLabel('Količina', { exact: true }).fill('200');
  await receipt.getByLabel('Datum stvarnog primitka').fill('2018-05-06');
  await receipt.getByLabel('Rok', { exact: true }).fill('2099-12-01');
  await receipt.getByLabel('Nabavna cijena ukupno · EUR').fill('4');
  await receipt.getByLabel('Količina', { exact: true }).fill('-1');
  await receipt.getByRole('button', { name: 'Potvrdi prijem' }).click();
  await expect(page.locator('.nutrition [role="alert"]')).toBeVisible();
  await receipt.getByLabel('Količina', { exact: true }).fill('200');
  await receipt.getByRole('button', { name: 'Potvrdi prijem' }).click();
  await expect(page.locator('.nutrition')).toHaveAttribute('aria-busy', 'false');
  const inventory = async () => (await (await request.get('/api/nutrition/inventory')).json()).data;
  const raw = (await inventory()).find((lot: { name: string }) => lot.name === name);
  expect(raw.quantity).toBe('200');
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
  await page.locator('.nutrition article').filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) }).getByRole('button', { name: 'Zabilježi konzumaciju' }).click();
  await page.getByLabel(/Količina ·/).fill('0.5');
  await page.getByRole('button', { name: 'Potvrdi unos' }).click();
  await expect(page.getByRole('status')).toContainText('Obrok je zabilježen');
  lots = await inventory();
  expect(lots.find((l: { id: string }) => l.id === portion.id).quantity).toBe('1.5');
  const diary = (await (await request.get('/api/nutrition/diary?date=2018-05-07')).json()).data;
  expect(diary.entries.find((e: { name: string }) => e.name === recipeName).nutrients.kcal).toBe('100');
  await go(page, 'planner');
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
