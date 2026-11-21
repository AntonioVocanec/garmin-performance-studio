import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./fixtures";

async function showView(page: Page, name: "Pregled" | "Trening & Load" | "Laboratorij") {
  const tab = page.getByRole("tab", { name });
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function openDisclosure(page: Page, id: string) {
  const disclosure = page.locator(`#${id}`);
  if (await disclosure.getAttribute("open") === null) await disclosure.locator(":scope > summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
}

async function expectActiveViewCentered(page: Page) {
  const bounds = await page.locator(".dashboard-view:not([hidden])").evaluate((view) => {
    const rect = view.getBoundingClientRect();
    return { left: rect.left, right: rect.right, center: (rect.left + rect.right) / 2, viewport: document.documentElement.clientWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(Math.abs(bounds.center - bounds.viewport / 2)).toBeLessThanOrEqual(1);
}

test("renders Garmin and Runna overview without browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await mockDashboardApi(page);
  await page.goto("/");

  await expect(page).toHaveTitle("Garmin Performance Studio");
  await expect(page.getByRole("tab", { name: "Pregled" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#today-energy")).toHaveText("70");
  await expect(page.locator("#today-interpretation")).toHaveText("Sleep debt · 1 h 30 min u dostupnom prozoru");
  await expect(page.locator("#hero-executive-copy")).toContainText("Prosjek sna zadnjih 7 dana: 7 h 00 min");
  await expect(page.locator("#today-training-status")).toHaveText("Produktivan");
  await expect(page.locator("#today-acwr")).toHaveText("0,9 · Optimalno");
  await expect(page.locator("#today-load-focus")).toHaveText("Nije dostupan");
  await expect(page.locator("#today-sleep-duration")).toHaveText("6 h 30 min");
  await expect(page.locator("#today-sleep-context")).toContainText("82/100 · Dobro");
  await expect(page.locator("#today-sleep-baseline")).toContainText("−30 min prema medijanu 7 h 00 min · 28/28 noći");
  await expect(page.locator("#today-hrv")).toHaveText("64 ms");
  await expect(page.locator("#today-hrv-context")).toContainText("−2 ms prema medijanu 66 ms · 28/28 noći");
  await expect(page.locator("#daily-summary details")).not.toHaveAttribute("open", "");
  await expect(page.locator("#activity-goals .layout-3")).toBeVisible();
  await expect(page.locator("#health-overview .health-deep-dive")).not.toHaveAttribute("open", "");
  await expect(page.locator("#overview .snapshot-card")).toHaveCount(3);
  await expect(page.locator("#overview .snapshot-card").nth(0)).toContainText("Sleep Debt");
  await expect(page.locator("#overview .snapshot-card").nth(0)).toContainText("1 h 30 min");
  await expect(page.locator("#overview .snapshot-card").nth(1)).toContainText("64 ms");
  await expect(page.locator("#overview .snapshot-card").nth(1)).toContainText("−2 ms prema medijanu");
  await expect(page.locator("#overview .snapshot-card").nth(2)).toContainText("Easy run · 5 km");
  await expect(page.locator("#overview .snapshot-card").nth(2)).toHaveAttribute("href", "#training-plan");
  const scheduleRows = page.locator("#schedule .schedule-row");
  await expect(scheduleRows).toHaveCount(3);
  await expect(scheduleRows.nth(0)).toBeVisible();
  await expect(scheduleRows.nth(1)).toBeHidden();
  await page.locator("#schedule .schedule-more > summary").click();
  await expect(scheduleRows.nth(1)).toBeVisible();
  await expect(page.locator("#schedule .next-desc")).toHaveText("Lagano trčanje prema Runna planu.");
  await expect(page.locator("#schedule .next-desc")).not.toContainText("Easy effort");
  await page.locator("#schedule .next-run .run-info > summary").click();
  await expect(page.locator("#schedule .next-run .run-info > div")).toContainText("Keep the pace comfortable");
  await expect(page.locator("#schedule .next-run .run-info > div")).toContainText("relaxed aerobic consistency.");
  await expect(scheduleRows.nth(0)).toHaveAttribute("data-zebra", "odd");
  await expect(scheduleRows.nth(1)).toHaveAttribute("data-zebra", "even");
  const scheduleRowBackgrounds = await scheduleRows.evaluateAll((rows) => rows.slice(0, 2).map((row) => getComputedStyle(row).backgroundColor));
  expect(scheduleRowBackgrounds[0]).not.toBe(scheduleRowBackgrounds[1]);
  await expect(page.locator("#today-rhr")).toContainText("bpm");
  await page.locator("#health-overview .health-deep-dive > summary").click();
  await expect(page.locator("#overview-skin-context")).toContainText("0,4 °C");
  await page.locator('.health-skin-context a').click();
  await expect(page).toHaveURL(/#skin-temperature$/);
  await showView(page, "Laboratorij");
  await expect(page.locator("#skin-temperature-current")).toHaveText("+0,4 °C");
  await expect(page.locator("#skin-temperature-median")).toHaveText("+0,2 °C");
  await expect(page.locator("#skin-temperature-coverage")).toHaveText("22/28");
  await expect(page.locator("#skin-temperature-calibration")).toContainText("19 dana");
  await expect(page.locator("#skin-temperature-chart canvas")).toBeVisible();
  await showView(page, "Trening & Load");
  await expect(page.locator("#garmin-acwr")).toHaveText("0,9 · Optimalno");
  await expect(page.locator("#garmin-training-status-note")).toContainText("0,9 · Optimalno");
  await expect(page.locator("#garmin-training-status-note")).not.toContainText("38%");
  await expect(page.locator("#training-load .load-priority-grid .panel-title h3")).toHaveText(["Training Status", "Training load", "Running Tolerance"]);
  const performanceSectionOrder = await page.locator("#dashboard-view-performance .section").evaluateAll(nodes => nodes.map(node => node.id));
  expect(performanceSectionOrder).toEqual(expect.arrayContaining(["training-load", "garmin-performance-profile", "training-patterns", "performance-trends", "weekly-review", "plan-and-execution", "gear-overview", "activity-details"]));
  expect(performanceSectionOrder.indexOf("training-load")).toBeLessThan(performanceSectionOrder.indexOf("training-patterns"));
  expect(performanceSectionOrder.indexOf("training-patterns")).toBeLessThan(performanceSectionOrder.indexOf("performance-trends"));
  expect(performanceSectionOrder.indexOf("performance-trends")).toBeLessThan(performanceSectionOrder.indexOf("weekly-review"));
  const volumeSwitch = page.locator("#training-load .volume-sport-switch");
  await expect(volumeSwitch.getByRole("button", { name: "Trčanje" })).toHaveAttribute("aria-pressed", "true");
  await expect(volumeSwitch.getByRole("button", { name: "Biciklizam" })).toBeVisible();
  await volumeSwitch.getByRole("button", { name: "Biciklizam" }).click();
  await expect(page.locator("#weekly-volume-title")).toHaveText("Tjedna udaljenost · Biciklizam");
  await expect(page.locator("#weekly-volume-distance")).toHaveText("12,5 km");
  await expect(page.locator("#weekly-volume-change")).toContainText("+2,5 km");
  await expect(page.locator("#weekly-volume-count")).toHaveText("1 aktivnost");
  await expect(page.locator("#weekly-volume-secondary")).toHaveText("20 min");
  await volumeSwitch.getByRole("button", { name: "Trčanje" }).click();
  await expect(page.locator("#weekly-volume-secondary")).toHaveText("6:11/km");
  await expect(page.locator("#gear-active-list")).toContainText("Daily trainer");
  await expect(page.locator("#gear-active-list")).toContainText("Kiwi");
  await expect(page.locator("#gear-retired-details")).toContainText("Retired racer");
  await expect(page.locator("#race-predictions-grid")).toContainText("22:10");
  await expect(page.locator("#running-economy-score")).toHaveText("211");
  await expect(page.locator("#running-economy-classification")).toContainText("Utrenirano");
  await expect(page.locator("#personal-records-grid")).toContainText("Najbrži 1 km");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "measurements-disclosure");
  await expect(page.locator("#sources .source").filter({ hasText: "Hidratacija" })).toContainText("Nema zapisa");
  await expect(page.locator("#weight-latest")).toHaveText("72,4 kg");
  await expect(page.locator("#ecg-rhythm")).toHaveText("Sinusni ritam");
  await expect(page.locator("#ecg-waveform-chart canvas")).toBeVisible();
  await expect(page.locator("#sleep-debt")).toHaveText("1 h 30 min");
  await page.locator("#sleep-recovery").getByRole("tab", { name: "Oporavak" }).click();
  await expect(page.locator("#body-battery-start")).toHaveText("34");
  await expect(page.locator("#body-battery-latest")).toHaveText("70");
  await expect(page.locator("#body-battery-min")).toHaveText("34");
  await expect(page.locator("#body-battery-max")).toHaveText("70");
  await expect(page.locator("#body-battery-day-chart canvas")).toBeVisible();
  await expect(page.locator("#body-battery-day-note")).toContainText("06:15–21:45 · 3 zapisa");
  await showView(page, "Trening & Load");
  await expect(page.locator("#planned30-count")).toHaveText("Nedostupno");
  await expect(page.locator("#matched30-count")).toHaveText("Nedostupno");
  await expect(page.locator("#match-rate")).toHaveText("Nedostupno");
  await expect(page.locator("#actual30-distance")).toHaveText("24 km");
  await expect(page.locator("#training-balance-rows")).toContainText("Biciklizam");
  await expect(page.locator("#training-balance-coverage")).toContainText("4/4 trajanje");
  await expect(page.locator("#weekly-run-summary")).toContainText("3 trčanja · 18,6 km");
  await expect(page.locator("#weekly-sleep-debt")).toHaveText("1 h 30 min");
  await expect(page.locator("#weekly-rpe-average")).toHaveText("6 / 10");
  await expect(page.locator("#weekly-events")).toContainText("Sauna");
  await expect(page.locator("#weekly-next-run-title")).toHaveText("Easy run · 5 km");
  await expect(page.locator("#weekly-guidance")).toContainText("Sljedeći Runna trening ostaje");
  await showView(page, "Trening & Load");
  await expect(page.locator("#plan30-coverage-note")).toContainText("12/30 dana");
  const archivedWeek = page.locator("#plan-actual-weeks tr").first().locator("td");
  await expect(archivedWeek.nth(1)).toHaveText("Nije u arhivi");
  await expect(archivedWeek.nth(2)).toHaveText("—");
  await expect(archivedWeek.nth(3)).toContainText("Nije usporedivo");
  await showView(page, "Laboratorij");
  await expect(page.locator("#bedtime-variability")).toHaveText("±18 / ±22 min");
  await expect(page.locator("#bedtime-variability")).toHaveAttribute("title", /13\/14 noći · buđenje 14\/14 noći/);
  await showView(page, "Pregled");
  await expect(page.locator("#schedule .next-title")).toHaveText("Easy run · 5 km");
  await expect(page.locator("#steps-goal-ring")).toHaveAttribute("aria-label", /85% cilja/);
  await expect(page.locator("#exercise-goal-ring")).toHaveAttribute("aria-label", /80% cilja/);
  await expect(page.locator("#activity-calories")).toHaveText("620 kcal");
  await expect(page.locator("#activity-calories-context")).toContainText("Procjena kalorija u mirovanju za puni dan: ≈2.111 kcal prema jučerašnjem zapisu");
  await expect(page.locator("#activity-calories-context")).toContainText("Procijenjeno ukupno danas: ≈2.731 kcal");
  await expect(page.locator("#activity-calories-context")).not.toContainText("2.664");
  await expect(page.locator("#calories-label")).toHaveText("Aktivne / ukupno procijenjeno kcal");
  await expect(page.locator("#calories")).toHaveText("620 / 2.731 kcal");
  await showView(page, "Trening & Load");
  await openDisclosure(page, "performance-trends-disclosure");
  await expect(page.locator("#run-trend-distance")).toHaveText("22,5 km");
  await expect(page.locator("#run-trend-pace")).toHaveText("6:05/km");
  await expect(page.locator("#load-ratio-28")).toHaveText("1,5");
  await expect(page.locator("#training-calendar .calendar-week")).toHaveCount(13);
  await expect(page.locator("#pattern-distance-28")).toHaveText("70 km");
  await expect(page.locator("#run-monotony")).toHaveText("1,2");
  await expect(page.locator("#performance-timeline-chart canvas")).toBeVisible();
  await expect(page.locator("#performance-timeline-chart")).toHaveAttribute("role", "img");
  await expect(page.locator("#performance-timeline-chart")).toHaveAttribute("aria-label", /trenažno opterećenje/);
  await page.locator("#performance-timeline").getByRole("button", { name: "Kilometraža", exact: true }).click();
  await expect(page.locator("#performance-timeline-chart")).toHaveAttribute("aria-label", /tjedna kilometraža/);
  await page.locator("#performance-timeline").getByRole("button", { name: "Tempo", exact: true }).click();
  await expect(page.locator("#performance-timeline-chart")).toHaveAttribute("aria-label", /prosječni tempo/);
  await page.locator("#performance-timeline").getByRole("button", { name: "Opterećenje", exact: true }).click();
  await expect(page.locator("#performance-timeline-chart canvas")).toBeVisible();
  await showView(page, "Laboratorij");
  await openDisclosure(page, "advanced-analytics-disclosure");
  await expect(page.locator("#hr-zone-comparison-chart canvas")).toBeVisible();
  await expect(page.locator("#hr-zone-comparison-coverage")).toContainText("9/12 · 8/11");
  await expect(page.locator("#hr-zone-comparison-note")).toContainText("dostupnim Garminovim zonama");
  await page.locator("#sleep-recovery").getByRole("tab", { name: "Oporavak" }).click();
  await expect(page.locator("#recovery-rhr-chart canvas")).toBeVisible();
  await expect(page.locator("#recovery-chart")).toContainText("Crta · medijan prethodnih 28 dana");
  await page.locator("#sleep-recovery").getByRole("tab", { name: "Stres" }).click();
  await expect(page.locator("#stress-trend-chart canvas")).toBeVisible();
  await expect(page.locator("#sleep-chart").locator("xpath=preceding-sibling::div[1]")).toContainText("Crta · medijan prethodnih 28 dana");
  await expect(page.locator("#journal-status")).toContainText("nema unosa");
  expect(browserErrors).toEqual([]);
});

test("refreshes the selected date and labels Runna data as current", async ({ page }) => {
  const { dashboardDates } = await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator("#schedule-context")).toHaveText("Runna · aktualni raspored");

  await page.locator("#date").fill("2026-10-30");
  await expect(page.locator("#activity-calories-context")).toContainText("1.980 kcal u mirovanju = 2.600 kcal ukupno");
  await expect(page.locator("#calories-label")).toHaveText("Aktivne / ukupno kcal");
  await expect(page.locator("#schedule-context")).toHaveText("Runna · aktualni raspored, nije povijesna snimka");
  expect(dashboardDates).toContain("2026-10-30");
});

test("opens a chart data table with event context and exports the visible range to CSV", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  const inspector = page.locator('details.chart-data-inspector[data-chart-inspector-for="sleep-chart"]');
  await expect(inspector.locator("summary")).toHaveText("San · 2 zapisa");
  await inspector.locator("summary").click();
  await expect(inspector.locator("tbody tr")).toHaveCount(2);
  await expect(inspector.locator("tbody tr").filter({ hasText: "2026-10-30" })).toContainText("Kasna sauna");

  const downloadPromise = page.waitForEvent("download");
  await inspector.getByRole("button", { name: "Preuzmi CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sleep-chart.csv");
});

test("shows hover details only on the chart under the pointer", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  await page.locator("#sleep-recovery").getByRole("tab", { name: "Oporavak" }).click();

  const visibleTips = page.locator(".dashboard-chart-tooltip:visible");
  for (const id of ["recovery-hrv-chart", "recovery-rhr-chart"]) {
    const chart = page.locator(`#${id}`);
    await chart.locator("canvas").first().hover({ position: { x: 90, y: 65 } });
    await expect(chart.locator(".dashboard-chart-tooltip")).toBeVisible();
    await expect(visibleTips).toHaveCount(1);
  }
  await page.mouse.move(0, 0);
  await expect(visibleTips).toHaveCount(0);
});

test("navigates chart dates with the keyboard and opens the selected day", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");

  const chart = page.locator("#sleep-chart");
  await expect(chart).toHaveAttribute("tabindex", "0");
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart).toHaveAttribute("aria-label", /Odabrano:.*30\. listopada 2026/);
  await page.keyboard.press("Enter");
  await expect(page.locator("#date")).toHaveValue("2026-10-30");
});

test("compares the morning after tagged events with days that have no event log", async ({ page }) => {
  await mockDashboardApi(page, { eventPatternFixture: true });
  await page.goto("/");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "journal-sources-disclosure");

  const patterns = page.locator("#life-event-pattern-results");
  await expect(patterns).toContainText("Sauna");
  await expect(patterns).toContainText("3 označena dana");
  await expect(patterns).toContainText("7 h 00 min · 6 h 30 min bez zapisa");
  await expect(patterns).toContainText("+30 min");
  await expect(patterns).toContainText("70 ms · 60 ms bez zapisa");
  await expect(page.locator(".life-event-patterns .panel-sub")).toContainText("ne dokazuje uzrok");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(patterns.locator(".life-event-pattern-card")).toBeVisible();
});

test("shows a covered 28-day personal report against the preceding 28 days", async ({ page }) => {
  await mockDashboardApi(page, { eventPatternFixture: true });
  await page.goto("/");
  await showView(page, "Trening & Load");

  const report = page.locator("#monthly-review-grid");
  await expect(page.locator("#monthly-review-range")).toContainText("Prethodno");
  await expect(page.locator("#monthly-review-range")).toContainText("zadnje");
  await expect(report).toContainText("6 h 33 min");
  await expect(report).toContainText("6 h 30 min");
  await expect(report).toContainText("28/28 dana");
  const cyclingCard = report.locator('[data-sport="cycling"]');
  await expect(cyclingCard).toContainText("Biciklizam");
  await expect(cyclingCard).toContainText("35 km");
  await expect(cyclingCard).toContainText("18 km");
  const saunaCard = report.locator('[data-sport="sauna"]');
  await expect(saunaCard).toContainText("Sauna");
  await expect(saunaCard).toContainText("2 aktivnosti");
  await expect(saunaCard).not.toContainText("km");
  await expect(report.locator('[data-sport="running"]')).toContainText("18,6 km");
  await expect(page.locator("#monthly-review-highlights")).toContainText("opis povijesti");
});

test("shows Garmin VO₂ max with its sparse ninety-day history", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Trening & Load");
  await openDisclosure(page, "performance-trends-disclosure");

  await expect(page.locator("#garmin-training-status")).toHaveText("Produktivan");
  await expect(page.locator("#garmin-vo2max-value")).toHaveText("59,6");
  await expect(page.locator("#garmin-vo2max-change")).toHaveText("+3,8");
  await expect(page.locator("#garmin-vo2max-coverage")).toHaveText("3/90");
  await expect(page.locator("#garmin-vo2max-chart canvas")).toBeVisible();
  await expect(page.locator("#garmin-vo2max-chart")).toHaveAttribute("role", "img");
  await expect(page.locator("#garmin-vo2max-note")).toContainText("dani bez podatka nemaju vlastitu procjenu");
});

test("correlates two metrics only on shared dates and exposes the paired records", async ({ page }) => {
  await mockDashboardApi(page, { eventPatternFixture: true });
  await page.goto("/");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "advanced-analytics-disclosure");

  await expect(page.locator("#correlation-x")).toHaveValue("sleepHours");
  await expect(page.locator("#correlation-y")).toHaveValue("hrv");
  await expect(page.locator("#correlation-pair-count")).toHaveText("56");
  await page.locator("#correlation-x").selectOption("sleepHours");
  await page.locator("#correlation-y").selectOption("hrv");
  await expect(page.locator("#correlation-chart canvas")).toBeVisible();
  await expect(page.locator("#correlation-pair-count")).toHaveText("56");
  await expect(page.locator("#correlation-coefficient")).toHaveText(/^\+1/);
  await expect(page.locator("#correlation-note")).toContainText("opisna");
  const inspector = page.locator('details.chart-data-inspector[data-chart-inspector-for="correlation-chart"]');
  await expect(inspector.locator("summary")).toContainText("56 zapisa");
  await inspector.locator("summary").click();
  await expect(inspector.locator("tbody tr")).toHaveCount(56);
  await page.locator("#correlation-y").selectOption("restingHeartRate");
  await expect(page.locator("#correlation-chart canvas")).toBeVisible();
  await expect(page.locator("#correlation-pair-count")).toHaveText("56");
  await page.locator("#correlation-lab").screenshot({ path: "tmp/phase-4-correlation-desktop.png" });
});

