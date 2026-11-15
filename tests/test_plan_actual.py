import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from datetime import date

import server as core


class WeeklyPlanStatusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="runna-plan-status-")
        self.original_archive = core.ARCHIVE_PATH
        self.original_backups = core.BACKUP_DIR
        self.original_ready = core._archive_schema_ready
        root = Path(self.temp_dir.name)
        core.ARCHIVE_PATH = root / "dashboard.sqlite3"
        core.BACKUP_DIR = root / "backups"
        core._archive_schema_ready = False
        core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            db.executemany(
                """INSERT INTO runna_plan
                   (event_key,title,event_date,all_day,distance_km,first_seen,last_seen)
                   VALUES(?,?,?,1,?,?,?)""",
                [
                    ("past", "Past run", "2026-10-30", 5.0, "2026-10-31T08:00:00", "2026-10-31T08:00:00"),
                    ("future-1", "Future run 1", "2026-11-03", 5.0, "2026-10-31T08:00:00", "2026-10-31T08:00:00"),
                    ("future-2", "Future run 2", "2026-11-05", 7.0, "2026-10-31T08:00:00", "2026-10-31T08:00:00"),
                ],
            )
            db.execute(
                """INSERT INTO activities
                   (activity_id,activity_date,name,sport,is_run,distance_meters,duration_seconds)
                   VALUES('actual','2026-10-30','Easy run','running',1,5000,1800)"""
            )
            db.commit()

    def tearDown(self) -> None:
        core.ARCHIVE_PATH = self.original_archive
        core.BACKUP_DIR = self.original_backups
        core._archive_schema_ready = self.original_ready
        self.temp_dir.cleanup()

    def test_future_plan_is_not_counted_as_unmatched_execution(self) -> None:
        summary = core.plan_actual_summary(date(2026, 10, 31))
        current_week = next(row for row in summary["weeks"] if row["start"] == "2026-10-26")
        future_week = next(row for row in summary["weeks"] if row["start"] == "2026-11-02")

        self.assertFalse(current_week["planCoverageComplete"])
        self.assertEqual(current_week["matchedRunCount"], 1)
        self.assertEqual(future_week["plannedRunCount"], 2)
        self.assertEqual(future_week["duePlannedRunCount"], 0)
        self.assertEqual(future_week["todayPlannedRunCount"], 0)
        self.assertEqual(future_week["upcomingPlanCount"], 2)
        self.assertEqual(future_week["matchedDueRunCount"], 0)
        self.assertEqual(future_week["actualRunCount"], 0)


if __name__ == "__main__":
    unittest.main()
