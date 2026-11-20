import { expect, test, type Page } from '@playwright/test';
import { mockDashboardApi } from './fixtures';

const A = '2026-11-14', B = '2026-11-13', C = '2026-11-12';
const card = (page: Page) => page.locator('.nutrition article').filter({
  has: page.getByRole('heading', { name: 'Garmin energetski kontekst' }),
});
const balance = (page: Page) => card(page).locator('p').filter({ hasText: 'Bilanca do sinkronizacije' });
const choose = async (page: Page, date: string) => {
  await page.locator('#date').fill(date);
  await page.locator('#date').press('Tab');
};

function gate() {
  let open!: () => void;
  const wait = new Promise<void>(resolve => { open = resolve; });
  return { wait, open };
}

async function setup(page: Page) {
  await mockDashboardApi(page);
  await page.clock.setFixedTime(new Date(A + 'T12:00:00Z'));
  const calls: string[] = [];
  const holds = new Map<string, ReturnType<typeof gate>>();
  const totals = new Map<string, number | null>([[A, 2300], [B, 1700], [C, 0]]);
  const responseDates = new Map<string, string>();
  const diaryDates = new Map<string, string>();
  await page.route('**/api/nutrition/diary?*', route => {
    const day = new URL(route.request().url()).searchParams.get('date')!;
    return route.fulfill({ json: { ok: true, data: {
      date: diaryDates.get(day) ?? day, entries: [], complete: true, targets: {},
      nutrients: { kcal: '2000', protein: '70', fat: '50', carbs: '200', fiber: '20' },
    } } });
  });
  await page.route('**/api/nutrition/energy?*', async route => {
    const day = new URL(route.request().url()).searchParams.get('date')!;
    calls.push(day);
    const total = totals.get(day);
    await holds.get(day)?.wait;
    await route.fulfill({ json: { ok: true, data: {
      date: responseDates.get(day) ?? day, source: 'Garmin test', status: total == null ? 'unavailable' : 'available',
      provisional: day === A, fetchedAt: null, totalCalories: total ?? null,
      activeCalories: null, restingCalories: null, localEstimate: null, history: [],
    } } });
  });
  await page.goto('/#nutrition-trends');
  await expect(balance(page)).toHaveText(/[-−]300 kcal/);
  return { calls, holds, totals, responseDates, diaryDates };
}

test('energy and diary follow the date selected outside Nutrition without flashing the old balance', async ({page}) => {
  const state = await setup(page);
  await page.getByRole('tab', {name:'Pregled', exact:true}).click();
  await choose(page, B);
  // Observe every rendered update while this date is selected, including updates
  // between Playwright assertions. Hidden sections do not count as a display.
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.nutrition')!;
    new MutationObserver(() => {
      const row = [...root.querySelectorAll('p')].find(p => p.textContent?.startsWith('Bilanca do sinkronizacije'));
      if (row?.getClientRects().length && /[-−]300 kcal/.test(row.textContent ?? ''))
        root.dataset.wrongBalanceSeen = 'true';
    }).observe(root, {subtree:true, childList:true, characterData:true});
  });
  const paused = gate();
  state.holds.set(B, paused);
  try {
    await page.getByRole('tab', {name:'Prehrana', exact:true}).click();
    await page.locator('.nutrition-subnav a[href="#nutrition-trends"]').click();
    await expect(balance(page)).toHaveText(/— kcal/);
    await expect(card(page).locator('strong')).toHaveText(/— kcal/);
  } finally { paused.open(); }
  await expect(balance(page)).toHaveText(/: 300 kcal$/);
  await expect(card(page)).toContainText(B);
  await expect(page.locator('.nutrition')).not.toHaveAttribute('data-wrong-balance-seen', 'true');
  expect(state.calls.at(-1)).toBe(B);
});

test('rapid date changes ignore late responses and preserve a real zero', async ({page}) => {
  // Deliver the old response even after cancellation, as with an already
  // resolved transport. The component must discard it before updating the UI.
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (url, init) => fetch(url, String(url).includes('/nutrition/energy?') ? {...init, signal:null} : init);
  });
  const state = await setup(page);
  const paused = gate();
  state.holds.set(B, paused);
  const delivered = page.waitForResponse(response => response.url().includes('/nutrition/energy?date=' + B));
  try {
    await choose(page, B);
    await expect.poll(() => state.calls.includes(B)).toBe(true);
    await choose(page, C);
    await expect(balance(page)).toHaveText(/: 2\.000 kcal$/);
  } finally { paused.open(); }
  await (await delivered).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(card(page).locator('strong')).toHaveText('0 kcal ukupno');
  await expect(card(page)).toContainText(C);
  await page.getByRole('tab',{name:'Pregled',exact:true}).click();
  await page.getByRole('tab',{name:'Prehrana',exact:true}).click();
  await page.locator('.nutrition-subnav a[href="#nutrition-trends"]').click();
  await expect(balance(page)).toHaveText(/: 2\.000 kcal$/);
});

test('Nutrition refresh reloads the selected energy and rejects missing or mismatched data', async ({page}) => {
  const state = await setup(page);
  const refresh = page.getByRole('button', {name:'Osvježi prehranu'});
  await choose(page, B);
  await expect(balance(page)).toHaveText(/: 300 kcal$/);
  state.totals.set(B, null);
  await refresh.click();
  await expect.poll(() => state.calls.filter(day => day === B).length).toBeGreaterThan(1);
  await expect(card(page)).toContainText('Nedostupno');
  await expect(balance(page)).toHaveText(/— kcal/);
  state.totals.set(B, 2000);
  state.responseDates.set(B, A);
  await refresh.click();
  await expect(card(page)).toContainText('Nedostupno');
  await expect(card(page).locator('strong')).toHaveText(/— kcal/);
  state.responseDates.delete(B);
  await refresh.click();
  await expect(balance(page)).toHaveText(/: 0 kcal$/);
  state.diaryDates.set(B, A);
  await refresh.click();
  await expect(page.locator('.nutrition [role=alert]')).toBeVisible();
  await expect(balance(page)).toHaveCount(0);
});
