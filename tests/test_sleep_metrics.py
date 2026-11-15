import unittest
from datetime import date, datetime, time, timedelta

import server as core


class SleepRegularityTests(unittest.TestCase):
    def test_reports_local_bedtime_and_wake_time_variability_with_coverage(self) -> None:
        target = date(2026, 11, 14)
        records = []
        for offset in range(14):
            night = target - timedelta(days=13 - offset)
            bedtime = datetime.combine(night, time(22, 30), tzinfo=core.LOCAL_TZ)
            wake_time = datetime.combine(night + timedelta(days=1), time(6, 30), tzinfo=core.LOCAL_TZ)
            item = {
                "calendarDate": night.isoformat(),
                "sleepTimeSeconds": 7 * 60 * 60,
                "sleepNeed": {"actual": 8 * 60},
                "sleepStartTimestampLocal": int(bedtime.timestamp() * 1000),
                "sleepEndTimestampLocal": int(wake_time.timestamp() * 1000),
            }
            if offset != 5:
                records.append(item)
            else:
                item.pop("sleepEndTimestampLocal")
                records.append(item)

        result = core.daily_sleep_debt(records, None, target)
        regularity = result["sleepRegularity14d"]

        self.assertAlmostEqual(regularity["bedtimeSdMinutes"], 0, places=3)
        self.assertAlmostEqual(regularity["wakeTimeSdMinutes"], 0, places=3)
        self.assertEqual(regularity["bedtimeDays"], 14)
        self.assertEqual(regularity["wakeTimeDays"], 13)
        self.assertEqual(regularity["daysExpected"], 14)

    def test_sleep_regularity_is_unavailable_without_garmin_timestamps(self) -> None:
        target = date(2026, 11, 14)
        result = core.daily_sleep_debt(
            [{"calendarDate": target.isoformat(), "sleepTimeSeconds": 25_200}],
            480,
            target,
        )

        self.assertEqual(result["sleepRegularity14d"]["bedtimeDays"], 0)
        self.assertEqual(result["sleepRegularity14d"]["wakeTimeDays"], 0)
        self.assertIsNone(result["sleepRegularity14d"]["bedtimeSdMinutes"])
        self.assertIsNone(result["sleepRegularity14d"]["wakeTimeSdMinutes"])


class SleepDebtNapTests(unittest.TestCase):
    def test_garmin_nap_time_reduces_accumulated_sleep_debt_once(self) -> None:
        target = date(2026, 11, 14)
        first_night = target - timedelta(days=13)
        second_night = first_night + timedelta(days=1)
        records = [
            {
                "calendarDate": first_night.isoformat(),
                "sleepTimeSeconds": 6 * 60 * 60,
                "sleepNeed": {"actual": 8 * 60},
            },
            {
                "calendarDate": second_night.isoformat(),
                "sleepTimeSeconds": 8 * 60 * 60,
                "napTimeSeconds": 60 * 60,
                "dailyNapDTOS": [{"napTimeSec": 60 * 60}],
                "sleepNeed": {"actual": 8 * 60},
            },
        ]

        result = core.daily_sleep_debt(records, None, target)

        self.assertEqual(result["debtSeconds"], 60 * 60)
        self.assertEqual(result["napSeconds"], 60 * 60)
        self.assertEqual(result["napDays"], 1)
        self.assertEqual(result["napCoverageDays"], 1)
        self.assertEqual(result["history"][1]["creditedSleepSeconds"], 9 * 60 * 60)
        self.assertEqual(result["history"][1]["debtAfterSeconds"], 60 * 60)

    def test_individual_garmin_naps_are_summed_when_aggregate_is_missing(self) -> None:
        target = date(2026, 11, 14)
        record = {
            "calendarDate": target.isoformat(),
            "sleepTimeSeconds": 7 * 60 * 60,
            "dailyNapDTOS": [{"napTimeSec": 20 * 60}, {"napTimeSec": 40 * 60}],
            "sleepNeed": {"actual": 8 * 60},
        }

        result = core.daily_sleep_debt([record], None, target)

        self.assertEqual(result["napSeconds"], 60 * 60)
        self.assertEqual(result["history"][0]["napSeconds"], 60 * 60)
        self.assertEqual(result["debtSeconds"], 0)


if __name__ == "__main__":
    unittest.main()
