import math
import unittest
from datetime import date

import server as core


class TrainingPatternTests(unittest.TestCase):
    target = date(2026, 10, 31)

    @staticmethod
    def activity(distance_meters: float, load: float | None, is_run: bool = True) -> dict[str, object]:
        return {
            "isRun": is_run,
            "distanceMeters": distance_meters,
            "trainingLoad": load,
        }

    def test_calendar_and_training_summary_include_rest_days(self) -> None:
        activities = [
            (date(2026, 10, 25), self.activity(6_000, 10)),
            (date(2026, 10, 28), self.activity(8_000, 20)),
            (date(2026, 10, 31), self.activity(4_000, 30)),
        ]

        result = core.summarize_training_patterns(activities, self.target)

        self.assertEqual(len(result["dailyRunCalendar"]), 91)
        self.assertEqual(result["dailyRunCalendar"][-1]["date"], "2026-11-01")
        self.assertIsNone(result["dailyRunCalendar"][-1]["distanceKm"])
        self.assertEqual(result["last28Days"], {
            "runDays": 3,
            "restDays": 25,
            "runCount": 3,
            "distanceKm": 18,
            "longestRunKm": 8,
            "longestRunDate": "2026-10-28",
        })

        load = result["loadPattern"]["running"]["last7"]
        expected_daily = [10, 0, 0, 20, 0, 0, 30]
        mean = sum(expected_daily) / 7
        deviation = math.sqrt(sum((value - mean) ** 2 for value in expected_daily) / 7)
        self.assertTrue(load["complete"])
        self.assertEqual(load["totalLoad"], 60)
        self.assertEqual(load["activityDays"], 3)
        self.assertAlmostEqual(load["monotony"], mean / deviation)
        self.assertAlmostEqual(load["strain"], 60 * mean / deviation)

    def test_missing_load_marks_window_incomplete_without_inventing_values(self) -> None:
        result = core.summarize_training_patterns(
            [(self.target, self.activity(5_000, None))], self.target
        )

        load = result["loadPattern"]["running"]["last7"]
        self.assertFalse(load["complete"])
        self.assertEqual(load["coveredDays"], 6)
        self.assertIsNone(load["totalLoad"])
        self.assertIsNone(load["monotony"])
        self.assertIsNone(load["strain"])

    def test_other_sport_is_excluded_from_run_calendar_and_run_load(self) -> None:
        result = core.summarize_training_patterns(
            [(self.target, self.activity(12_000, 40, is_run=False))], self.target
        )

        self.assertEqual(result["last28Days"]["runCount"], 0)
        self.assertEqual(result["last28Days"]["distanceKm"], 0)
        self.assertEqual(result["loadPattern"]["running"]["last7"]["totalLoad"], 0)
        self.assertEqual(result["loadPattern"]["allActivities"]["last7"]["totalLoad"], 40)

    def test_running_trends_compare_ninety_days_with_full_year(self) -> None:
        activities = [
            {"date": "2025-11-01", "isRun": True, "distanceMeters": 8_000, "durationSeconds": 4_000},
            {"date": "2026-02-01", "isRun": True, "distanceMeters": 10_000, "durationSeconds": 5_000},
            {"date": "2026-08-03", "isRun": True, "distanceMeters": 10_000, "durationSeconds": 5_000},
            {"date": "2026-10-31", "isRun": True, "distanceMeters": 5_000, "durationSeconds": 1_800},
        ]

        trends = core.summarize_training(activities, self.target)["runningTrends90v365"]

        self.assertEqual(trends["historyDays"], 365)
        self.assertTrue(trends["enoughHistory"])
        self.assertEqual(trends["recent90d"]["sessionCount"], 2)
        self.assertAlmostEqual(trends["recent90d"]["kmPerWeek"], 15 / (90 / 7))
        self.assertEqual(trends["year365d"]["sessionCount"], 4)
        self.assertAlmostEqual(trends["year365d"]["kmPerWeek"], 33 / (365 / 7))

    def test_28_day_comparison_reports_recorded_heart_rate_coverage(self) -> None:
        activities = [
            {
                "date": self.target.isoformat(),
                "isRun": True,
                "distanceMeters": 5_000,
                "durationSeconds": 1_800,
                "avgHeartRate": 148,
            },
            {
                "date": (self.target - core.timedelta(days=4)).isoformat(),
                "isRun": True,
                "distanceMeters": 4_000,
                "durationSeconds": 1_500,
            },
            {
                "date": (self.target - core.timedelta(days=35)).isoformat(),
                "isRun": True,
                "distanceMeters": 6_000,
                "durationSeconds": 2_400,
            },
        ]

        comparison = core.summarize_training(activities, self.target)["performanceComparison28d"]

        self.assertEqual(comparison["recent"]["runCount"], 2)
        self.assertAlmostEqual(comparison["recent"]["avgHeartRate"], 148)
        self.assertEqual(comparison["recent"]["sampleCounts"]["avgHeartRate"], 1)
        self.assertEqual(comparison["previous"]["runCount"], 1)
        self.assertIsNone(comparison["previous"]["avgHeartRate"])
        self.assertEqual(comparison["previous"]["sampleCounts"]["avgHeartRate"], 0)

    def test_heart_rate_zone_comparison_uses_covered_runs_and_two_contiguous_periods(self) -> None:
        activities = [
            {"date": self.target.isoformat(), "isRun": True, "zoneSeconds": [60, 120, 180, 240, 300]},
            {"date": (self.target - core.timedelta(days=5)).isoformat(), "isRun": True, "zoneSeconds": [0, 0, 0, 0, 0]},
            {"date": (self.target - core.timedelta(days=28)).isoformat(), "isRun": True, "zoneSeconds": [120, 120, 120, 120, 120]},
            {"date": (self.target - core.timedelta(days=56)).isoformat(), "isRun": True, "zoneSeconds": [900, 900, 900, 900, 900]},
            {"date": self.target.isoformat(), "isRun": False, "zoneSeconds": [900, 900, 900, 900, 900]},
        ]

        comparison = core.summarize_training(activities, self.target)["heartRateZoneComparison28d"]

        self.assertEqual(comparison["recent"]["runCount"], 2)
        self.assertEqual(comparison["recent"]["coveredRuns"], 1)
        self.assertEqual(comparison["recent"]["totalSeconds"], 900)
        self.assertEqual(comparison["recent"]["zones"][0]["seconds"], 60)
        self.assertEqual(comparison["previous"]["runCount"], 1)
        self.assertEqual(comparison["previous"]["coveredRuns"], 1)
        self.assertEqual(comparison["previous"]["totalSeconds"], 600)

    def test_seven_day_load_is_compared_to_previous_four_week_average(self) -> None:
        activities = [
            {"date": (self.target - core.timedelta(days=day)).isoformat(), "isRun": True, "distanceMeters": 1_000, "durationSeconds": 600, "trainingLoad": 10}
            for day in (7, 14, 21, 28)
        ]
        activities.append({
            "date": self.target.isoformat(), "isRun": True, "distanceMeters": 5_000,
            "durationSeconds": 1_800, "trainingLoad": 70,
        })

        training = core.summarize_training(activities, self.target)

        self.assertEqual(training["trainingLoadPrevious28dWeeklyAverage"], 10)
        self.assertEqual(training["trainingLoadVsPrevious28dRatio"], 7)

    def test_training_balance_groups_sports_and_keeps_missing_metrics_unknown(self) -> None:
        activities = [
            {"date": "2026-10-25", "type": "running", "name": "Easy run", "isRun": True, "durationSeconds": 3600, "distanceMeters": 5000, "trainingLoad": 30},
            {"date": "2026-10-29", "type": "indoor_cycling", "name": "Indoor cycling", "isRun": False, "durationSeconds": 2400, "distanceMeters": None, "trainingLoad": None},
            {"date": "2026-10-31", "type": "indoor_cardio", "name": "Sauna", "isRun": False, "isSauna": True, "durationSeconds": 1800, "distanceMeters": None, "trainingLoad": 8},
            {"date": "2026-10-18", "type": "running", "name": "Run", "isRun": True, "durationSeconds": 2400, "distanceMeters": 4000, "trainingLoad": 20},
        ]

        result = core.summarize_training_balance(activities, self.target)

        self.assertEqual(result["current"]["activityCount"], 3)
        current = {row["key"]: row for row in result["current"]["sports"]}
        self.assertEqual(current["running"]["distanceKm"], 5)
        self.assertEqual(current["cycling"]["label"], "Biciklizam")
        self.assertIsNone(current["cycling"]["distanceKm"])
        self.assertEqual(current["sauna"]["label"], "Sauna")
        previous = {row["key"]: row for row in result["previous"]["sports"]}
        self.assertEqual(previous["running"]["distanceKm"], 4)

    def test_monthly_activity_comparison_and_weekly_series_keep_sport_categories(self) -> None:
        def dated(offset: int, **values: object) -> dict[str, object]:
            return {"date": (self.target - core.timedelta(days=offset)).isoformat(), **values}

        activities = [
            dated(0, type="running", name="Easy run", isRun=True, distanceMeters=5_000, durationSeconds=1_800),
            dated(27, type="cycling", name="Ride", isRun=False, distanceMeters=12_000, durationSeconds=2_400),
            dated(2, type="indoor_cycling", name="Indoor ride", isRun=False, distanceMeters=None, durationSeconds=1_800),
            dated(3, type="indoor_cardio", name="Sauna", isRun=False, isSauna=True, durationSeconds=1_800),
            dated(28, type="indoor_cardio", name="Sauna", isRun=False, isSauna=True, durationSeconds=1_800),
            dated(55, type="cycling", name="Ride", isRun=False, distanceMeters=9_000, durationSeconds=2_000),
            dated(56, type="running", name="Outside comparison window", isRun=True, distanceMeters=8_000, durationSeconds=2_400),
        ]

        training = core.summarize_training(activities, self.target)
        comparison = training["activityComparison28d"]
        recent = {row["key"]: row for row in comparison["recent"]["sports"]}
        previous = {row["key"]: row for row in comparison["previous"]["sports"]}

        self.assertEqual((comparison["recent"]["start"], comparison["recent"]["end"]), ("2026-10-04", "2026-10-31"))
        self.assertEqual(recent["cycling"]["activityCount"], 2)
        self.assertEqual(recent["cycling"]["distanceCoverage"], 1)
        self.assertEqual(recent["cycling"]["distanceKm"], 12)
        self.assertEqual(recent["sauna"]["activityCount"], 1)
        self.assertIsNone(recent["sauna"]["distanceKm"])
        self.assertEqual(previous["cycling"]["activityCount"], 1)
        self.assertEqual(previous["sauna"]["activityCount"], 1)

        latest_week = {row["key"]: row for row in training["weeklyVolume"][-1]["sports"]}
        self.assertEqual(set(latest_week), {"running", "cycling", "sauna"})
        self.assertIsNone(latest_week["cycling"]["distanceKm"])
        self.assertEqual(latest_week["cycling"]["distanceCoverage"], 0)
        self.assertEqual(latest_week["sauna"]["durationSeconds"], 1_800)


if __name__ == "__main__":
    unittest.main()
