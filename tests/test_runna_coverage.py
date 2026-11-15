import unittest
from datetime import date

import server as core


class RunnaArchiveCoverageTests(unittest.TestCase):
    def test_recent_archive_does_not_claim_complete_thirty_day_history(self) -> None:
        result = core.runna_history_coverage(date(2026, 11, 7), "2026-10-31")

        self.assertEqual(result, {"coveredDays": 8, "expectedDays": 30, "complete": False})

    def test_archive_older_than_window_covers_full_period(self) -> None:
        result = core.runna_history_coverage(date(2026, 11, 7), "2026-10-01")

        self.assertEqual(result, {"coveredDays": 30, "expectedDays": 30, "complete": True})

    def test_missing_or_invalid_archive_date_has_no_coverage(self) -> None:
        for value in (None, "not-a-date"):
            with self.subTest(value=value):
                self.assertEqual(
                    core.runna_history_coverage(date(2026, 11, 7), value),
                    {"coveredDays": 0, "expectedDays": 30, "complete": False},
                )


if __name__ == "__main__":
    unittest.main()
