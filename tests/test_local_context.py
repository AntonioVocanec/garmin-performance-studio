import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import server as core


class LocalContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="garmin-context-test-")
        self.original_archive = core.ARCHIVE_PATH
        self.original_backups = core.BACKUP_DIR
        self.original_ready = core._archive_schema_ready
        temp_root = Path(self.temp_dir.name)
        core.ARCHIVE_PATH = temp_root / "context.sqlite3"
        core.BACKUP_DIR = temp_root / "backups"
        core._archive_schema_ready = False
        core.initialize_archive()

    def tearDown(self) -> None:
        core.ARCHIVE_PATH = self.original_archive
        core.BACKUP_DIR = self.original_backups
        core._archive_schema_ready = self.original_ready
        self.temp_dir.cleanup()

    def test_life_event_is_structured_listed_and_removable(self) -> None:
        target = core.iso_today().isoformat()
        saved = core.save_life_event({
            "date": target, "time": "19:45", "category": "sauna", "impact": 4,
            "note": "Kasna sauna",
        })
        self.assertEqual(len(saved["events"]), 1)
        event = saved["events"][0]
        self.assertEqual((event["category"], event["time"], event["impact"], event["note"]),
                         ("sauna", "19:45", 4, "Kasna sauna"))
        self.assertTrue(core.delete_life_event(event["id"]))
        self.assertEqual(core.read_daily_journal(core.iso_today())["events"], [])
        self.assertFalse(core.delete_life_event(event["id"]))

    def test_life_event_rejects_bad_time_category_impact_and_future_date(self) -> None:
        target = core.iso_today().isoformat()
        base = {"date": target, "time": "19:45", "category": "sauna", "impact": 3, "note": ""}
        for key, value in (("time", "25:61"), ("category", "unknown"), ("impact", 6)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                core.save_life_event({**base, key: value})
        tomorrow = (core.iso_today() + timedelta(days=1)).isoformat()
        with self.assertRaises(ValueError):
            core.save_life_event({**base, "date": tomorrow})

    def test_journal_returns_only_the_selected_28_day_event_window(self) -> None:
        target = core.iso_today()
        for offset, note in ((-27, "inside"), (-28, "outside")):
            core.save_life_event({
                "date": (target + timedelta(days=offset)).isoformat(),
                "time": None, "category": "sauna", "impact": 3, "note": note,
            })

        result = core.read_daily_journal(target)

        self.assertEqual([event["note"] for event in result["eventHistory"]], ["inside"])
        self.assertEqual(result["events"], [])

    def test_activity_rpe_is_bound_to_activity_and_can_be_cleared(self) -> None:
        target = core.iso_today().isoformat()
        core.persist_activities([{
            "id": "987654", "date": datetime.combine(core.iso_today(), datetime.min.time()).isoformat(),
            "name": "Easy run", "type": "running", "isRun": True,
            "distanceMeters": 5000, "durationSeconds": 1800,
        }])
        saved = core.save_activity_rpe("987654", {"rpe": 6, "note": "Kontroliran napor"})
        self.assertEqual(saved["entry"]["rpe"], 6)
        self.assertEqual(saved["entry"]["note"], "Kontroliran napor")
        self.assertEqual(saved["date"], target)
        with self.assertRaises(ValueError):
            core.save_activity_rpe("987654", {"rpe": 11, "note": ""})
        cleared = core.save_activity_rpe("987654", {"rpe": None, "note": ""})
        self.assertIsNone(cleared["entry"])

    def test_weekly_context_combines_activity_rpe_and_life_events_with_coverage(self) -> None:
        target = core.iso_today()
        core.persist_activities([{
            "id": "987655", "date": datetime.combine(target, datetime.min.time()).isoformat(),
            "name": "Easy run", "type": "running", "isRun": True,
            "distanceMeters": 5000, "durationSeconds": 1800,
        }])
        core.save_activity_rpe("987655", {"rpe": 7, "note": ""})
        core.save_life_event({"date": target.isoformat(), "time": "19:00", "category": "sauna", "impact": 3, "note": ""})

        result = core.local_weekly_context(target)

        self.assertEqual(result["activityCount"], 1)
        self.assertEqual(result["rpe"]["recordedCount"], 1)
        self.assertEqual(result["rpe"]["average"], 7)
        self.assertEqual(result["lifeEvents"][0]["category"], "sauna")
        self.assertEqual(result["lifeEvents"][0]["time"], "19:00")


if __name__ == "__main__":
    unittest.main()