test("selects an ECG reading and loads that reading's own signal", async ({ page }) => {
  const { ecgDetailRequests } = await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "measurements-disclosure");

  const readings = page.locator("#ecg-readings .ecg-reading-row");
  await expect(readings).toHaveCount(2);
  await expect(readings.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ecg-heart-rate")).toHaveText("58 bpm");

  await readings.nth(1).click();
  await expect(page.locator("#ecg-rhythm")).toHaveText("Neodređen zapis");
  await expect(page.locator("#ecg-date")).toContainText("10. 10.");
  await expect(page.locator("#ecg-heart-rate")).toHaveText("60 bpm");
  await expect(page.locator("#ecg-hrv")).toHaveText("190 ms");
  await expect(readings.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(readings.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ecg-waveform-chart canvas")).toBeVisible();
  expect(ecgDetailRequests).toEqual(["ecg-0"]);
});

test("saves the subjective check-in through the JSON API", async ({ page }) => {
  const { journalWrites } = await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "journal-sources-disclosure");
  await page.locator("#journal-rpe").fill("6");
  await page.locator("#journal-fatigue").fill("4");
  await page.locator("#journal-soreness").fill("3");
  await page.locator("#journal-mood").selectOption("4");
  await page.locator("#journal-notes").fill("Smoke test only");
  await page.locator("#journal-save").click();

  await expect(page.locator("#journal-status")).toContainText("Spremljeno lokalno");
  expect(journalWrites).toHaveLength(1);
  expect(journalWrites[0]).toMatchObject({
    date: await page.locator("#date").inputValue(),
    rpe: 6,
    fatigue: 4,
    soreness: 3,
    mood: 4,
    notes: "Smoke test only",
  });
});

test("keeps sleep and HRV explanations readable across viewport sizes", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  for (const width of [390, 836, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const context = page.locator("#today-sleep-context");
    await expect(context).toBeVisible();
    const size = await context.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
    await expect(page.locator(".hero")).not.toContainText("read-only");
    await expectActiveViewCentered(page);
  }
});

test("keeps the mobile layout within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Pregled" })).toHaveAttribute("aria-selected", "true");
  await expectActiveViewCentered(page);
  await page.screenshot({ path: "tmp/phase-2-overview-mobile.png", fullPage: true });
  await showView(page, "Trening & Load");
  await expectActiveViewCentered(page);
  await expect(page.locator("#performance-trends")).toBeHidden();
  await expect(page.locator("#training-patterns")).toBeVisible();
  await openDisclosure(page, "gear-activity-disclosure");
  await openDisclosure(page, "performance-trends-disclosure");
  await page.locator('.activity-select[data-activity-id="1001"]').click();
  await expect(page.locator("#activity-hr-chart canvas")).toBeVisible();
  await page.locator("#performance-timeline").screenshot({ path: "tmp/phase-3-timeline-card.png" });
  await page.locator("#activity-visualization").screenshot({ path: "tmp/phase-3-activity-trace-card.png" });
  await page.screenshot({ path: "tmp/phase-3-performance-mobile.png", fullPage: true });
  await showView(page, "Laboratorij");
  await expectActiveViewCentered(page);
  await openDisclosure(page, "advanced-analytics-disclosure");
  await openDisclosure(page, "journal-sources-disclosure");
  await expect(page.locator("#journal-form")).toBeVisible();
  await page.locator("#correlation-lab").screenshot({ path: "tmp/phase-4-correlation-mobile.png" });
  await page.locator("#lab-deep-dive").screenshot({ path: "tmp/phase-4-lab-tables-mobile.png" });

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("quick navigation jumps to a section without covering its heading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Trening & Load");
  await page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Oprema" }).click();
  const gearLink = page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Oprema" });
  await expect(gearLink).toHaveAttribute("aria-current", "location");
  await expect(page).toHaveURL(/#gear-overview$/);
  await expect.poll(() => page.locator("#gear-overview").evaluate((section) => section.getBoundingClientRect().top)).toBeGreaterThanOrEqual(105);
  await expect.poll(() => page.locator("#gear-overview").evaluate((section) => section.getBoundingClientRect().top)).toBeLessThan(150);
});

