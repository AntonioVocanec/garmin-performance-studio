from datetime import date, datetime, timedelta
from io import BytesIO
import json
import unittest
from unittest.mock import patch

import weather_forecast as weather


def sample(start):
    dates = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    return {"daily": {"time": dates, "weather_code": [0] * 7,
                      "temperature_2m_min": [0, -2, None, 3, 4, 5, 6],
                      "precipitation_probability_max": [0, 10, 101, None, 40, 50, 60]}}


class ForecastTests(unittest.TestCase):
    def setUp(self):
        self.start = date(2026, 10, 24)
        self.cache = weather.ForecastCache()
        self.clock = self.enterContext(patch("weather_forecast.datetime"))
        self.at(12)
        self.http = self.enterContext(patch("weather_forecast.urlopen"))
        self.supply(self.start)

    def at(self, hour, minute=0, day=24):
        self.clock.now.return_value = datetime(2026, 10, day, hour, minute, tzinfo=weather.ZONE)

    def supply(self, day):
        self.http.side_effect = lambda *args, **kwargs: BytesIO(json.dumps(sample(day)).encode())

    def test_seven_dates_and_zero_missing_and_invalid_values(self):
        days = self.cache.get()["days"]
        self.assertEqual([row["date"] for row in days], sample(self.start)["daily"]["time"])
        self.assertEqual((days[0]["code"], days[0]["low"], days[0]["rainChance"]), (0, 0, 0))
        self.assertIsNone(days[0]["high"])
        self.assertIsNone(days[2]["low"])
        self.assertIsNone(days[2]["rainChance"])

    def test_cache_expires_after_an_hour_and_recovers(self):
        initial = self.cache.get()
        self.at(12, 59)
        self.assertEqual(self.cache.get(), initial)
        self.http.assert_called_once()
        self.at(13)
        self.http.side_effect = TimeoutError()
        self.assertEqual(self.cache.get(), {**initial, "stale": True})
        self.supply(self.start)
        recovered = self.cache.get()
        self.assertFalse(recovered["stale"])
        self.assertNotEqual(recovered["updatedAt"], initial["updatedAt"])

    def test_zagreb_midnight_invalidates_even_a_recent_cache(self):
        self.at(23, 55)
        self.cache.get()
        self.at(0, 1, day=25)
        with self.assertRaises(weather.ForecastUnavailable):
            self.cache.get()  # provider still returns yesterday's dates
        self.supply(self.start + timedelta(days=1))
        self.assertEqual(self.cache.get()["days"][0]["date"], "2026-10-25")

    def test_unavailable_service_or_empty_measurements(self):
        self.http.side_effect = TimeoutError()
        with self.assertRaises(weather.ForecastUnavailable):
            self.cache.get()
        self.http.side_effect = lambda *a, **kw: BytesIO(json.dumps({
            "daily": {"time": sample(self.start)["daily"]["time"]}
        }).encode())
        with self.assertRaises(weather.ForecastUnavailable):
            self.cache.get()

    def test_current_and_hourly_data_follow_local_day(self):
        data = sample(self.start)
        data["current"] = {"time": "2026-10-24T23:45", "is_day": 0, "temperature_2m": 4}
        data["hourly"] = {"time": ["2026-10-24T23:00", "2026-10-25T00:00"],
                          "precipitation_probability": [0, 10], "wind_direction_10m": [90, 180]}
        self.http.side_effect = lambda *a, **kw: BytesIO(json.dumps(data).encode())
        result = self.cache.get()
        self.assertEqual(result["current"]["rain"], 0)
        self.assertEqual(result["current"]["daylight"], 0)
        self.assertEqual(result["days"][1]["hours"][0]["direction"], 180)
        self.assertIsNone(result["days"][0]["hours"][0]["temp"])
