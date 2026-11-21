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
HOURLY = {
    "temp": "temperature_2m", "rain": "precipitation_probability",
    "wind": "wind_speed_10m", "direction": "wind_direction_10m",
}
CURRENT = {**HOURLY, "humidity": "relative_humidity_2m", "code": "weather_code", "daylight": "is_day"}
URL = "https://api.open-meteo.com/v1/forecast?" + urlencode({
    "latitude": 45.90, "longitude": 16.84, "timezone": ZONE.key,
    "hourly": ",".join(HOURLY.values()),
    "current": ",".join(v for k, v in CURRENT.items() if k != "rain"),
    "forecast_days": 7, "daily": ",".join(FIELDS.values()),
})


class ForecastUnavailable(Exception):
    pass


def reading(value, key):
    if type(value) not in (int, float) or not math.isfinite(value):
        return None
    if key in ("rain", "humidity") and not 0 <= value <= 100:
        return None
    return value


def load_forecast(today: date) -> dict:
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
    hourly = payload.get("hourly") or {}
    by_date = {row["date"]: row for row in days}
    for row in days:
        row["hours"] = []
    current = payload.get("current") or {}
    timestamp = current.get("time")
    current_row = None
    if isinstance(timestamp, str) and timestamp[:10] == dates[0]:
        current_row = {k: reading(current.get(field), k) for k, field in CURRENT.items()}
        current_row["time"] = timestamp
    for i, stamp in enumerate(hourly.get("time") or []):
        if not isinstance(stamp, str) or stamp[:10] not in by_date:
            continue
        hour = {"time": stamp}
        for key, field in HOURLY.items():
            series = hourly.get(field)
            value = series[i] if isinstance(series, list) and i < len(series) else None
            hour[key] = reading(value, key)
        by_date[stamp[:10]]["hours"].append(hour)
        if current_row and stamp[:13] == timestamp[:13]:
            current_row["rain"] = hour["rain"]
    return {"days": days, "current": current_row}


class ForecastCache:
    def __init__(self):
        self.lock = Lock()
        self.saved_at: datetime | None = None
        self.data: dict = {}

    def get(self) -> dict:
        with self.lock:
            now = datetime.now(ZONE)
            same_day = self.saved_at is not None and self.saved_at.date() == now.date()
            stale = False
            if not same_day or now.timestamp() - self.saved_at.timestamp() >= 3600:
                try:
                    data = load_forecast(now.date())
                except (OSError, HTTPException, ValueError, OverflowError) as exc:
                    if not same_day or datetime.now(ZONE).date() != now.date():
                        raise ForecastUnavailable from exc
                    stale = True
                else:
                    if datetime.now(ZONE).date() != now.date():
                        raise ForecastUnavailable
                    self.data = data
                    self.saved_at = now
            return {**self.data, "updatedAt": self.saved_at.isoformat(), "stale": stale}


forecast = ForecastCache()
