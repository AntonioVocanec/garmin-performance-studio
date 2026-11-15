import unittest

import server as core


class ActivityNormalizationTests(unittest.TestCase):
    def test_sauna_has_no_distance_or_running_pace(self) -> None:
        activity = core.normalize_activity_item({
            "activityId": 12345,
            "activityName": "Sauna",
            "activityType": {"typeKey": "indoor_cardio"},
            "distanceInMeters": 0,
            "durationInSeconds": 2300,
        })
        self.assertTrue(activity["isSauna"])
        self.assertFalse(activity["isRun"])
        self.assertIsNone(activity["distanceMeters"])
        self.assertIsNone(activity["paceSecondsPerKm"])

    def test_activity_list_reads_garmin_average_hr_and_max_hr_aliases(self) -> None:
        activity = core.normalize_activity_item({
            "activityId": 12346,
            "activityName": "Easy run",
            "activityType": {"typeKey": "running"},
            "distanceInMeters": 5000,
            "durationInSeconds": 1800,
            "averageHR": 145,
            "maxHR": 174,
        })
        self.assertEqual(activity["avgHeartRate"], 145)
        self.assertEqual(activity["maxHeartRate"], 174)

    def test_activity_details_read_heart_rate_summary_and_trace(self) -> None:
        detail = core.normalize_activity_details(
            {"summaryDTO": {"averageHR": 130, "maxHR": 149, "duration": 2300}},
            {
                "detailsAvailable": True,
                "metricDescriptors": [
                    {"key": "directTimestamp", "metricsIndex": 0},
                    {"key": "heartRate", "metricsIndex": 1},
                ],
                "activityDetailMetrics": [
                    {"metrics": [1_700_000_000_000, 120]},
                    {"metrics": [1_700_000_060_000, 140]},
                ],
            },
        )
        self.assertEqual(detail["averageHeartRate"], 130)
        self.assertEqual(detail["maxHeartRate"], 149)
        self.assertTrue(detail["traceAvailable"])
        self.assertEqual([point["heartRate"] for point in detail["trace"]], [120, 140])
        self.assertEqual(detail["trace"][1]["elapsedSeconds"], 60)

    def test_activity_trace_exposes_pace_and_power_only_when_garmin_has_samples(self) -> None:
        detail = core.normalize_activity_details(
            {"summaryDTO": {"duration": 120}},
            {
                "detailsAvailable": True,
                "metricDescriptors": [
                    {"key": "directTimestamp", "metricsIndex": 0},
                    {"key": "directHeartRate", "metricsIndex": 1},
                    {"key": "directSpeed", "metricsIndex": 2},
                    {"key": "directPower", "metricsIndex": 3},
                ],
                "activityDetailMetrics": [
                    {"metrics": [1_700_000_000_000, 120, 5.0, 245]},
                    {"metrics": [1_700_000_001_000, 125, 0, 260]},
                ],
            },
        )
        self.assertEqual(detail["trace"][0]["paceSecondsPerKm"], 200)
        self.assertEqual(detail["trace"][0]["powerWatts"], 245)
        self.assertNotIn("paceSecondsPerKm", detail["trace"][1])
        self.assertEqual(detail["trace"][1]["powerWatts"], 260)

    def test_activity_gear_uses_garmin_distance_stats_and_retirement_threshold(self) -> None:
        detail = core.normalize_activity_details(
            {"summaryDTO": {"duration": 1800}},
            gear_data=[{
                "uuid": "gear-1", "displayName": "Daily trainer", "gearTypeName": "Running",
                "maximumMeters": 800_000,
            }],
            gear_stats={"gear-1": {"totalActivities": 42, "totalDistance": 615_200}},
        )
        self.assertTrue(detail["gear"]["available"])
        shoe = detail["gear"]["items"][0]
        self.assertEqual(shoe["name"], "Daily trainer")
        self.assertEqual(shoe["totalDistanceKm"], 615.2)
        self.assertEqual(shoe["remainingDistanceKm"], 184.8)
        self.assertAlmostEqual(shoe["usagePercent"], 76.9)

    def test_missing_gear_endpoint_is_distinct_from_activity_with_no_linked_gear(self) -> None:
        missing = core.normalize_activity_gear(None)
        empty = core.normalize_activity_gear([])
        self.assertFalse(missing["available"])
        self.assertTrue(empty["available"])
        self.assertEqual(empty["items"], [])


if __name__ == "__main__":
    unittest.main()