test("shows daily activity from quick navigation and opens remaining metrics by direct URL", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await page.locator('.quick-nav-links a[href="#activity-goals"]').click();
  await expect(page).toHaveURL(/#activity-goals$/);
  await expect(page.locator("#activity-goals .layout-3")).toBeVisible();
  await page.goto("/#daily-summary");
  await expect(page.getByRole("tab", { name: "Pregled" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#daily-summary > details")).toHaveAttribute("open", "");
  await expect(page.locator("#overview .snapshot-card").first()).toBeVisible();
});

test("keeps main dashboard tabs synchronized with browser history", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Trening & Load" }).click();
  await expect(page).toHaveURL(/#view-performance$/);
  await page.getByRole("tab", { name: "Laboratorij" }).click();
  await expect(page).toHaveURL(/#view-lab$/);

  await page.goBack();
  await expect(page.getByRole("tab", { name: "Trening & Load" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/#view-performance$/);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Pregled" })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "Trening & Load" })).toHaveAttribute("aria-selected", "true");
});

test("switches the sleep and recovery subtabs accessibly and resizes their charts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  await expectActiveViewCentered(page);

  const tabs = page.locator("#sleep-recovery [role=tablist]");
  const sleep = tabs.getByRole("tab", { name: "San" });
  const recovery = tabs.getByRole("tab", { name: "Oporavak" });
  const stress = tabs.getByRole("tab", { name: "Stres" });
  const baseline = tabs.getByRole("tab", { name: "Osobna baza" });
  await expect(sleep).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#sleep-chart canvas")).toBeVisible();
  await expect(page.locator("#body-battery-day-chart canvas")).toBeHidden();

  await sleep.focus();
  await page.keyboard.press("ArrowRight");
  await expect(recovery).toHaveAttribute("aria-selected", "true");
  await expectActiveViewCentered(page);
  await expect(page.locator("#body-battery-day-chart canvas")).toBeVisible();
  await expect(page.locator("#recovery-chart canvas").first()).toBeVisible();
  await stress.click();
  await expect(page.locator("#stress-trend-chart canvas")).toBeVisible();
  await expectActiveViewCentered(page);
  await baseline.click();
  await expect(baseline).toHaveAttribute("aria-selected", "true");
  await expectActiveViewCentered(page);
  await expect(page.locator("#baseline-hrv")).toBeVisible();
});

test("opens and positions a direct link to a collapsed section on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboardApi(page);
  await page.goto("/#gear-overview");

  await expect(page.getByRole("tab", { name: "Trening & Load" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#gear-activity-disclosure")).toHaveAttribute("open", "");
  await expect(page.locator('.quick-nav-links a[href="#gear-overview"]')).toHaveAttribute("aria-current", "location");
  const targetTop = await page.locator("#gear-overview").evaluate((section) => section.getBoundingClientRect().top);
  expect(targetTop).toBeGreaterThanOrEqual(105);
  expect(targetTop).toBeLessThan(844);
});

test("switches dashboard views accessibly and resizes charts when a view opens", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");

  const overviewTab = page.getByRole("tab", { name: "Pregled" });
  const performanceTab = page.getByRole("tab", { name: "Trening & Load" });
  const labTab = page.getByRole("tab", { name: "Laboratorij" });
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#sleep-recovery")).toBeHidden();

  await overviewTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(performanceTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#training-load")).toBeVisible();
  await expect(page.locator("#performance-trends-disclosure")).not.toHaveAttribute("open", "");
  await expect(page.locator("#performance-timeline-chart canvas")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Trendovi" })).toBeVisible();
  await page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Trendovi" }).click();
  await expect(page.locator("#performance-trends-disclosure")).toHaveAttribute("open", "");
  await expect(page.locator("#performance-timeline-chart canvas")).toBeVisible();

  await performanceTab.focus();
  await page.keyboard.press("End");
  await expect(labTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#sleep-recovery")).toBeVisible();
  await expect(page.locator("#measurements-disclosure")).not.toHaveAttribute("open", "");
  await expect(page.locator("#advanced-analytics-disclosure")).not.toHaveAttribute("open", "");
  await expect(page.locator("#journal-sources-disclosure")).not.toHaveAttribute("open", "");
  await page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Mjerenja" }).click();
  await expect(page.locator("#measurements-disclosure")).toHaveAttribute("open", "");
  await expect(page.locator("#garmin-measurements")).toBeVisible();
  await page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Usporedbe" }).click();
  await expect(page.locator("#advanced-analytics-disclosure")).toHaveAttribute("open", "");
  await expect(page.locator("#lab-deep-dive")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Brza navigacija po dashboardu" }).getByRole("link", { name: "Mjerenja" })).toBeVisible();

  await overviewTab.click();
  await page.locator("#health-overview .health-deep-summary").click();
  await page.locator('#health-pillars a.health-pillar.recovery[href="#sleep-recovery"]').click();
  await expect(labTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/#sleep-recovery$/);
});

test("respects reduced-motion preferences for view animations and scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as Window & { dashboardScrollBehaviors?: string[] }).dashboardScrollBehaviors = calls;
    const original = window.scrollTo.bind(window);
    window.scrollTo = ((options: ScrollToOptions | number, y?: number) => {
      calls.push(typeof options === "object" && options.behavior ? options.behavior : "auto");
      if (typeof options === "number") original(options, y ?? 0);
      else original(options);
    }) as typeof window.scrollTo;
  });
  await mockDashboardApi(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Trening & Load" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { dashboardScrollBehaviors?: string[] }).dashboardScrollBehaviors?.at(-1))).toBe("auto");
  await expect.poll(() => page.locator("#dashboard-view-performance").evaluate((view) => getComputedStyle(view).animationName)).toBe("none");
});

test("serves an installable PWA manifest and correctly sized icons", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "512x512"]);

  for (const size of [192, 512]) {
    const iconResponse = await request.get(`/icons/icon-${size}.png`);
    expect(iconResponse.ok()).toBeTruthy();
    const png = await iconResponse.body();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }

  const workerResponse = await request.get("/service-worker.js");
  expect(workerResponse.ok()).toBeTruthy();
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
  expect((await request.get("/.env")).status()).toBe(404);
});

test("FastAPI exposes a documented contract and rejects invalid journal data before storage", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ ok: expect.any(Boolean), baseUrlConfigured: expect.any(Boolean) });

  const openapi = await request.get("/api/openapi.json");
  expect(openapi.ok()).toBeTruthy();
  const schema = await openapi.json();
  expect(schema.paths["/api/dashboard"]).toBeDefined();
  expect(schema.paths["/api/skin-temperature"]).toBeDefined();
  expect(schema.paths["/api/garmin-profile"]).toBeDefined();
  expect(schema.paths["/api/ecg/{ecg_id}"]).toBeDefined();
  expect(schema.paths["/api/journal"].post).toBeDefined();
  expect(schema.paths["/api/journal/events"].post).toBeDefined();
  expect(schema.paths["/api/activities/{activity_id}/rpe"].post).toBeDefined();

  const invalidDate = await request.get("/api/dashboard?date=not-a-date");
  expect(invalidDate.status()).toBe(400);
  expect(await invalidDate.json()).toMatchObject({ ok: false, error: "Datum mora biti u formatu YYYY-MM-DD" });

  const invalidEcgId = await request.get("/api/ecg/invalid.id");
  expect(invalidEcgId.status()).toBe(400);

  const invalidJournal = await request.post("/api/journal", {
    data: { date: "2026-10-31", rpe: 11, fatigue: null, soreness: null, mood: null, notes: "" },
  });
  expect(invalidJournal.status()).toBe(422);
  expect(await invalidJournal.json()).toMatchObject({ ok: false, error: "Podaci zahtjeva nisu valjani." });

  const invalidEvent = await request.post("/api/journal/events", {
    data: { date: "2026-10-31", time: "25:00", category: "sauna", impact: 3, note: "" },
  });
  expect(invalidEvent.status()).toBe(422);
});

test("keeps the app shell available offline without caching Garmin or journal data", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator("#today-energy")).toHaveText("70");
  const workerRegistration = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { supported: false };
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      supported: true,
      secure: window.isSecureContext,
      hasRegistration: Boolean(registration),
      state: registration?.installing?.state || registration?.waiting?.state || registration?.active?.state || null,
    };
  });
  expect(workerRegistration).toMatchObject({ supported: true, secure: true, hasRegistration: true });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 5000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const apiCacheEntries = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const entries = await Promise.all(cacheNames.map(async (name) => {
      const cache = await caches.open(name);
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    }));
    return entries.flat().filter((pathname) => pathname.startsWith("/api/"));
  });
  expect(apiCacheEntries).toEqual([]);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('#connectivity-root [role="status"]')).toBeVisible();
  await expect(page.locator("#api-status")).toHaveText("Izvan mreže");
  await expect(page).toHaveTitle("Garmin Performance Studio");

  const offlineCacheEntries = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)));
    return entries.flat().filter((pathname) => pathname.startsWith("/api/"));
  });
  expect(offlineCacheEntries).toEqual([]);
  await page.context().setOffline(false);
});


