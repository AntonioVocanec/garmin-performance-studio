"""Seven local calendar days of weather for Bjelovar."""

from datetime import date, datetime, timedelta
from http.client import HTTPException
import json
import math
from threading import Lock
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo

ZONE = ZoneInfo("Europe/Zagreb")
FIELDS = {
    "code": "weather_code",
    "low": "temperature_2m_min",
    "high": "temperature_2m_max",
    "rainChance": "precipitation_probability_max",
}
URL = "https://api.open-meteo.com/v1/forecast?" + urlencode({
    "latitude": 45.90, "longitude": 16.84, "timezone": ZONE.key,
    "forecast_days": 7, "daily": ",".join(FIELDS.values()),
})


class ForecastUnavailable(Exception):
    pass


def load_days(today: date) -> list[dict]:
    with urlopen(URL, timeout=5) as response:
        payload = json.load(response)
    daily = payload.get("daily") if isinstance(payload, dict) else None
    dates = [(today + timedelta(days=i)).isoformat() for i in range(7)]
    if not isinstance(daily, dict) or daily.get("time") != dates:
        raise ValueError("Unexpected forecast dates")
    days = [{"date": day} for day in dates]
    for key, field in FIELDS.items():
        values = daily.get(field)
        if values is None:
            values = [None] * 7
        if not isinstance(values, list) or len(values) != 7:
            raise ValueError("Unexpected daily series")
        for row, value in zip(days, values):
            valid = type(value) in (int, float) and math.isfinite(value)
            if valid and key == "rainChance":
                valid = 0 <= value <= 100
            row[key] = value if valid else None
    if not any(row[key] is not None for row in days for key in FIELDS):
        raise ValueError("Empty forecast")
    return days


class ForecastCache:
    def __init__(self):
        self.lock = Lock()
        self.saved_at: datetime | None = None
        self.days: list[dict] = []

    def get(self) -> dict:
        with self.lock:
            now = datetime.now(ZONE)
            same_day = self.saved_at is not None and self.saved_at.date() == now.date()
            stale = False
            if not same_day or now.timestamp() - self.saved_at.timestamp() >= 3600:
                try:
                    days = load_days(now.date())
                except (OSError, HTTPException, ValueError, OverflowError) as exc:
                    if not same_day or datetime.now(ZONE).date() != now.date():
                        raise ForecastUnavailable from exc
                    stale = True
                else:
                    if datetime.now(ZONE).date() != now.date():
                        raise ForecastUnavailable
                    self.days = days
                    self.saved_at = now
            return {"days": self.days, "updatedAt": self.saved_at.isoformat(), "stale": stale}


forecast = ForecastCache()
