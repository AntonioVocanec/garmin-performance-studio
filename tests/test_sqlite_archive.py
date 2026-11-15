import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing
from pathlib import Path

import server as core


class ArchiveMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="garmin-archive-test-")
        self.original_archive = core.ARCHIVE_PATH
        self.original_backups = core.BACKUP_DIR
        self.original_ready = core._archive_schema_ready
        temp_root = Path(self.temp_dir.name)
        core.ARCHIVE_PATH = temp_root / "legacy.sqlite3"
        core.BACKUP_DIR = temp_root / "backups"
        core._archive_schema_ready = False
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            db.executescript(
                """
                CREATE TABLE runna_plan (
                    event_key TEXT PRIMARY KEY, runna_uid TEXT, title TEXT NOT NULL,
                    event_date TEXT NOT NULL, start_time TEXT, all_day INTEGER NOT NULL,
                    distance_km REAL, duration_min_seconds REAL, duration_max_seconds REAL,
                    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
                );
                CREATE TABLE activities (
                    activity_id TEXT PRIMARY KEY, activity_date TEXT NOT NULL, name TEXT,
                    sport TEXT, is_run INTEGER NOT NULL, distance_meters REAL,
                    duration_seconds REAL, pace_seconds_per_km REAL, average_heart_rate REAL,
                    training_load REAL, elevation_gain REAL
                );
                CREATE TABLE daily_journal (
                    entry_date TEXT PRIMARY KEY, rpe REAL, fatigue REAL, soreness REAL,
                    mood INTEGER, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
                );
                INSERT INTO runna_plan VALUES ('fixture', NULL, 'Synthetic sample', '2000-01-01', NULL, 1, NULL, NULL, NULL, '2000-01-01', '2000-01-01');
                INSERT INTO activities VALUES ('fixture', '2000-01-01', 'Synthetic sample', 'running', 1, 1000, 300, 300, 100, 1, 0);
                INSERT INTO daily_journal VALUES ('2000-01-01', 1, 1, 1, 3, 'synthetic sample', '2000-01-01T00:00:00');
                """
            )
            db.commit()

    def tearDown(self) -> None:
        core.ARCHIVE_PATH = self.original_archive
        core.BACKUP_DIR = self.original_backups
        core._archive_schema_ready = self.original_ready
        self.temp_dir.cleanup()

    def test_migrates_legacy_schema_and_keeps_verified_online_backups(self) -> None:
        core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], core._ARCHIVE_SCHEMA_VERSION)
            self.assertEqual(db.execute("PRAGMA journal_mode").fetchone()[0].lower(), "wal")
            self.assertEqual(db.execute("PRAGMA quick_check").fetchone()[0], "ok")
            self.assertEqual(
                [db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in ("runna_plan", "activities", "daily_journal", "life_events", "activity_rpe", "blood_lab_reports")],
                [1, 1, 1, 0, 0, 0],
            )
            indexes = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
            self.assertTrue({"idx_runna_plan_date", "idx_activities_date", "idx_daily_journal_date", "idx_life_events_date", "idx_activity_rpe_date", "idx_blood_lab_reports_date"}.issubset(indexes))

        backups = sorted(core.BACKUP_DIR.glob("garmin-dashboard-*.sqlite3"))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as before_migration:
            self.assertEqual(before_migration.execute("PRAGMA user_version").fetchone()[0], 0)
            self.assertEqual(before_migration.execute("PRAGMA quick_check").fetchone()[0], "ok")
            self.assertEqual(before_migration.execute("SELECT COUNT(*) FROM daily_journal").fetchone()[0], 1)

        after_migration = core.backup_archive()
        self.assertNotEqual(after_migration, backups[0])
        with closing(sqlite3.connect(after_migration)) as verified:
            self.assertEqual(verified.execute("PRAGMA user_version").fetchone()[0], core._ARCHIVE_SCHEMA_VERSION)
            self.assertEqual(verified.execute("PRAGMA quick_check").fetchone()[0], "ok")


    def test_upgrades_version_three_without_replacing_existing_health_records(self) -> None:
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            core._migration_2(db)
            core._migration_3(db)
            db.execute("INSERT INTO blood_lab_reports VALUES ('synthetic','2000-01-01','Test','{}','2000-01-01')")
            db.execute('PRAGMA user_version=3')
            db.commit()
        core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],core._ARCHIVE_SCHEMA_VERSION)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM blood_lab_reports').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_profiles').fetchone()[0],0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_nutrition_v9_upgrade_preserves_snapshots_and_rolls_back_failed_migration(self):
        from nutrition.migrations import MIGRATIONS, migration_10
        with patch.object(core, '_ARCHIVE_SCHEMA_VERSION', 9):
            core.initialize_archive()
        core._archive_schema_ready = False
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            db.execute("INSERT INTO nutrition_foods(id,name,state,unit,allergens_json) VALUES ('food','Test','dry','g','[]')")
            db.execute("INSERT INTO nutrition_nutrition_versions(id,food_id,source,retrieved_at) VALUES ('v','food','Legacy','2000-01-01')")
            db.execute("INSERT INTO nutrition_nutrient_values VALUES ('v','carbs',70000,'g')")
            db.execute("INSERT INTO nutrition_recipes(id,name) VALUES ('recipe','Legacy')")
            db.execute("INSERT INTO nutrition_recipe_versions VALUES ('rv','recipe',1,'{}','2000-01-01')")
            db.execute("""INSERT INTO nutrition_recipe_ingredients VALUES
                       ('rv',0,'food',100000,0,'{"nutrients":{"kcal":"350","carbs":"70"}}')""")
            db.execute("INSERT INTO nutrition_operations VALUES ('op','cook','key','hash','{}','2000-01-01',NULL)")
            db.execute("""INSERT INTO nutrition_prep_batches VALUES
                       ('batch','rv','op',1000,NULL,'{"perPortion":{"kcal":"350","carbs":"70"}}','2000-01-01')""")
            db.execute("""INSERT INTO nutrition_food_log_entries VALUES
                       ('log','2000-01-01','lunch','Legacy',1000,'portion','{"kcal":"350","carbs":"70"}',NULL,0,'2000-01-01')""")
            db.commit()
            tables = ['nutrition_nutrient_values','nutrition_recipe_ingredients','nutrition_prep_batches','nutrition_food_log_entries']
            before = {table:db.execute(f'SELECT * FROM {table}').fetchall() for table in tables}

        def fail_after_alter(db):
            migration_10(db)
            raise RuntimeError('Synthetic migration failure')

        with patch.dict(MIGRATIONS, {10:fail_after_alter}), self.assertRaises(RuntimeError):
            core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 9)
            self.assertNotIn('metadata_json', [row[1] for row in db.execute('PRAGMA table_info(nutrition_nutrition_versions)')])
        core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            for table in tables:
                self.assertEqual(db.execute(f'SELECT * FROM {table}').fetchall(), before[table])
            self.assertIsNone(db.execute('SELECT metadata_json FROM nutrition_nutrition_versions').fetchone()[0])
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], core._ARCHIVE_SCHEMA_VERSION)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        backups = []
        for path in core.BACKUP_DIR.glob('garmin-dashboard-*.sqlite3'):
            with closing(sqlite3.connect(path)) as db:
                if db.execute('PRAGMA user_version').fetchone()[0] == 9:
                    backups.append(path)
                    self.assertEqual(db.execute('SELECT * FROM nutrition_prep_batches').fetchall(), before['nutrition_prep_batches'])
        self.assertTrue(backups)

    def test_inventory_v11_keeps_unknown_dates_and_rolls_back_failed_upgrade(self):
        from nutrition.migrations import MIGRATIONS, migration_11
        with patch.object(core, '_ARCHIVE_SCHEMA_VERSION', 10):
            core.initialize_archive()
        core._archive_schema_ready = False
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            db.execute("INSERT INTO nutrition_foods(id,name,state,unit,allergens_json) VALUES ('f','Test','dry','g','[]')")
            db.execute("INSERT INTO nutrition_inventory_lots(id,food_id,quantity,initial_quantity,unit,location,received_at) VALUES ('lot','f',1000,1000,'g','pantry','2000-01-01')")
            db.commit()
        def fail(db):
            migration_11(db)
            raise RuntimeError('Synthetic failure')
        with patch.dict(MIGRATIONS,{11:fail}), self.assertRaises(RuntimeError):
            core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],10)
            self.assertNotIn('available_on',[r[1] for r in db.execute('PRAGMA table_info(nutrition_inventory_lots)')])
        core.initialize_archive()
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            self.assertEqual(db.execute('SELECT quantity,received_at,available_on FROM nutrition_inventory_lots').fetchone(),(1000,'2000-01-01',None))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])


if __name__ == "__main__":
    unittest.main()