test("distinguishes missing Runna history from future workouts awaiting execution", async ({ page }) => {
  const { dashboardDates } = await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Trening & Load");
  await page.locator("#date").fill("2026-11-01");
  await expect.poll(() => dashboardDates).toContain("2026-11-01");

  await expect(page.locator("#plan-archive-note")).toContainText("12/30 dana");
  await expect(page.locator("#planned30-count")).toHaveText("Nedostupno");
  await expect(page.locator("#matched30-count")).toHaveText("Nedostupno");
  await expect(page.locator("#plan30-coverage-note")).toContainText("Runna arhiva pokriva 12/30 dana");

  const rows = page.locator("#plan-actual-weeks tr");
  const historical = rows.filter({ hasText: "pon, 12. 10." });
  await expect(historical.locator("td").nth(1)).toHaveText("Nije u arhivi");
  await expect(historical.locator("td").nth(3)).toContainText("Nije usporedivo");

  const future = rows.filter({ hasText: "pon, 02. 11." });
  await expect(future.locator("td").nth(3)).toHaveText("Nadolazi · 7 planirano");
  await expect(future.locator("td").nth(4)).toHaveText("Još nije dospjelo");
  await expect(future.locator("td").nth(3)).not.toContainText("0/7");
});

test("explains recorded heart-rate coverage in the 28-day running comparison", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "advanced-analytics-disclosure");

  const row = page.locator("#performance-dynamics tr").filter({ hasText: "Prosječni puls" });
  await expect(row.locator("td").nth(1)).toContainText("149 bpm");
  await expect(row.locator("td").nth(2)).toContainText("Nema zapisa pulsa · 0/11 trčanja");
  await expect(page.locator("#performance-current-range-count")).toContainText("12");
  await expect(page.locator("#performance-previous-range-count")).toContainText("11");
  await expect(page.locator("#performance-dynamics-note")).toContainText("ponderiran trajanjem");
});

