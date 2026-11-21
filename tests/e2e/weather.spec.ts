import { expect, test } from '@playwright/test';
import { dashboardPayload, mockDashboardApi } from './fixtures';

const days = Array.from({ length: 7 }, (_, i) => ({
  date: '2026-11-' + (21 + i), code: i === 1 ? null : 0,
  low: i === 1 ? null : 0, high: 6, rainChance: i === 1 ? null : 0,
}));
const response = { days, updatedAt: '2026-11-21T08:00:00+01:00', stale: false };

for (const width of [390, 836, 1440]) {
  test('one overview header and reachable weather days at ' + width, async ({ page }) => {
    await mockDashboardApi(page);
    await page.clock.setFixedTime(new Date(response.updatedAt));
    await page.setViewportSize({ width, height: 900 });
    let calls = 0;
    await page.route('**/api/weather/forecast', route => {
      calls++;
      return route.fulfill({json: response});
    });
    await page.goto('/');
    await expect(page.locator('#dashboard-view-overview > .dashboard-view-heading')).toHaveCount(0);
    await expect(page.locator('.hero-main h1')).toContainText('Sleep debt');
    const panel = page.locator('.hero-main .forecast');
    await expect(panel.getByRole('heading')).toContainText(/21\.\s*11\..*27\.\s*11\./);
    const items = panel.getByRole('listitem');
    await expect(items).toHaveCount(7);
    await expect(items.first().locator('time')).toHaveText('Danas');
    await expect(items.first().getByRole('img', {name:'Vedro'})).toBeVisible();
    await expect(items.first()).toContainText('Oborine 0 %');
    await expect(items.nth(1)).toContainText('Oborine —');
    const strip = panel.getByRole('region');
    await strip.focus();
    if (width === 390) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    if (width === 1440) expect(await strip.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await items.last().scrollIntoViewIfNeeded();
    await expect(items.last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && scrollX === 0)).toBe(true);
    await page.locator('#date').fill('2026-10-01');
    await page.locator('#date').press('Tab');
    await expect(items.first().locator('time')).toHaveAttribute('datetime', days[0].date);
    expect(calls).toBe(1);
  });
}

test('Garmin insight remains visible while forecast is pending or unavailable', async ({page}) => {
  await mockDashboardApi(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/weather/forecast', async route => {
    await gate;
    await route.fulfill({status:503,json:{ok:false}});
  });
  await page.goto('/', {waitUntil:'domcontentloaded'});
  try {
    await expect(page.locator('.forecast')).toContainText('Učitavam prognozu');
    await expect(page.locator('.hero-main h1')).toContainText('Sleep debt');
  } finally { release(); }
  await expect(page.locator('.forecast')).toContainText('Prognoza trenutačno nije dostupna');
  await expect(page.locator('.hero-main h1')).toContainText('Sleep debt');
});

test('cached forecast identifies the last update and source', async ({page}) => {
  await mockDashboardApi(page);
  await page.clock.setFixedTime(new Date('2026-11-21T12:00:00+01:00'));
  await page.route('**/api/weather/forecast', route => route.fulfill({json:{...response,stale:true}}));
  await page.goto('/');
  await expect(page.locator('.forecast footer')).toContainText('Zadnja dostupna prognoza u 08:00');
  await expect(page.locator('.forecast a')).toHaveAttribute('href','https://open-meteo.com/');
});

