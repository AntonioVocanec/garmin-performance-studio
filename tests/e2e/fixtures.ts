function zagrebToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

export function dashboardPayload(date: string) {
  const prior = "2026-10-30";
  const target = new Date(`${date}T12:00:00Z`);
  const shiftDate = (offset: number) => {
    const shifted = new Date(target);
    shifted.setUTCDate(shifted.getUTCDate() + offset);
    return shifted.toISOString().slice(0, 10);
  };
  const weekStart = new Date(target);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1);
  const calendarStart = new Date(weekStart);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - 84);
  const dailyRunCalendar = Array.from({ length: 91 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setUTCDate(day.getUTCDate() + index);
    const isoDate = day.toISOString().slice(0, 10);
    const isFuture = isoDate > date;
    const ran = ["2026-10-25", "2026-10-28", "2026-10-31"].includes(isoDate);
    return {
      date: isoDate,
      distanceKm: isFuture ? null : ran ? 6.2 : 0,
      count: isFuture ? null : ran ? 1 : 0,
      sessions: isoDate === "2026-10-28" ? [{ id: "2001", name: "Calendar-linked run", type: "running", isRun: true, distanceMeters: 5_000, durationSeconds: 1_800, paceSecondsPerKm: 360 }] : [],
    };
  });
  return {
    ok: true,
    date,
    generatedAt: `${date}T07:00:00+02:00`,
    range: { start: "2026-09-06", end: date, activityStart: "2025-11-01" },
    sources: {
      activities: { ok: true, partial: false, count: 24 },
      hydration: { ok: true, partial: false, count: 0 },
      runnaCalendar: { ok: true, configured: true, count: 3 },
      runnaArchive: { ok: true, configured: true, count: 12 },
    },
    normalized: {
      sleep: {
        date,
        score: 82,
        totalSeconds: 23_400,
        sleepTargetMinutes: 480,
        deepSeconds: 4_000,
        remSeconds: 5_200,
        lightSeconds: 14_200,
        awakeSeconds: 1_000,
        history: [
          { date: prior, totalSeconds: 25_200, score: 80 },
          { date, totalSeconds: 23_400, score: 82 },
        ],
      },
      sleepDebt: {
        daysAvailable: 14,
        daysExpected: 14,
        debtSeconds: 5_400,
        average7dSeconds: 25_200,
        average7dScore: 81,
        bedtimeCircularSdMinutes7d: 24,
        sleepRegularity14d: {
          bedtimeSdMinutes: 18,
          wakeTimeSdMinutes: 22,
          bedtimeDays: 13,
          wakeTimeDays: 14,
          daysExpected: 14,
        },
        history: [
          { date: prior, debtAfterSeconds: 7_200 },
          { date, debtAfterSeconds: 5_400 },
        ],
      },
      activity: {
        id: "activity-fixture",
        name: "Easy run",
        type: "running",
        date,
        distanceMeters: 5_000,
        durationSeconds: 1_800,
        paceSecondsPerKm: 360,
        avgHeartRate: 140,
        trainingLoad: 45,
      },
      activities: Array.from({ length: 12 }, (_, index) => ({
        id: String(1000 + index),
        name: index === 0 ? "Sauna" : index === 1 ? "Easy run" : index === 2 ? "Indoor Cycling" : "Run " + (index + 1),
        type: index === 0 ? "indoor_cardio" : index === 2 ? "indoor_cycling" : "running",
        date,
        isSauna: index === 0,
        isRun: index !== 0 && index !== 2,
        distanceMeters: index === 0 || index === 2 ? null : 5_000,
        durationSeconds: index === 0 ? 2_300 : 1_800,
        paceSecondsPerKm: index === 0 || index === 2 ? null : 360,
        avgHeartRate: null,
        trainingLoad: index === 0 ? 8 : 45,
      })),
      activityDetail: { splits: [], workouts: [] },
      weeklyContext: {
        start: "2026-10-25", end: date, activityCount: 4,
        rpe: { average: 6, recordedCount: 2, coverageCount: 4, records: [] },
        lifeEvents: [
          { id: "event-1", date: "2026-10-30", time: "19:45", category: "sauna", impact: 4, note: "Kasna sauna" },
          { id: "event-2", date: "2026-10-28", time: null, category: "stress", impact: 2, note: "" },
        ],
      },
      training: {
        runCount7d: 3,
        runDistance7dKm: 18.6,
        runDistancePrevious7dKm: 16,
        runDistanceChangePct: 16.25,
        runDuration7dSeconds: 6_900,
        runAveragePaceSecondsPerKm: 371,
        trainingLoad7d: 165,
        trainingLoadPrevious21dWeeklyAverage: 130,
        acuteChronicRatio: 1.27,
        trainingLoadPrevious28dWeeklyAverage: 110,
        trainingLoadVsPrevious28dRatio: 1.5,
        allActivityLoad7d: 180,
        allActivityLoadPrevious21dWeeklyAverage: 150,
        otherSportCount7d: 1,
        otherSportLoad7d: 15,
        trainingBalance: {
          current: { start: "2026-10-25", end: date, activityCount: 4, durationCoverage: 4, durationSeconds: 8_100, distanceCoverage: 4, distanceKm: 31.1, loadCoverage: 4, trainingLoad: 180, sports: [
            { key: "running", label: "Trčanje", activityCount: 3, durationCoverage: 3, durationSeconds: 6_900, distanceCoverage: 3, distanceKm: 18.6, loadCoverage: 3, trainingLoad: 165 },
            { key: "cycling", label: "Biciklizam", activityCount: 1, durationCoverage: 1, durationSeconds: 1_200, distanceCoverage: 1, distanceKm: 12.5, loadCoverage: 1, trainingLoad: 15 },
          ] },
          previous: { start: "2026-10-18", end: "2026-10-24", activityCount: 3, durationCoverage: 3, durationSeconds: 6_600, distanceCoverage: 3, distanceKm: 26, loadCoverage: 2, trainingLoad: 155, sports: [
            { key: "running", label: "Trčanje", activityCount: 2, durationCoverage: 2, durationSeconds: 5_400, distanceCoverage: 2, distanceKm: 16, loadCoverage: 2, trainingLoad: 140 },
            { key: "cycling", label: "Biciklizam", activityCount: 1, durationCoverage: 1, durationSeconds: 1_200, distanceCoverage: 1, distanceKm: 10, loadCoverage: 0, trainingLoad: null },
          ] },
        },
        activityComparison28d: {
          recent: { start: "2026-10-04", end: date, activityCount: 7, durationCoverage: 7, durationSeconds: 18_900, distanceCoverage: 5, distanceKm: 53.6, sports: [
            { key: "running", label: "Trčanje", activityCount: 3, durationCoverage: 3, durationSeconds: 6_900, distanceCoverage: 3, distanceKm: 18.6 },
            { key: "cycling", label: "Biciklizam", activityCount: 2, durationCoverage: 2, durationSeconds: 7_200, distanceCoverage: 2, distanceKm: 35 },
            { key: "sauna", label: "Sauna", activityCount: 2, durationCoverage: 2, durationSeconds: 4_800, distanceCoverage: 0, distanceKm: null },
          ] },
          previous: { start: "2026-09-06", end: "2026-10-03", activityCount: 5, durationCoverage: 5, durationSeconds: 16_800, distanceCoverage: 3, distanceKm: 34, sports: [
            { key: "running", label: "Trčanje", activityCount: 2, durationCoverage: 2, durationSeconds: 5_400, distanceCoverage: 2, distanceKm: 16 },
            { key: "cycling", label: "Biciklizam", activityCount: 1, durationCoverage: 1, durationSeconds: 6_600, distanceCoverage: 1, distanceKm: 18 },
            { key: "sauna", label: "Sauna", activityCount: 2, durationCoverage: 2, durationSeconds: 4_800, distanceCoverage: 0, distanceKm: null },
          ] },
        },
        loadHistoryDays: 365,
        activityCount365d: 24,
        weeklyVolume: [
          { start: "2026-10-19", end: "2026-10-25", distanceKm: 16, count: 3, sports: [
            { key: "running", label: "Trčanje", activityCount: 3, durationCoverage: 3, durationSeconds: 5_400, distanceCoverage: 3, distanceKm: 16 },
            { key: "cycling", label: "Biciklizam", activityCount: 1, durationCoverage: 1, durationSeconds: 1_200, distanceCoverage: 1, distanceKm: 10 },
          ] },
          { start: "2026-10-26", end: date, distanceKm: 18.6, count: 3, sports: [
            { key: "running", label: "Trčanje", activityCount: 3, durationCoverage: 3, durationSeconds: 6_900, distanceCoverage: 3, distanceKm: 18.6 },
            { key: "cycling", label: "Biciklizam", activityCount: 1, durationCoverage: 1, durationSeconds: 1_200, distanceCoverage: 1, distanceKm: 12.5 },
          ] },
        ],
        performanceTrends52w: [
          { start: "2026-10-19", end: "2026-10-25", distanceKm: 16, avgPaceSecondsPerKm: 380 },
          { start: "2026-10-26", end: date, distanceKm: 18.6, avgPaceSecondsPerKm: 371 },
        ],
        dailyLoadTrend: [
          { date: prior, run7d: 12, run42d: 10, allActivity7d: 14, allActivity42d: 11 },
          { date, run7d: 13, run42d: 10.5, allActivity7d: 15, allActivity42d: 11.5 },
        ],
        performanceComparison28d: {
          recent: { distanceKm: 70, runCount: 12, avgPaceSecondsPerKm: 375, avgHeartRate: 149, sampleCounts: { avgPaceSecondsPerKm: 12, avgHeartRate: 9, avgCadence: 0, avgPower: 0, avgStrideLength: 0, avgGroundContactTime: 0, avgVerticalOscillation: 0, avgVerticalRatio: 0 } },
          previous: { distanceKm: 64, runCount: 11, avgPaceSecondsPerKm: 382, avgHeartRate: null, sampleCounts: { avgPaceSecondsPerKm: 11, avgHeartRate: 0, avgCadence: 0, avgPower: 0, avgStrideLength: 0, avgGroundContactTime: 0, avgVerticalOscillation: 0, avgVerticalRatio: 0 } },
        },
        runningTrends90v365: {
          historyDays: 365,
          enoughHistory: true,
          recent90d: { kmPerWeek: 22.5, sessionsPerWeek: 3.1, avgPaceSecondsPerKm: 365 },
          year365d: { kmPerWeek: 20, sessionsPerWeek: 2.8, avgPaceSecondsPerKm: 375 },
        },
        heartRateZones7d: [],
        heartRateZoneComparison28d: {
          recent: { runCount: 12, coveredRuns: 9, totalSeconds: 14_400, zones: [
            { zone: 1, seconds: 1_440, percentage: 10 }, { zone: 2, seconds: 5_040, percentage: 35 },
            { zone: 3, seconds: 3_600, percentage: 25 }, { zone: 4, seconds: 2_880, percentage: 20 },
            { zone: 5, seconds: 1_440, percentage: 10 },
          ] },
          previous: { runCount: 11, coveredRuns: 8, totalSeconds: 12_000, zones: [
            { zone: 1, seconds: 1_800, percentage: 15 }, { zone: 2, seconds: 4_800, percentage: 40 },
            { zone: 3, seconds: 3_000, percentage: 25 }, { zone: 4, seconds: 1_800, percentage: 15 },
            { zone: 5, seconds: 600, percentage: 5 },
          ] },
        },
        trainingPatterns: {
          dailyRunCalendar,
          last28Days: { runDays: 10, restDays: 18, runCount: 12, distanceKm: 70, longestRunKm: 12, longestRunDate: "2026-10-27" },
          loadPattern: {
            running: {
              last7: { totalLoad: 165, monotony: 1.2, strain: 198, activityDays: 3, coveredDays: 7, windowDays: 7, complete: true },
              previous7: { totalLoad: 140, monotony: 1.05, strain: 147, activityDays: 3, coveredDays: 7, windowDays: 7, complete: true },
            },
            allActivities: {
              last7: { totalLoad: 180, monotony: 1.1, strain: 198, activityDays: 4, coveredDays: 7, windowDays: 7, complete: true },
              previous7: { totalLoad: 155, monotony: 1, strain: 155, activityDays: 4, coveredDays: 7, windowDays: 7, complete: true },
            },
          },
        },
      },
      garminTraining: {
        date,
        trainingStatus: {
          date,
          sport: "RUNNING",
          feedback: "PRODUCTIVE",
          acuteLoad: 587,
          chronicLoad: 636,
          loadRatio: 0.9,
          acwrStatus: "OPTIMAL",
          acwrPercent: 38,
          chronicLoadMin: 508.8,
          chronicLoadMax: 954,
        },
        loadFocus: null,
        runningTolerance: null,
        enduranceScore: null,
        vo2Max: {
          date,
          value: 59.6,
          startDate: shiftDate(-60),
          endDate: date,
          change: 3.8,
          dataDays: 3,
          windowDays: 90,
          windowStart: shiftDate(-89),
          windowEnd: date,
          sport: "running",
          history: [
            { date: shiftDate(-89), value: 55.8 },
            { date: shiftDate(-88), value: null },
            { date: shiftDate(-60), value: 57.4 },
            { date: shiftDate(-30), value: 58.5 },
            { date, value: 59.6 },
          ],
        },
      },
      recovery: {
        steps: 8_500,
        stepGoal: 10_000,
        hrvLastNight: 64,
        hrvWeeklyAvg: 66,
        hrvStatus: "Balanced",
        restingHeartRate: 43,
        restingHeartRate7d: 44,
        bodyBattery: 70,
        bodyBatteryCharged: 45,
        bodyBatteryDrained: 33,
        bodyBatteryHistory: {
          date,
          points: [
            { timestamp: 1793423700000, time: "06:15", level: 34 },
            { timestamp: 1793446200000, time: "12:30", level: 57 },
            { timestamp: 1793479500000, time: "21:45", level: 70 },
          ],
          sampleCount: 3,
          startTime: "06:15",
          latestTime: "21:45",
          startLevel: 34,
          latestLevel: 70,
          minLevel: 34,
          maxLevel: 70,
        },
        stressLevel: 20,
        restStressSeconds: 40_000,
      },
      personalRecoveryBaseline: {
        windowStart: "2026-10-03",
        windowEnd: prior,
        hrv: { current: 64, median28d: 66, sampleDays: 28, delta: -2 },
        restingHeartRate: { current: 43, median28d: 44, sampleDays: 28, delta: -1 },
        sleep: { current: 23_400, median28d: 25_200, sampleDays: 28, delta: -1_800 },
      },
      dailySummary: {
        activeCalories: 620,
        restingCalories: 1_980,
        previousDayRestingCalories: 2_111,
        totalCalories: 2_664,
        moderateMinutes7d: 80,
        vigorousMinutes7d: 20,
        intensityGoalMinutes: 150,
      },
      healthSnapshot: {},
      recoveryTrends: [
        { date: "2026-10-29", hrv: 63, restingHeartRate: 42, bodyBattery: 68, stress: 18 },
        { date: "2026-10-30", hrv: 66, restingHeartRate: 44, bodyBattery: 72, stress: 24 },
        { date, hrv: 64, restingHeartRate: 43, bodyBattery: 70, stress: 20 },
      ],
      fitnessAge: {},
      heartRateZones: { floors: [] },
      runnaSchedule: {
        configured: true,
        ok: true,
        referenceDate: zagrebToday(),
        nextRun: {
          title: "Easy run · 5 km",
          date: shiftDate(1),
          start: `${shiftDate(1)}T07:00:00+01:00`,
          distanceKm: 5,
          durationSeconds: 1_800,
          description: "Easy effort. Keep the pace comfortable and conversational from start to finish. Complete the prescribed distance without adding extra intensity, and use the session to build relaxed aerobic consistency.",
        },
        upcomingRuns: [
          { title: "Easy run · 5 km", date: shiftDate(1), start: `${shiftDate(1)}T07:00:00+01:00`, distanceKm: 5, durationSeconds: 1_800, description: "Easy effort. Keep the pace comfortable and conversational from start to finish. Complete the prescribed distance without adding extra intensity, and use the session to build relaxed aerobic consistency." },
          { title: "Recovery jog · 4 km", date: shiftDate(3), start: `${shiftDate(3)}T07:00:00+01:00`, distanceKm: 4, durationSeconds: 1_500 },
          { title: "Tempo · 8 km", date: shiftDate(5), start: `${shiftDate(5)}T07:00:00+01:00`, distanceKm: 8, durationSeconds: 2_400 },
          { title: "Long run · 12 km", date: shiftDate(8), start: `${shiftDate(8)}T07:00:00+01:00`, distanceKm: 12, durationSeconds: 4_200 },
        ],
        upcomingEvents: [],
        plan7d: { runCount: 1, knownDistanceKm: 5, distanceCoverage: 1 },
        plan14d: { runCount: 2, knownDistanceKm: 12, distanceCoverage: 2 },
      },
      planVsActual: {
        archiveStartDate: "2026-10-20",
        archivedPlanCount: 12,
        past30d: { plannedRunCount: 4, matchedRunCount: 3, matchRatePct: 75, actualDistanceKm: 24, plannedDistanceKm: 27, coveredDays: 12, expectedDays: 30, coverageComplete: false },
        next14d: { plannedRunCount: 2, plannedDistanceKm: 12, knownDistanceCount: 2 },
        weeks: [
          { start: "2026-10-12", end: "2026-10-18", plannedRunCount: 0, plannedDistanceKm: null, matchedRunCount: 0, matchedPlannedDistanceKm: null, actualRunCount: 2, actualDistanceKm: 12, planCoverageComplete: false },
          { start: "2026-11-02", end: "2026-11-08", plannedRunCount: 7, plannedDistanceKm: 40.2, matchedRunCount: 0, duePlannedRunCount: 0, todayPlannedRunCount: 0, upcomingPlanCount: 7, matchedDueRunCount: 0, matchedTodayRunCount: 0, matchedPlannedDistanceKm: null, actualRunCount: 0, actualDistanceKm: null, planCoverageComplete: true },
        ],
      },
    },
    settings: { sleepTargetMinutes: 480 },
  };
}