test("selects each recent activity and shows type-appropriate details", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Trening & Load");
  await openDisclosure(page, "gear-activity-disclosure");

  const activities = page.locator("#activity-list .activity-select");
  await expect(activities).toHaveCount(12);
  await expect(page.locator("#activity-name")).toHaveText("Sauna");
  await expect(page.locator("#activity-grid")).toContainText("126 bpm");
  await expect(page.locator("#activity-grid")).toContainText("149 bpm");
  await expect(page.locator("#activity-hr-chart canvas")).toBeVisible();
  await expect(page.locator("#activity-grid")).not.toContainText(/tempo|kadenca|udaljenost|vertical/i);

  await page.locator('.activity-select[data-activity-id="1001"]').click();
  await expect(page.locator("#activity-name")).toHaveText("Easy run");
  await expect(page.locator("#activity-grid")).toContainText("Prosječni tempo");
  await expect(page.locator('.activity-select[data-activity-id="1001"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#activity-hr-chart canvas")).toBeVisible();
  await expect(page.locator("#activity-trace-metrics").getByRole("button", { name: "Tempo", exact: true })).toBeVisible();
  await expect(page.locator("#activity-trace-metrics").getByRole("button", { name: "Snaga", exact: true })).toBeVisible();
  await page.locator("#activity-trace-metrics").getByRole("button", { name: "Snaga", exact: true }).click();
  await expect(page.locator("#activity-chart-title")).toHaveText("Snaga tijekom aktivnosti");
  await expect(page.locator("#activity-chart-unit")).toHaveText("W");
  await expect(page.locator("#activity-gear-items")).toContainText("Daily trainer");
  await expect(page.locator("#activity-gear-items")).toContainText("615,2 km ukupno");
});

test("opens calendar activity details and scrolls to the selected activity on desktop and mobile", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Trening & Load");
  await page.locator('.calendar-day[data-date="2026-10-28"]').click();
  await page.locator('.calendar-run-item[data-calendar-activity-id="2001"]').getByText("Detalji").click();
  await expect(page.locator("#activity-name")).toHaveText("Calendar-linked run");
  await expect.poll(() => page.locator("#activity-details").evaluate((section) => section.getBoundingClientRect().top)).toBeLessThan(150);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#training-calendar").scrollIntoViewIfNeeded();
  await page.locator('.calendar-day[data-date="2026-10-28"]').click();
  await page.locator('.calendar-run-item[data-calendar-activity-id="2001"]').getByText("Detalji").click();
  await expect.poll(() => page.locator("#activity-details").evaluate((section) => section.getBoundingClientRect().top)).toBeLessThan(150);
});

