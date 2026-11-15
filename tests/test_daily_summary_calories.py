import unittest
from datetime import date

import server as core


class DailySummaryCaloriesTests(unittest.TestCase):
    def test_returns_previous_day_resting_calories_separately_from_selected_day(self) -> None:
        target = date(2026, 11, 2)
        rows = [
            {
                "calendarDate": "2026-11-01",
                "calories": {"burnedActive": 510, "burnedResting": 2111, "burnedTotal": 2621},
            },
            {
                "calendarDate": "2026-11-02",
                "calories": {"burnedActive": 905, "burnedResting": 1994, "burnedTotal": 2664},
            },
        ]

        result = core.normalize_daily_summary(rows, target)

        self.assertEqual(result["activeCalories"], 905)
        self.assertEqual(result["restingCalories"], 1994)
        self.assertEqual(result["previousDayRestingCalories"], 2111)
        self.assertEqual(result["totalCalories"], 2664)

    def test_does_not_reuse_selected_day_when_previous_day_is_missing(self) -> None:
        target = date(2026, 11, 2)
        rows = [{
            "calendarDate": target.isoformat(),
            "calories": {"burnedActive": 905, "burnedResting": 1994},
        }]

        result = core.normalize_daily_summary(rows, target)

        self.assertIsNone(result["previousDayRestingCalories"])

    def test_missing_selected_day_does_not_fall_back_to_previous_active_calories(self) -> None:
        target = date(2026, 11, 2)
        rows = [{
            "calendarDate": "2026-11-01",
            "calories": {"burnedActive": 510, "burnedResting": 2111},
        }]

        result = core.normalize_daily_summary(rows, target)

        self.assertIsNone(result["activeCalories"])
        self.assertEqual(result["previousDayRestingCalories"], 2111)


if __name__ == "__main__":
    unittest.main()
