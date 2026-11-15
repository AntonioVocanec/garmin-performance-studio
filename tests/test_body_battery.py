import unittest
from datetime import datetime
import server as core


class BodyBatteryHistoryTests(unittest.TestCase):
    def test_intraday_points_are_sorted_filtered_and_summarized(self) -> None:
        target = "2026-10-31"
        zone = core.LOCAL_TZ
        first = int(datetime(2026, 10, 31, 6, 15, tzinfo=zone).timestamp() * 1000)
        second = int(datetime(2026, 10, 31, 12, 30, tzinfo=zone).timestamp() * 1000)
        last = int(datetime(2026, 10, 31, 21, 45, tzinfo=zone).timestamp() * 1000)
        next_day = int(datetime(2026, 11, 1, 0, 15, tzinfo=zone).timestamp() * 1000)

        result = core.normalize_recovery({"bodyBattery": {"data": {
            "calendarDate": target,
            "bodyBatteryValuesArray": [[last, 62], [first, 34], [second, 55], [second, 57], [next_day, 80], [last + 1, 101]],
        }}}, target)

        history = result["bodyBatteryHistory"]
        self.assertEqual([point["time"] for point in history["points"]], ["06:15", "12:30", "21:45"])
        self.assertEqual([point["level"] for point in history["points"]], [34, 57, 62])
        self.assertEqual(history["sampleCount"], 3)
        self.assertEqual(history["startLevel"], 34)
        self.assertEqual(history["latestLevel"], 62)
        self.assertEqual(history["minLevel"], 34)
        self.assertEqual(history["maxLevel"], 62)
        self.assertEqual(result["bodyBattery"], 62)

    def test_intraday_history_is_not_reused_for_a_different_selected_date(self) -> None:
        point = int(datetime(2026, 10, 30, 8, 0, tzinfo=core.LOCAL_TZ).timestamp() * 1000)
        result = core.normalize_recovery({"bodyBattery": {"data": {
            "calendarDate": "2026-10-30",
            "bodyBatteryValuesArray": [[point, 48]],
        }}}, "2026-10-31")

        self.assertIsNone(result["bodyBatteryHistory"]["date"])
        self.assertEqual(result["bodyBatteryHistory"]["points"], [])
        self.assertIsNone(result["bodyBatteryHistory"]["latestLevel"])


if __name__ == "__main__":
    unittest.main()