test("saves contextual life events and an RPE assessment for the selected activity", async ({ page }) => {
  const { lifeEventWrites, activityRpeWrites } = await mockDashboardApi(page);
  await page.goto("/");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "journal-sources-disclosure");

  await page.locator("#life-event-time").fill("19:45");
  await page.locator("#life-event-category").selectOption("sauna");
  await page.locator("#life-event-impact").selectOption("4");
  await page.locator("#life-event-note").fill("Kasna sauna");
  await page.locator("#life-event-save").click();
  await expect(page.locator("#life-event-list")).toContainText("Sauna · 19:45");
  expect(lifeEventWrites).toHaveLength(1);
  expect(lifeEventWrites[0]).toMatchObject({ category: "sauna", time: "19:45", impact: 4, note: "Kasna sauna" });
  await page.locator("#life-event-list .life-event-delete").click();
  await expect(page.locator("#life-event-list")).toContainText("Nema zabilježenih događaja");

  await showView(page, "Trening & Load");
  await openDisclosure(page, "gear-activity-disclosure");
  await page.locator("#activity-rpe").fill("6");
  await page.locator("#activity-rpe-note").fill("Kontroliran napor");
  await page.locator("#activity-rpe-save").click();
  await expect(page.locator("#activity-rpe-status")).toContainText("Spremljeno");
  expect(activityRpeWrites).toHaveLength(1);
  expect(activityRpeWrites[0]).toMatchObject({ activityId: "1000", payload: { rpe: 6, note: "Kontroliran napor" } });
});

