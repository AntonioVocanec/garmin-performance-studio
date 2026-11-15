from __future__ import annotations

import base64
import asyncio
import copy
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import server as core
from app import BloodLabAnalysis, analyze_blood_lab_report
from starlette.requests import Request


SAMPLE_ANALYSIS = {
    "reportDate": "2026-11-02",
    "laboratory": "Primjer laboratorija",
    "overview": "Primjer objašnjenja prema rasponu na nalazu.",
    "documents": [{"documentNumber": 1, "reportDate": "2026-11-02", "laboratory": "Primjer laboratorija", "note": "Krvna slika."}],
    "results": [
        {
            "testName": "Hemoglobin",
            "category": "Krvna slika",
            "valueText": "142",
            "numericValue": 142,
            "unit": "g/L",
            "referenceRange": "120–160 g/L",
            "labFlag": None,
            "interpretation": "Vrijednost je unutar raspona navedenog na ovom nalazu.",
            "confidence": "high",
            "pageNumber": 1,
            "needsReview": False,
            "sourceDocument": 1,
            "reportDate": "2026-11-02",
            "laboratory": "Primjer laboratorija",
        }
    ],
    "questionsForClinician": [],
    "explicitAlerts": [],
    "limitations": "Provjeri prijepis prema izvornom dokumentu.",
}


class BloodLabReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="blood-lab-test-")
        self.original_archive = core.ARCHIVE_PATH
        self.original_backups = core.BACKUP_DIR
        self.original_ready = core._archive_schema_ready
        root = Path(self.temp_dir.name)
        core.ARCHIVE_PATH = root / "archive.sqlite3"
        core.BACKUP_DIR = root / "backups"
        core._archive_schema_ready = False

    def tearDown(self) -> None:
        core.ARCHIVE_PATH = self.original_archive
        core.BACKUP_DIR = self.original_backups
        core._archive_schema_ready = self.original_ready
        self.temp_dir.cleanup()

    def test_saves_and_deletes_only_the_structured_report(self) -> None:
        saved = core.save_blood_lab_report(SAMPLE_ANALYSIS)
        self.assertEqual(saved["analysis"], SAMPLE_ANALYSIS)
        self.assertEqual(core.read_blood_lab_reports(), [saved])
        backup_path = core.backup_archive()
        self.assertTrue(core.delete_blood_lab_report(saved["id"]))
        self.assertEqual(core.read_blood_lab_reports(), [])
        with closing(sqlite3.connect(core.ARCHIVE_PATH)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM blood_lab_reports").fetchone()[0], 0)
        with closing(sqlite3.connect(backup_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM blood_lab_reports").fetchone()[0], 0)

    def test_uses_ephemeral_structured_responses_pdf_input(self) -> None:
        response_bytes = json.dumps({
            "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(SAMPLE_ANALYSIS)}]}]
        }).encode("utf-8")
        captured = {}

        def fake_urlopen(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return BytesIO(response_bytes)

        with patch.object(core, "OPENAI_API_KEY", "test-key"), patch.object(core, "urlopen", fake_urlopen):
            result = core.analyze_blood_lab_pdf(b"%PDF-1.7\nsynthetic")

        self.assertEqual(result, SAMPLE_ANALYSIS)
        self.assertEqual(captured["request"].full_url, "https://api.openai.com/v1/responses")
        self.assertEqual(captured["request"].get_header("Authorization"), "Bearer test-key")
        body = json.loads(captured["request"].data)
        self.assertIs(body["store"], False)
        self.assertEqual(body["text"]["format"]["type"], "json_schema")
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertNotIn("tools", body)
        file_input = next(item for item in body["input"][0]["content"] if item["type"] == "input_file")
        self.assertEqual(file_input["type"], "input_file")
        self.assertEqual(file_input["filename"], "laboratorijski-nalaz-1.pdf")
        self.assertEqual(base64.b64decode(file_input["file_data"].split(",", 1)[1]), b"%PDF-1.7\nsynthetic")

    def test_does_not_call_provider_without_key_or_for_invalid_pdf(self) -> None:
        with patch.object(core, "OPENAI_API_KEY", ""):
            with self.assertRaisesRegex(core.LabAnalysisError, "nije konfigurirana"):
                core.analyze_blood_lab_pdf(b"%PDF-1.7")

        with patch.object(core, "OPENAI_API_KEY", "test-key"), patch.object(core, "urlopen") as provider:
            with self.assertRaisesRegex(core.LabUploadError, "PDF zaglavlje"):
                core.analyze_blood_lab_pdf(b"not a pdf")
            provider.assert_not_called()

    def test_combines_pdf_inputs_without_collapsing_distinct_measurements(self) -> None:
        analysis = copy.deepcopy(SAMPLE_ANALYSIS)
        analysis["reportDate"] = None
        analysis["laboratory"] = None
        analysis["documents"].append({"documentNumber": 2, "reportDate": "2026-11-03", "laboratory": "Drugi laboratorij", "note": "Kontrolni nalaz."})
        second = dict(analysis["results"][0], sourceDocument=2, reportDate="2026-11-03", laboratory="Drugi laboratorij", valueText="140", numericValue=140)
        analysis["results"].append(second)
        response = json.dumps({"output_text": json.dumps(analysis)}).encode()
        documents = [b"%PDF-1.7 first", b"%PDF-1.7 second"]
        with patch.object(core, "OPENAI_API_KEY", "test-key"), patch.object(core, "urlopen", return_value=BytesIO(response)) as provider:
            result = core.analyze_blood_lab_pdfs(documents)
        self.assertEqual(result["results"], analysis["results"])
        provider.assert_called_once()
        body = json.loads(provider.call_args.args[0].data)
        files = [item for item in body["input"][0]["content"] if item["type"] == "input_file"]
        self.assertEqual([base64.b64decode(item["file_data"].split(",", 1)[1]) for item in files], documents)
        self.assertEqual([item["filename"] for item in files], ["laboratorijski-nalaz-1.pdf", "laboratorijski-nalaz-2.pdf"])
        self.assertIs(body["store"], False)
        saved = core.save_blood_lab_report(result)
        self.assertEqual(core.read_blood_lab_reports()[0]["analysis"]["documents"], analysis["documents"])
        self.assertTrue(core.delete_blood_lab_report(saved["id"]))

    def test_rejects_missing_or_invalid_result_provenance(self) -> None:
        for mutation in ("missing-document", "unknown-source"):
            analysis = copy.deepcopy(SAMPLE_ANALYSIS)
            if mutation == "missing-document":
                analysis["documents"] = []
            else:
                analysis["results"][0]["sourceDocument"] = 2
            response = json.dumps({"output_text": json.dumps(analysis)}).encode()
            with patch.object(core, "OPENAI_API_KEY", "test-key"), patch.object(core, "urlopen", return_value=BytesIO(response)):
                with self.assertRaises(core.LabAnalysisError):
                    core.analyze_blood_lab_pdfs([b"%PDF-1.7 test"])

    def test_decodes_batch_and_enforces_upload_limits_before_provider_call(self) -> None:
        pdf = b"%PDF-1.7 test"
        body = json.dumps({"files": [{"data": base64.b64encode(pdf).decode()} for _ in range(2)]}).encode()
        self.assertEqual(core.decode_blood_lab_upload("application/json", body), [pdf, pdf])
        self.assertEqual(core.decode_blood_lab_upload("application/pdf", pdf), [pdf])
        for payload in ({"files": []}, {"files": [{"data": "invalid base64!"}]}, {"files": [{"data": ""}]}, {"files": [{}] * 11}):
            with self.assertRaises(core.LabUploadError):
                core.decode_blood_lab_upload("application/json", json.dumps(payload).encode())
        with patch.object(core, "MAX_LAB_PDF_BYTES", 10):
            with self.assertRaisesRegex(core.LabUploadError, "15 MB"):
                core.validate_blood_lab_pdfs([pdf])
        with patch.object(core, "MAX_LAB_TOTAL_PDF_BYTES", len(pdf)):
            with self.assertRaisesRegex(core.LabUploadError, "30 MB"):
                core.validate_blood_lab_pdfs([pdf, pdf])

    def test_batch_endpoint_and_old_archives_remain_compatible(self) -> None:
        body = json.dumps({"files": [{"data": base64.b64encode(b"%PDF-1.7 test").decode()}]}).encode()
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        request = Request({"type": "http", "headers": [(b"content-type", b"application/json")]}, receive)
        with patch.object(core, "OPENAI_API_KEY", "test-key"), patch.object(core, "analyze_blood_lab_pdfs", return_value=SAMPLE_ANALYSIS) as analyzer:
            response = asyncio.run(analyze_blood_lab_report(request, "true"))
        analyzer.assert_called_once_with([b"%PDF-1.7 test"])
        self.assertEqual(response["analysis"], SAMPLE_ANALYSIS)
        legacy = copy.deepcopy(SAMPLE_ANALYSIS)
        del legacy["documents"]
        for key in ("sourceDocument", "reportDate", "laboratory"):
            del legacy["results"][0][key]
        self.assertEqual(BloodLabAnalysis.model_validate(legacy).documents, [])

    def test_explains_exhausted_credits_instead_of_suggesting_a_temporary_retry(self) -> None:
        error = HTTPError("https://api.openai.com/v1/responses", 429, "Too Many Requests", {}, BytesIO(json.dumps({"error": {"code": "credit_balance_exhausted", "type": "insufficient_quota"}}).encode()))
        with patch.object(core, "OPENAI_API_KEY", "test-key"), patch.object(core, "urlopen", side_effect=error):
            with self.assertRaisesRegex(core.LabAnalysisError, "Dodaj kredite"):
                core.analyze_blood_lab_pdfs([b"%PDF-1.7 test"])


if __name__ == "__main__":
    unittest.main()