test('an open overview refreshes at Zagreb midnight independently of the selected date', async ({page}) => {
  await mockDashboardApi(page);
  const evening = '2026-11-21T23:59:55+01:00';
  await page.clock.install({time:new Date(evening)});
  let calls = 0;
  await page.route('**/api/weather/forecast', route => {
    const tomorrow = calls++ > 0;
    const rows = tomorrow ? days.map((row, i) => ({...row, date:'2026-11-' + (22 + i)})) : days;
    return route.fulfill({json:{days:rows,updatedAt:tomorrow ? '2026-11-22T00:00:00+01:00' : evening,stale:false}});
  });
  await page.goto('/');
  const first = page.locator('.forecast time').first();
  await expect(first).toHaveAttribute('datetime', '2026-11-21');
  await page.locator('#date').fill('2026-10-01');
  await page.clock.fastForward(6000);
  await expect(first).toHaveAttribute('datetime', '2026-11-22');
  await expect(page.locator('#date')).toHaveValue('2026-10-01');
  expect(calls).toBe(2);
});

test('selects a forecast day and switches its temperature, rain and wind', async ({page}) => {
  await mockDashboardApi(page);
  await page.clock.setFixedTime(new Date(response.updatedAt));
  await page.setViewportSize({width:390,height:844});
  const detailed = days.map((day,i) => ({...day,hours:[0,3,6,9,12,15,18,21].map(h => ({
    time:day.date+'T'+String(h).padStart(2,'0')+':00',temp:i+h,wind:11,rain:0,direction:90
  }))}));
  await page.route('**/api/weather/forecast',route=>route.fulfill({json:{...response,days:detailed,
    current:{time:days[0].date+'T08:00',code:0,daylight:1,temp:4,humidity:96,wind:6,rain:0}}}));
  await page.goto('/');
  const panel=page.locator('.forecast');
  await expect(panel.locator('.summary')).toContainText('Vlažnost 96 %');
  await panel.locator('.day').nth(1).click();
  await expect(panel.locator('.summary')).toContainText('Dnevna prognoza');
  await expect(panel.locator('.slot b').first()).toHaveText('1°');
  await panel.getByRole('button',{name:'Oborine',exact:true}).click();
  await expect(panel.locator('.slot b').first()).toHaveText('0%');
  await panel.getByRole('button',{name:'Vjetar',exact:true}).click();
  await expect(panel.locator('.arrow').first()).toHaveAttribute('aria-label','Vjetar iz smjera 90°');
  await expect(panel.locator('.slot b').first()).toHaveText('11');
});


test('shows the Runna plan for the hovered or focused forecast day', async ({ page }) => {
  await mockDashboardApi(page);
  await page.clock.setFixedTime(new Date(response.updatedAt));
  await page.setViewportSize({ width: 836, height: 1253 });
  await page.route('**/api/weather/forecast', route => route.fulfill({ json: response }));
  await page.route('**/api/dashboard**', route => {
    const date = new URL(route.request().url()).searchParams.get('date')!;
    const payload = dashboardPayload(date);
    const runs = [
      { title: 'Jutarnje trčanje', date: days[0].date, start: days[0].date + 'T09:00:00+01:00', distanceKm: 6, durationSeconds: 2100 },
      { title: 'Dugo trčanje', date: days[1].date, start: days[1].date + 'T00:00:00+01:00', distanceKm: 12, durationSeconds: 4200, allDay: true },
    ];
    payload.normalized.runnaSchedule.upcomingRuns = runs;
    return route.fulfill({ json: payload });
  });
  await page.goto('/');
  const buttons = page.locator('.forecast button.day');
  const tip = page.getByRole('tooltip');
  await buttons.first().hover();
  await expect(tip).toContainText('Jutarnje trčanje');
  await expect(tip).toContainText('09:00 · 6 km · 35 min');
  await buttons.nth(1).hover();
  await expect(tip).toContainText('Dugo trčanje');
  await expect(tip).toContainText('Termin nije zadan');
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await page.locator('.forecast .strip').focus();
  await page.keyboard.press('Tab');
  await expect(buttons.first()).toBeFocused();
  await expect(tip).toContainText('Jutarnje trčanje');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(tip).toContainText('Nema nadolazećeg trčanja');
  await page.setViewportSize({ width: 390, height: 844 });
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(tip).toContainText('Dugo trčanje');
  await expect(tip).toBeInViewport();
});