test("distinguishes an unavailable activity source from a genuine zero", async ({ page }) => {
  await mockDashboardApi(page, { activitySourceMode: "failed" });
  await page.goto("/");

  await expect(page.locator("#api-status")).toContainText("Garmin povezan");
  await expect(page.locator("#source-warning")).toHaveText("Povijest aktivnosti nije dostupna");
  await showView(page, "Trening & Load");
  await expect(page.locator("#load-7")).toHaveText("—");
  await expect(page.locator("#weekly-run-summary")).toHaveText("Povijest nije dostupna");
  await expect(page.locator("#weekly-volume-distance")).toHaveText("—");
  await openDisclosure(page, "gear-activity-disclosure");
  await expect(page.locator("#activity-list .activity-select")).toHaveCount(0);
  await expect(page.locator("#activity-list")).toContainText("nije dostupna");
  await openDisclosure(page, "weekly-plan-disclosure");
  await expect(page.locator("#matched30-count")).toHaveText("Nedostupno");
  await expect(page.locator("#actual30-distance")).toHaveText("Nedostupno");

  await showView(page, "Laboratorij");
  await openDisclosure(page, "advanced-analytics-disclosure");
  await expect(page.locator('#monthly-review-grid [data-sport="running"]')).toHaveCount(0);
  await expect(page.locator("#monthly-review-grid")).toContainText("Nedostupno");
});

test("labels activity-derived metrics as partial when Garmin history is incomplete", async ({ page }) => {
  await mockDashboardApi(page, { activitySourceMode: "partial" });
  await page.goto("/");
  await expect(page.locator("#source-warning")).toHaveText("Povijest aktivnosti je djelomična");
  await showView(page, "Trening & Load");
  await expect(page.locator("#weekly-run-summary")).toContainText("Najmanje");
  await expect(page.locator("#run-trend-note")).toContainText("djelomična");
  await openDisclosure(page, "gear-activity-disclosure");
  await expect(page.locator("#activity-list")).toContainText("povijest je djelomična");
  await showView(page, "Laboratorij");
  await openDisclosure(page, "advanced-analytics-disclosure");
  await expect(page.locator('#monthly-review-grid [data-sport="running"]')).toContainText("djelomična povijest");
});