export async function mockDashboardApi(page: import("@playwright/test").Page, options: { eventPatternFixture?: boolean; activitySourceMode?: "failed" | "partial" | "empty"; hydrationMode?: "zero" | "unavailable" } = {}) {
  const dashboardDates: string[] = [];
  const journalWrites: Record<string, unknown>[] = [];
  const lifeEventWrites: Record<string, unknown>[] = [];
  const activityRpeWrites: { activityId: string; payload: Record<string, unknown> }[] = [];
  const ecgDetailRequests: string[] = [];
  const bloodLabWrites: Record<string, unknown>[] = [];
  const bloodLabUploads: { consent: string | undefined; byteLength: number; filename: string; fileCount: number; namesExposed: boolean }[] = [];
  const bloodLabReports: Record<string, unknown>[] = [];
  const patternDates = options.eventPatternFixture ? [-2, -5, -8].map((offset) => {
    const day = new Date(`${zagrebToday()}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  }) : [];
  const lifeEvents: Record<string, unknown>[] = patternDates.map((date, index) => ({
    id: `pattern-event-${index + 1}`, date, time: "19:00", category: "sauna", impact: 3, note: "",
    createdAt: `${date}T19:00:00+01:00`,
  }));
  const activityRpes = new Map<string, Record<string, unknown>>();

  await page.route("**/api/dashboard**", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date") || "2026-10-31";
    dashboardDates.push(date);
    const payload = dashboardPayload(date);
    if (options.activitySourceMode === "failed") {
      payload.sources!.activities = { ok: false, partial: false, count: 0, status: 520, message: "Garmin endpoint vratio je HTTP 520." };
    } else if (options.activitySourceMode === "partial") {
      payload.sources!.activities = { ok: true, partial: true, count: 8, message: "Povijest je djelomična." };
    } else if (options.activitySourceMode === "empty") {
      payload.sources!.activities = { ok: true, partial: false, count: 0 };
      payload.normalized.activities = [];
      payload.normalized.activity = {};
      const training = payload.normalized.training as Record<string, any>;
      training.runCount7d = 0;
      training.runDistance7dKm = 0;
      training.trainingLoad7d = 0;
      training.activityComparison28d = { recent: { sports: [] }, previous: { sports: [] } };
      training.performanceComparison28d = { recent: { runCount: 0, distanceKm: 0 }, previous: { runCount: 0, distanceKm: 0 } };
      training.trainingBalance = {
        current: { activityCount: 0, durationSeconds: 0, sports: [] },
        previous: { activityCount: 0, durationSeconds: 0, sports: [] },
      };
    }
    if (options.hydrationMode === "zero") {
      payload.sources!.dailySummaries = { ok: true, partial: false, count: 56 };
      (payload.normalized.recovery as Record<string, any>).hydrationMl = 0;
    } else if (options.hydrationMode === "unavailable") {
      payload.sources!.dailySummaries = { ok: false, partial: false, count: 0, status: 520, message: "Sažeci nisu dostupni." };
      payload.sources!.hydration = { ok: false, partial: false, count: 0, status: 520 };
      (payload.normalized.recovery as Record<string, any>).hydrationMl = null;
    }
    if (options.eventPatternFixture) {
      const shift = (day: string, offset: number) => {
        const shifted = new Date(`${day}T12:00:00Z`);
        shifted.setUTCDate(shifted.getUTCDate() + offset);
        return shifted.toISOString().slice(0, 10);
      };
      const eventDateSet = new Set(patternDates);
      const recoveryDays = Array.from({ length: 56 }, (_, index) => shift(date, index - 55));
      (payload.normalized as Record<string, any>).sleep.history = recoveryDays.map((day) => ({
        date: day, totalSeconds: eventDateSet.has(shift(day, -1)) ? 25_200 : 23_400, score: 80,
      }));
      (payload.normalized as Record<string, any>).recoveryTrends = recoveryDays.map((day) => ({
        date: day,
        hrv: eventDateSet.has(shift(day, -1)) ? 70 : 60,
        restingHeartRate: eventDateSet.has(shift(day, -1)) ? 40 : 44,
        bodyBattery: 65,
        stress: 20,
      }));
    }
    await route.fulfill({ json: payload });
  });

  await page.route("**/api/skin-temperature**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") || "2026-10-31";
    const history = Array.from({ length: 28 }, (_, index) => {
      const day = new Date(`${date}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() - 27 + index);
      return {
        date: day.toISOString().slice(0, 10),
        deviationC: index % 5 === 0 ? null : Number(((index % 7 - 2) / 10).toFixed(1)),
        calibrationDays: 19,
      };
    });
    const selected = history.find((entry) => entry.date === date);
    await route.fulfill({
      json: {
        ok: true,
        partial: false,
        message: null,
        data: {
          date,
          periodStart: history[0].date,
          periodEnd: history.at(-1)?.date,
          currentDeviationC: selected?.deviationC ?? null,
          meanDeviationC: 0.12,
          medianDeviationC: 0.2,
          nightsAvailable: history.filter((entry) => entry.deviationC != null).length,
          nightsExpected: 28,
          calibrationDays: 19,
          calibrationStatus: "establishing",
          history,
        },
      },
    });
  });

  await page.route("**/api/activities/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop() || "1000";
    const sauna = id === "1000";
    const activity = {
      id,
      name: sauna ? "Sauna" : id === "1001" ? "Easy run" : id === "2001" ? "Calendar-linked run" : "Run",
      type: sauna ? "indoor_cardio" : "running",
      date: "2026-10-31",
      isSauna: sauna,
      isRun: !sauna,
      distanceMeters: sauna ? null : 5_000,
      durationSeconds: sauna ? 2_300 : 1_800,
      paceSecondsPerKm: sauna ? null : 360,
      avgHeartRate: null,
      trainingLoad: sauna ? 8 : 45,
    };
    await route.fulfill({
      json: {
        ok: true,
        activity,
        detail: {
          averageHeartRate: sauna ? 126 : 145,
          maxHeartRate: sauna ? 149 : 170,
          calories: sauna ? 55 : 300,
          trainingLoad: sauna ? 8 : 45,
          distanceMeters: sauna ? null : 5_000,
          durationSeconds: sauna ? 2_300 : 1_800,
          traceAvailable: true,
          trace: [
            { elapsedSeconds: 0, heartRate: sauna ? 100 : 120, ...(!sauna ? { paceSecondsPerKm: 380, powerWatts: 235 } : {}) },
            { elapsedSeconds: 60, heartRate: sauna ? 126 : 145, ...(!sauna ? { paceSecondsPerKm: 365, powerWatts: 248 } : {}) },
            { elapsedSeconds: 120, heartRate: sauna ? 149 : 170, ...(!sauna ? { paceSecondsPerKm: 352, powerWatts: 258 } : {}) },
          ],
          splits: [],
          workouts: [],
          gear: { available: true, linkedCount: sauna ? 0 : 1, items: sauna ? [] : [{ name: "Daily trainer", type: "Running", totalActivities: 42, totalDistanceKm: 615.2, maximumDistanceKm: 800, remainingDistanceKm: 184.8, usagePercent: 76.9 }] },
        },
        message: null,
      },
    });
  });

  await page.route("**/api/ecg/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop() || "";
    ecgDetailRequests.push(id);
    await route.fulfill({
      json: {
        ok: true,
        data: {
          reading: {
            id,
            date: "2026-10-10",
            localTime: "2026-10-10T08:00:00",
            rhythmClassification: "UNCLASSIFIED",
            heartRateAverage: 60,
            rmssdHrv: 190,
          },
          waveform: {
            date: "2026-10-10",
            samples: Array.from({ length: 96 }, (_, index) => Math.cos(index / 4) * 95),
            sampleRate: 128,
            sampleStride: 1,
            sampleCount: 96,
            durationSeconds: 0.75,
          },
        },
      },
    });
  });

  await page.route("**/api/garmin-profile**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") || "2026-10-31";
    await route.fulfill({
      json: {
        ok: true,
        partial: false,
        message: null,
        data: {
          date,
          gear: {
            count: 2,
            activeCount: 1,
            retiredCount: 1,
            available: true,
            items: [
              { name: "Daily trainer", customName: "Kiwi", type: "SHOES", status: "active", totalDistanceKm: 615.2, maximumDistanceKm: 800, remainingDistanceKm: 184.8, usagePercent: 76.9, totalActivities: 42, firstUseDate: "2026-01-01", isDefault: true, defaultSports: ["running"] },
              { name: "Retired racer", type: "SHOES", status: "retired", totalDistanceKm: 950, maximumDistanceKm: 800, remainingDistanceKm: 0, usagePercent: 118.8, totalActivities: 57 },
            ],
          },
          racePredictions: { date, predictions: [{ label: "5K", timeSeconds: 1_330 }, { label: "10K", timeSeconds: 2_780 }, { label: "Half marathon", timeSeconds: 6_200 }, { label: "Marathon", timeSeconds: 13_500 }] },
          runningEconomy: { date, score: 211, classification: "TRAINED", change90d: 3, sampleDays90d: 8, history: [{ date: "2026-08-01", score: 208 }, { date, score: 211 }] },
          personalRecords: [
            { typeId: 1, label: "Najbrži 1 km", timeSeconds: 268, date, activityName: "Track run" },
            { typeId: 7, label: "Najdulje trčanje", distanceKm: 24.5, date, activityName: "Long run" },
          ],
          bodyComposition: {
            latest: { date, weightKg: 72.4 },
            previous: { date: "2026-10-20", weightKg: 72.8 },
            changeKg: -0.4,
            sampleCount: 2,
            history: [{ date: "2026-10-20", weightKg: 72.8 }, { date, weightKg: 72.4 }],
          },
          ecg: {
            readings: [
              { id: "ecg-1", date, localTime: `${date}T07:15:00`, rhythmClassification: "SINUS_NORMAL", heartRateAverage: 58, rmssdHrv: 203 },
              { id: "ecg-0", date: "2026-10-10", localTime: "2026-10-10T08:00:00", rhythmClassification: "SINUS_NORMAL", heartRateAverage: 60, rmssdHrv: 190 },
            ],
            latest: { id: "ecg-1", date, localTime: `${date}T07:15:00`, rhythmClassification: "SINUS_NORMAL", heartRateAverage: 58, rmssdHrv: 203 },
            waveform: { samples: Array.from({ length: 64 }, (_, index) => Math.sin(index / 3) * 120), sampleRate: 128, sampleStride: 1, sampleCount: 64, durationSeconds: 0.5 },
          },
        },
      },
    });
  });

  await page.route("**/api/activities/*/rpe", async (route) => {
    const pathParts = new URL(route.request().url()).pathname.split("/");
    const activityId = pathParts.at(-2) || "1000";
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      activityRpeWrites.push({ activityId, payload });
      const entry = payload.rpe == null && !payload.note ? null : { ...payload, updatedAt: "2026-10-31T07:15:00+02:00" };
      if (entry) activityRpes.set(activityId, entry);
      else activityRpes.delete(activityId);
      await route.fulfill({ json: { ok: true, activityId, date: "2026-10-31", activityName: "Mock activity", entry } });
      return;
    }
    await route.fulfill({ json: { ok: true, activityId, date: "2026-10-31", activityName: "Mock activity", entry: activityRpes.get(activityId) || null } });
  });

  await page.route("**/api/journal**", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date") || "2026-10-31";
    if (url.pathname === "/api/journal/events" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      lifeEventWrites.push(payload);
      lifeEvents.push({ ...payload, id: `event-${lifeEvents.length + 1}`, createdAt: "2026-10-31T07:15:00+02:00" });
      await route.fulfill({ json: { ok: true, date: payload.date, entry: null, history: [], events: lifeEvents.filter((item) => item.date === payload.date), eventHistory: [...lifeEvents] } });
      return;
    }
    if (url.pathname.startsWith("/api/journal/events/") && route.request().method() === "DELETE") {
      const id = url.pathname.split("/").at(-1);
      const index = lifeEvents.findIndex((item) => item.id === id);
      if (index >= 0) lifeEvents.splice(index, 1);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      journalWrites.push(payload);
      await route.fulfill({
        json: {
          ok: true,
          date: payload.date,
          entry: { ...payload, updatedAt: "2026-10-31T07:15:00+02:00" },
          history: [{ date: payload.date, ...payload }],
          events: lifeEvents.filter((item) => item.date === payload.date),
          eventHistory: [...lifeEvents],
        },
      });
      return;
    }
    await route.fulfill({ json: { ok: true, date, entry: null, history: [], events: lifeEvents.filter((item) => item.date === date), eventHistory: [...lifeEvents] } });
  });

  await page.route("**/api/lab-reports**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/analyze") && route.request().method() === "POST") {
      const body = route.request().postDataBuffer() || Buffer.alloc(0);
      const upload = route.request().postDataJSON() as { files: { data: string }[] };
      const documents = upload.files.map((_file, index) => ({ documentNumber: index + 1, reportDate: `2026-11-${String(index + 2).padStart(2, "0")}`, laboratory: index ? "Drugi laboratorij" : "Primjer laboratorija", note: "Očitane stavke krvne slike." }));
      bloodLabUploads.push({ consent: route.request().headers()["x-health-analysis-consent"], byteLength: body.length, filename: url.searchParams.get("filename") || "", fileCount: upload.files.length, namesExposed: upload.files.some((file) => Object.keys(file).some((key) => key !== "data")) });
      await route.fulfill({ json: { ok: true, model: "gpt-6-luna", analysis: {
        reportDate: documents.length === 1 ? documents[0].reportDate : null, laboratory: documents.length === 1 ? documents[0].laboratory : null,
        overview: "Očitani nalazi su objašnjeni prema rasponima navedenima u PDF-u.", documents,
        results: documents.map((document, index) => ({ testName: "Hemoglobin", category: "Krvna slika", valueText: String(142 - index * 2), numericValue: 142 - index * 2, unit: "g/L", referenceRange: "120–160 g/L", labFlag: null, interpretation: "Vrijednost je unutar raspona na ovom nalazu.", confidence: "low", pageNumber: 1, needsReview: true, sourceDocument: document.documentNumber, reportDate: document.reportDate, laboratory: document.laboratory })),
        questionsForClinician: ["Treba li nalaz ponoviti u istom laboratoriju?"], explicitAlerts: [], limitations: "Provjeri prijepis prema izvornom PDF-u.",
      } } });
      return;
    }
    if (url.pathname !== "/api/lab-reports" && route.request().method() === "DELETE") {
      const id = url.pathname.split("/").at(-1);
      const index = bloodLabReports.findIndex((report) => report.id === id);
      if (index >= 0) bloodLabReports.splice(index, 1);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (route.request().method() === "POST") {
      const analysis = route.request().postDataJSON() as Record<string, unknown>;
      bloodLabWrites.push(analysis);
      const report = { id: "11111111111111111111111111111111", analysis, createdAt: "2026-11-13T09:00:00+01:00" };
      bloodLabReports.push(report);
      await route.fulfill({ json: { ok: true, report } });
      return;
    }
    await route.fulfill({ json: { ok: true, aiConfigured: true, model: "gpt-6-luna", reports: [...bloodLabReports] } });
  });

  return { dashboardDates, journalWrites, lifeEventWrites, activityRpeWrites, ecgDetailRequests, bloodLabWrites, bloodLabUploads, bloodLabReports };
}


export async function openNutritionSection(page: Page, section: string) {
  const parent = ({ diary: "overview", trends: "overview", prep: "recipes", portions: "recipes", "ai-recipes": "recipes", shopping: "inventory", catalog: "inventory", "inventory-history": "inventory" } as Record<string, string>)[section];
  if (parent) {
    const primary = page.locator(`.quick-nav a[href="#nutrition-${parent}"]`);
    if (await primary.getAttribute("aria-current") !== "location") await primary.click();
    await page.locator(`.nutrition-subnav a[href="#nutrition-${section}"]`).click();
  } else {
    await page.locator(`.quick-nav a[href="#nutrition-${section}"]`).click();
  }
}
