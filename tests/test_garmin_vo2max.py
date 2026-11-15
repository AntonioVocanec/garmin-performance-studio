import unittest
from datetime import date
from unittest.mock import patch

import server as core


class GarminVo2MaxTests(unittest.TestCase):
    target = date(2026, 11, 1)

    @patch.object(core, "iso_today", return_value=date(2026, 11, 1))
    def test_running_history_is_sorted_sparse_and_limited_to_the_selected_window(self, _today) -> None:
        raw = [
            {"generic": {"calendarDate": "2026-08-06", "vo2MaxPreciseValue": None, "vo2MaxValue": 56}},
            {"generic": {"calendarDate": "2026-11-02", "vo2MaxPreciseValue": 65}},
            {"cycling": {"calendarDate": "2026-11-01", "vo2MaxPreciseValue": 70}},
            {"generic": {"calendarDate": "2026-11-01", "vo2MaxPreciseValue": 59.6, "vo2MaxValue": 60}},
            {"generic": {"calendarDate": "2026-08-04", "vo2MaxPreciseValue": 55.8, "vo2MaxValue": 56}},
            {"generic": {"calendarDate": "2026-08-05", "vo2MaxPreciseValue": None, "vo2MaxValue": None}},
        ]

        result = core._normalize_garmin_vo2max(raw, self.target)

        self.assertEqual(result["value"], 59.6)
        self.assertEqual(result["startDate"], "2026-08-04")
        self.assertEqual(result["endDate"], "2026-11-01")
        self.assertAlmostEqual(result["change"], 3.8)
        self.assertEqual(result["dataDays"], 3)
        self.assertEqual(result["windowDays"], 90)
        self.assertEqual(len(result["history"]), 90)
        self.assertEqual(result["history"][0], {"date": "2026-08-04", "value": 55.8})
        self.assertEqual(result["history"][1], {"date": "2026-08-05", "value": None})
        self.assertEqual(result["history"][2], {"date": "2026-08-06", "value": 56.0})
        self.assertEqual(result["history"][-1], {"date": "2026-11-01", "value": 59.6})

    @patch.object(core, "iso_today", return_value=date(2026, 11, 1))
    def test_history_without_running_values_is_unavailable(self, _today) -> None:
        raw = [
            {"cycling": {"calendarDate": "2026-11-01", "vo2MaxPreciseValue": 60}},
            {"generic": {"calendarDate": "2026-11-01", "vo2MaxPreciseValue": None, "vo2MaxValue": None}},
        ]

        self.assertIsNone(core._normalize_garmin_vo2max(raw, self.target))

    @patch.object(core, "iso_today", return_value=date(2026, 11, 1))
    def test_single_value_has_no_invented_change(self, _today) -> None:
        raw = [{"generic": {"calendarDate": "2026-11-01", "vo2MaxPreciseValue": 59.6}}]

        result = core._normalize_garmin_vo2max(raw, self.target)

        self.assertEqual(result["dataDays"], 1)
        self.assertIsNone(result["change"])


if __name__ == "__main__":
    unittest.main()