test("keeps recorded zero hydration and activity values distinct from missing data", async ({ page }) => {
  await mockDashboardApi(page, { activitySourceMode: "empty", hydrationMode: "zero" });
  await page.goto("/");
  await expect(page.locator("#hydration")).toHaveText("0 ml / —");
  await expect(page.locator("#load-7")).toHaveText("0");
  await showView(page, "Trening & Load");
  await expect(page.locator("#weekly-run-summary")).toHaveText("0 trčanja");
  await openDisclosure(page, "gear-activity-disclosure");
  await expect(page.locator("#activity-list")).toContainText("Nema zabilježenih aktivnosti");
});

test("shows unavailable hydration instead of an unrecorded or zero value", async ({ page }) => {
  await mockDashboardApi(page, { hydrationMode: "unavailable" });
  await page.goto("/");
  await expect(page.locator("#hydration")).toHaveText("Nije dostupno / —");
});

test("uploads, reviews, saves and deletes a blood report with explicit AI consent", async ({ page }) => {
  const { bloodLabWrites, bloodLabUploads, bloodLabReports } = await mockDashboardApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#blood-labs");
  await expect(page.getByRole("tab", { name: "Laboratorij" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#blood-lab-status")).toContainText("PDF se šalje samo nakon tvoje potvrde");
  await expectActiveViewCentered(page);

  await page.locator("#blood-lab-file").setInputFiles({ name: "krvna-slika.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 synthetic test document") });
  await expect(page.locator("#blood-lab-analyze")).toBeDisabled();
  await page.locator("#blood-lab-consent").check();
  await expect(page.locator("#blood-lab-analyze")).toBeEnabled();
  await page.locator("#blood-lab-analyze").click();

  await expect(page.locator("#blood-lab-review")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Naziv analize 1" })).toHaveValue("Hemoglobin");
  await expect(page.locator("#blood-lab-review")).toContainText("traži provjeru");
  await page.locator('#blood-lab-review [data-blood-field="valueText"]').fill("143");
  await page.locator("#blood-lab-save").click();

  await expect(page.locator("#blood-lab-review")).toBeHidden();
  await expect(page.locator("#blood-lab-history")).toContainText("Primjer laboratorija");
  expect(bloodLabUploads).toHaveLength(1);
  expect(bloodLabUploads[0].consent).toBe("true");
  expect(bloodLabUploads[0].byteLength).toBeGreaterThan(0);
  expect(bloodLabUploads[0].fileCount).toBe(1);
  expect(bloodLabUploads[0].namesExposed).toBe(false);
  expect(bloodLabWrites[0].results).toMatchObject([{ testName: "Hemoglobin", valueText: "143", numericValue: 143 }]);
  expect(bloodLabReports).toHaveLength(1);

  await page.locator(".blood-report > summary").click();
  await page.locator("[data-delete-blood-report]").click();
  await expect(page.locator("#blood-lab-history")).toContainText("Još nema spremljenih nalaza");
  expect(bloodLabReports).toHaveLength(0);
});

test("combines multiple PDF reports while preserving each measurement's source and date", async ({ page }) => {
  const { bloodLabWrites, bloodLabUploads } = await mockDashboardApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#blood-labs");
  const file = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.7 synthetic ${name}`) });
  await page.locator("#blood-lab-file").setInputFiles([file("nalaz-prvi.pdf"), file("nalaz-drugi.pdf")]);
  await expect(page.locator(".blood-lab-file-row")).toHaveCount(2);
  await page.locator("#blood-lab-consent").check();
  await page.locator("#blood-lab-file").setInputFiles(file("nalaz-treci.pdf"));
  await expect(page.locator(".blood-lab-file-row")).toHaveCount(3);
  await expect(page.locator("#blood-lab-consent")).not.toBeChecked();
  await page.getByRole("button", { name: "Ukloni nalaz 3" }).click();
  await expect(page.locator(".blood-lab-file-row")).toHaveCount(2);
  await page.locator("#blood-lab-consent").check();
  await page.locator("#blood-lab-analyze").click();
  await expect(page.locator("#blood-lab-review")).toContainText("Zajednička analiza");
  await expect(page.locator("#blood-lab-review .blood-result")).toHaveCount(2);
  await expect(page.locator("#blood-lab-review .blood-result-source").nth(0)).toContainText("Nalaz 1");
  await expect(page.locator("#blood-lab-review .blood-result-source").nth(1)).toContainText("Nalaz 2");
  await expect(page.locator("#blood-lab-review .blood-result-source").nth(1)).toContainText("Drugi laboratorij");
  await expect(page.locator('#blood-lab-review [data-blood-field="referenceRange"]')).toHaveCount(2);
  await expectActiveViewCentered(page);
  await page.locator("#blood-lab-save").click();
  await expect(page.locator("#blood-lab-history")).toContainText("Zajednička analiza · 2 PDF");
  expect(bloodLabUploads).toHaveLength(1);
  expect(bloodLabUploads[0]).toMatchObject({ fileCount: 2, namesExposed: false, filename: "", consent: "true" });
  expect(bloodLabWrites[0].results).toMatchObject([
    { testName: "Hemoglobin", valueText: "142", sourceDocument: 1, reportDate: "2026-11-02" },
    { testName: "Hemoglobin", valueText: "140", sourceDocument: 2, reportDate: "2026-11-03" },
  ]);
  await expect(page.locator(".blood-lab-file-row")).toHaveCount(0);
  await expect(page.locator("#blood-lab-analyze")).toBeDisabled();
});

test("rejects too many PDF files without sending them for analysis", async ({ page }) => {
  const { bloodLabUploads } = await mockDashboardApi(page);
  await page.goto("/#blood-labs");
  await page.locator("#blood-lab-file").setInputFiles(Array.from({ length: 11 }, (_, index) => ({ name: `nalaz-${index}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 test") })));
  await expect(page.locator("#blood-lab-status")).toContainText("najviše 10");
  await expect(page.locator(".blood-lab-file-row")).toHaveCount(0);
  await expect(page.locator("#blood-lab-analyze")).toBeDisabled();
  expect(bloodLabUploads).toHaveLength(0);
});
