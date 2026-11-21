from __future__ import annotations

import sqlite3
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from datetime import date
from pathlib import Path
import threading
from typing import Annotated, Literal
from urllib.parse import unquote

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

import server as core
from weather_forecast import ForecastUnavailable, forecast

logger = logging.getLogger("garmin-dashboard.backups")
_lab_ai_status_lock = threading.Lock()
_lab_ai_last_status: dict[str, object] = {"state": "not_checked", "checkedAt": None, "message": None}


def _record_lab_ai_status(state: str, message: str | None = None) -> None:
    checked_at = core.datetime.now(core.LOCAL_TZ).isoformat(timespec="seconds")
    with _lab_ai_status_lock:
        _lab_ai_last_status.update({"state": state, "checkedAt": checked_at, "message": message})


def _read_lab_ai_status() -> dict[str, object]:
    with _lab_ai_status_lock:
        return dict(_lab_ai_last_status)


async def _periodic_backups() -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)
        try:
            path = await asyncio.to_thread(core.backup_archive)
            logger.info("SQLite backup completed: %s", path.name)
        except (OSError, sqlite3.Error):
            logger.exception("Automatic SQLite backup failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    core.initialize_archive()
    with core.archive_connection() as db:
        db.execute("UPDATE nutrition_ai_requests SET state='interrupted',error='Prethodni proces je prekinut; provjeri ishod prije novog zahtjeva.' WHERE state='running'")
    try:
        path = await asyncio.to_thread(core.backup_archive)
        logger.info("SQLite backup completed: %s", path.name)
    except (OSError, sqlite3.Error):
        logger.exception("Startup SQLite backup failed")
    task = asyncio.create_task(_periodic_backups())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Garmin Performance Studio API",
    description="Lokalni API za Garmin sažetke, Runna raspored i osobni dnevnik.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


class JournalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    rpe: float | None = Field(default=None, ge=0, le=10)
    fatigue: float | None = Field(default=None, ge=0, le=10)
    soreness: float | None = Field(default=None, ge=0, le=10)
    mood: int | None = Field(default=None, ge=1, le=5)
    notes: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_date(self) -> JournalInput:
        if self.date > core.iso_today():
            raise ValueError("Dnevnik se može spremiti za današnji ili raniji datum.")
        return self


class LifeEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    category: Literal["sauna", "illness", "travel", "alcohol", "caffeine", "stress", "physical_load", "recovery", "other"]
    impact: int = Field(ge=1, le=5)
    note: str = Field(default="", max_length=240)

    @model_validator(mode="after")
    def validate_date(self) -> LifeEventInput:
        if self.date > core.iso_today():
            raise ValueError("Događaj se može spremiti za današnji ili raniji datum.")
        return self


class ActivityRpeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rpe: int | None = Field(default=None, ge=0, le=10)
    note: str = Field(default="", max_length=240)


class BloodLabResult(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    test_name: str = Field(alias="testName", min_length=1, max_length=180)
    category: str = Field(max_length=80)
    value_text: str = Field(alias="valueText", max_length=100)
    numeric_value: float | None = Field(alias="numericValue", default=None, allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=40)
    reference_range: str | None = Field(alias="referenceRange", default=None, max_length=160)
    lab_flag: str | None = Field(alias="labFlag", default=None, max_length=80)
    interpretation: str = Field(max_length=1000)
    confidence: Literal["high", "medium", "low"]
    page_number: int | None = Field(alias="pageNumber", default=None, ge=1, le=1000)
    needs_review: bool = Field(alias="needsReview")
    source_document: int | None = Field(alias="sourceDocument", default=None, ge=1, le=core.MAX_LAB_PDF_FILES)
    report_date: date | None = Field(alias="reportDate", default=None)
    laboratory: str | None = Field(default=None, max_length=160)
    user_verified: bool = Field(alias="userVerified", default=False)
    user_verified_at: str | None = Field(alias="userVerifiedAt", default=None, max_length=40)
    interpretation_stale: bool = Field(alias="interpretationStale", default=False)
    correction_history: list[dict[str, object]] = Field(alias="correctionHistory", default_factory=list, max_length=1000)


class BloodLabDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    document_number: int = Field(alias="documentNumber", ge=1, le=core.MAX_LAB_PDF_FILES)
    report_date: date | None = Field(alias="reportDate", default=None)
    laboratory: str | None = Field(default=None, max_length=160)
    note: str = Field(default="", max_length=1500)


class BloodLabAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    report_date: date | None = Field(alias="reportDate", default=None)
    laboratory: str | None = Field(default=None, max_length=160)
    overview: str = Field(max_length=3000)
    documents: list[BloodLabDocument] = Field(default_factory=list, max_length=core.MAX_LAB_PDF_FILES)
    results: list[BloodLabResult] = Field(max_length=1000)
    questions_for_clinician: list[str] = Field(alias="questionsForClinician", max_length=30)
    explicit_alerts: list[str] = Field(alias="explicitAlerts", max_length=20)
    limitations: str = Field(max_length=1500)
    overview_stale: bool = Field(alias="overviewStale", default=False)

    @model_validator(mode="after")
    def validate_document_sources(self):
        numbers = [document.document_number for document in self.documents]
        if len(numbers) != len(set(numbers)):
            raise ValueError("Brojevi izvornih nalaza moraju biti jedinstveni.")
        if numbers and any(item.source_document not in numbers for item in self.results):
            raise ValueError("Svaka stavka mora pripadati izvornom nalazu.")
        if not numbers and any(item.source_document is not None for item in self.results):
            raise ValueError("Nedostaje popis izvornih nalaza.")
        return self


class BloodLabCorrectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    test_name: str | None = Field(default=None, alias="testName", min_length=1, max_length=180)
    category: str | None = Field(default=None, max_length=80)
    value_text: str | None = Field(default=None, alias="valueText", min_length=1, max_length=100)
    numeric_value: float | None = Field(default=None, alias="numericValue", allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=40)
    reference_range: str | None = Field(default=None, alias="referenceRange", max_length=160)
    lab_flag: str | None = Field(default=None, alias="labFlag", max_length=80)
    confirm_against_original: bool = Field(default=False, alias="confirmAgainstOriginal")

    @model_validator(mode="after")
    def validate_action(self) -> BloodLabCorrectionInput:
        editable = {"test_name", "category", "value_text", "numeric_value", "unit", "reference_range", "lab_flag"}
        if not self.confirm_against_original and not (self.model_fields_set & editable):
            raise ValueError("Navedi ispravak ili potvrdi usporedbu s izvornikom.")
        if self.confirm_against_original and self.model_fields_set & editable:
            raise ValueError("Potvrdu izvornika spremi odvojeno od ispravka.")
        if {"test_name", "category", "value_text"} & self.model_fields_set:
            if self.test_name is None and "test_name" in self.model_fields_set:
                raise ValueError("Naziv pretrage ne može biti prazan.")
            if self.category is None and "category" in self.model_fields_set:
                raise ValueError("Kategorija ne može biti prazna.")
            if self.value_text is None and "value_text" in self.model_fields_set:
                raise ValueError("Vrijednost očitanja ne može biti prazna.")
        return self


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = str(exc.detail) if isinstance(exc.detail, str) else "Zahtjev nije uspio."
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": message}, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {"loc": error.get("loc"), "msg": error.get("msg"), "type": error.get("type")}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"ok": False, "error": "Podaci zahtjeva nisu valjani.", "details": details},
    )


@app.middleware("http")
async def cap_journal_request_size(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/api/lab-reports/analyze":
        try:
            content_length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Neispravna veličina PDF-a."})
        limit = core.MAX_LAB_PDF_BYTES if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() == "application/pdf" else core.MAX_LAB_UPLOAD_BYTES
        if content_length < 0:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Neispravna veličina zahtjeva."})
        if content_length > limit:
            return JSONResponse(status_code=413, content={"ok": False, "error": "Odabrani PDF nalazi premašuju dopuštenu veličinu."})
    elif (request.method == "POST" and request.url.path in {"/api/journal", "/api/journal/events"}) or (
        request.method == "POST" and request.url.path.startswith("/api/activities/") and request.url.path.endswith("/rpe")
    ) or (
        request.method == "PUT" and request.url.path.startswith("/api/lab-reports/") and "/results/" in request.url.path
    ):
        try:
            content_length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Neispravna veličina zahtjeva."})
        if content_length > 4096:
            return JSONResponse(status_code=413, content={"ok": False, "error": "Zahtjev je prevelik."})
    return await call_next(request)


@app.get("/api/lab-reports", tags=["health"])
def get_blood_lab_reports() -> dict[str, object]:
    try:
        return {
            "ok": True,
            "aiConfigured": bool(core.OPENAI_API_KEY),
            "model": core.OPENAI_LAB_MODEL if core.OPENAI_API_KEY else None,
            "aiStatus": {
                **_read_lab_ai_status(),
                "configured": bool(core.OPENAI_API_KEY),
            },
            "reports": core.read_blood_lab_reports(),
        }
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Lokalna arhiva krvnih nalaza nije dostupna.") from exc


@app.post("/api/lab-reports/analyze", tags=["health"])
async def analyze_blood_lab_report(
    request: Request,
    x_health_analysis_consent: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    if x_health_analysis_consent != "true":
        raise HTTPException(status_code=403, detail="Potrebna je izričita suglasnost za slanje PDF-a AI analizi.")
    if not core.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI analiza nije konfigurirana. Dodaj OPENAI_API_KEY u .env i ponovno pokreni dashboard.")
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in {"application/pdf", "application/json"}:
        raise HTTPException(status_code=415, detail="Pošalji PDF nalaz ili skup PDF nalaza.")
    limit = core.MAX_LAB_PDF_BYTES if content_type == "application/pdf" else core.MAX_LAB_UPLOAD_BYTES
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(status_code=413, detail="Odabrani PDF nalazi premašuju dopuštenu veličinu.")
        body.extend(chunk)
    try:
        documents = core.decode_blood_lab_upload(content_type, body)
    except core.LabUploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    try:
        _record_lab_ai_status("checking", "Analiza je u tijeku.")
        analysis = await asyncio.to_thread(core.analyze_blood_lab_pdfs, documents)
        validated = BloodLabAnalysis.model_validate(analysis)
        _record_lab_ai_status("success", "Zadnja analiza uspješno je dovršena.")
        return {"ok": True, "analysis": validated.model_dump(mode="json", by_alias=True, exclude_unset=True), "model": core.OPENAI_LAB_MODEL}
    except core.LabAnalysisError as exc:
        message = str(exc)
        state = "quota" if "kredita" in message.lower() or "kvote" in message.lower() or "limit potrošnje" in message.lower() else "access_error" if "ključ" in message.lower() or "pristup" in message.lower() else "request_error"
        _record_lab_ai_status(state, message)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        _record_lab_ai_status("invalid_response", "AI odgovor nije valjan. PDF nije spremljen.")
        logger.error("Blood lab AI response could not be validated")
        raise HTTPException(status_code=502, detail="AI odgovor nije valjan. PDF nije spremljen.") from exc


@app.post("/api/lab-reports", tags=["health"])
def save_blood_lab_report(payload: BloodLabAnalysis) -> dict[str, object]:
    try:
        report = core.save_blood_lab_report(payload.model_dump(mode="json", by_alias=True))
        return {"ok": True, "report": report}
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Nalaz nije spremljen u lokalnu arhivu.") from exc


@app.put("/api/lab-reports/{report_id}/results/{result_index}", tags=["health"])
def correct_blood_lab_result(
    report_id: str,
    result_index: int,
    payload: BloodLabCorrectionInput,
) -> dict[str, object]:
    if len(report_id) != 32 or not report_id.isascii() or not all(char in "0123456789abcdef" for char in report_id):
        raise HTTPException(status_code=400, detail="ID nalaza nije valjan.")
    if not 0 <= result_index < 1000:
        raise HTTPException(status_code=400, detail="Indeks laboratorijskog rezultata nije valjan.")
    changes = payload.model_dump(mode="json", by_alias=True, exclude_unset=True, exclude={"confirm_against_original"})
    try:
        report = core.update_blood_lab_result(
            report_id,
            result_index,
            changes,
            confirm_against_original=payload.confirm_against_original,
        )
        if report is None:
            raise HTTPException(status_code=404, detail="Nalaz nije pronađen.")
        return {"ok": True, "report": report}
    except IndexError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Korekciju nije moguće spremiti u lokalnu arhivu.") from exc


@app.delete("/api/lab-reports/{report_id}", tags=["health"])
def remove_blood_lab_report(report_id: str) -> dict[str, bool]:
    if len(report_id) != 32 or not report_id.isascii() or not all(char in "0123456789abcdef" for char in report_id):
        raise HTTPException(status_code=400, detail="ID nalaza nije valjan.")
    try:
        if not core.delete_blood_lab_report(report_id):
            raise HTTPException(status_code=404, detail="Nalaz nije pronađen.")
        return {"ok": True}
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Nalaz nije moguće ukloniti iz arhive.") from exc


@app.get("/api/weather/forecast", tags=["weather"])
def weather_forecast() -> dict:
    try:
        return forecast.get()
    except ForecastUnavailable as exc:
        raise HTTPException(status_code=503, detail="Prognoza trenutačno nije dostupna") from exc


@app.get("/api/health", tags=["status"])
def health() -> dict[str, bool]:
    return {"ok": bool(core.API_KEY), "baseUrlConfigured": bool(core.BASE_URL)}


@app.get("/api/journal", tags=["journal"])
def get_journal(date_query: Annotated[str | None, Query(alias="date")] = None) -> dict[str, object]:
    try:
        target = core.parse_requested_date({"date": [date_query or ""]})
        return core.read_daily_journal(target)
    except core.GarminError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Lokalni dnevnik trenutno nije dostupan.") from exc


@app.post("/api/journal", tags=["journal"])
def post_journal(payload: JournalInput) -> dict[str, object]:
    try:
        return core.save_daily_journal(payload.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Dnevnik nije spremljen u lokalnu bazu.") from exc


@app.post("/api/journal/events", tags=["journal"])
def post_life_event(payload: LifeEventInput) -> dict[str, object]:
    try:
        return core.save_life_event(payload.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Događaj nije spremljen u lokalnu bazu.") from exc


@app.delete("/api/journal/events/{event_id}", tags=["journal"])
def remove_life_event(event_id: str) -> dict[str, bool]:
    if len(event_id) > 64 or not event_id.isascii():
        raise HTTPException(status_code=400, detail="ID događaja nije valjan.")
    try:
        if not core.delete_life_event(event_id):
            raise HTTPException(status_code=404, detail="Događaj nije pronađen.")
        return {"ok": True}
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Događaj nije moguće ukloniti.") from exc


@app.get("/api/activities/{activity_id}/rpe", tags=["activities"])
def get_activity_rpe(activity_id: str) -> dict[str, object]:
    if not activity_id.isascii() or not activity_id.isdigit() or len(activity_id) > 20:
        raise HTTPException(status_code=400, detail="ID aktivnosti nije valjan.")
    try:
        return core.read_activity_rpe(activity_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="RPE zapis nije dostupan.") from exc


@app.post("/api/activities/{activity_id}/rpe", tags=["activities"])
def post_activity_rpe(activity_id: str, payload: ActivityRpeInput) -> dict[str, object]:
    if not activity_id.isascii() or not activity_id.isdigit() or len(activity_id) > 20:
        raise HTTPException(status_code=400, detail="ID aktivnosti nije valjan.")
    try:
        return core.save_activity_rpe(activity_id, payload.model_dump(mode="json"))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="RPE nije spremljen u lokalnu bazu.") from exc


@app.get("/api/dashboard", tags=["dashboard"])
def get_dashboard(
    date_query: Annotated[str | None, Query(alias="date")] = None,
    force: bool = False,
) -> dict[str, object]:
    try:
        target = core.parse_requested_date({"date": [date_query or ""]})
        return core.build_dashboard(target, force_refresh=force)
    except core.GarminError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/skin-temperature", tags=["health"])
def get_skin_temperature(
    date_query: Annotated[str | None, Query(alias="date")] = None,
    force: bool = False,
) -> dict[str, object]:
    try:
        target = core.parse_requested_date({"date": [date_query or ""]})
        return core.safe_garmin_skin_temperature_call(target, force_refresh=force)
    except core.GarminError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/garmin-profile", tags=["health", "activities"])
def get_garmin_profile(
    date_query: Annotated[str | None, Query(alias="date")] = None,
    force: bool = False,
) -> dict[str, object]:
    try:
        target = core.parse_requested_date({"date": [date_query or ""]})
        return core.safe_garmin_connect_profile_call(target, force_refresh=force)
    except core.GarminError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/ecg/{ecg_id}", tags=["health"])
def get_ecg_detail(ecg_id: str, force: bool = False) -> dict[str, object]:
    if not ecg_id or len(ecg_id) > 128 or not ecg_id.isascii() or not all(char.isalnum() or char in "-_" for char in ecg_id):
        raise HTTPException(status_code=400, detail="ID ECG očitanja nije valjan.")
    return core.safe_garmin_ecg_detail_call(ecg_id, force_refresh=force)


@app.get("/api/activities/{activity_id}", tags=["activities"])
def get_activity_detail(activity_id: str, force: bool = False) -> dict[str, object]:
    if not activity_id.isascii() or not activity_id.isdigit() or len(activity_id) > 20:
        raise HTTPException(status_code=400, detail="ID aktivnosti nije valjan.")
    try:
        with core.archive_connection() as db:
            row = db.execute(
                """SELECT activity_id, activity_date, name, sport, is_run,
                          distance_meters, duration_seconds, pace_seconds_per_km,
                          average_heart_rate, training_load, elevation_gain
                   FROM activities WHERE activity_id=?""",
                (activity_id,),
            ).fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Lokalna arhiva aktivnosti nije dostupna.") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="Aktivnost nije pronađena u dostupnoj povijesti.")

    activity = core.normalize_activity_item({
        "activityId": row[0],
        "startTimeLocal": row[1],
        "activityName": row[2],
        "activityType": {"typeKey": row[3]},
        "distanceInMeters": row[5],
        "durationInSeconds": row[6],
        "averageHeartRate": row[8],
        "activityTrainingLoad": row[9],
        "elevationGain": row[10],
    })
    paths = {
        "summary": (f"activity-service/activity/{activity_id}", None),
        "chart": (
            f"activity-service/activity/{activity_id}/details",
            {"maxChartSize": 1200, "maxPolylineSize": 0, "maxHeatMapSize": 0},
        ),
        "workouts": (f"activity-service/activity/{activity_id}/workouts", None),
    }
    with core.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            name: pool.submit(core.safe_call, path, params, force)
            for name, (path, params) in paths.items()
        }
        results = {name: future.result() for name, future in futures.items()}
    summary_data = results["summary"].get("data") if results["summary"].get("ok") else {}
    chart_data = results["chart"].get("data") if results["chart"].get("ok") else {}
    workouts_data = results["workouts"].get("data") if results["workouts"].get("ok") else []
    gear_result = core.safe_garmin_activity_gear_call(activity_id, force_refresh=force)
    detail = core.normalize_activity_details(summary_data, chart_data, workouts_data)
    detail["gear"] = gear_result.get("data") if gear_result.get("ok") else {
        "available": False, "items": [], "linkedCount": 0,
        "message": gear_result.get("message") or "Garmin Connect oprema nije dostupna za ovu aktivnost.",
    }
    gear_items = detail["gear"].get("items", []) if isinstance(detail.get("gear"), dict) else []
    try:
        local_rpe = core.read_activity_rpe(activity_id).get("entry")
    except sqlite3.Error:
        local_rpe = None
    return {
        "ok": True,
        "activity": activity,
        "detail": detail,
        "localRpe": local_rpe,
        "gearSource": {
            "ok": bool(gear_result.get("ok")),
            "count": len(gear_items),
            "message": gear_result.get("message"),
        },
        "message": None if detail.get("traceAvailable") else "Garmin nije vratio vremenske uzorke pulsa za ovu aktivnost.",
    }


def frontend_index() -> Path:
    built = core.ROOT / "dist" / "index.html"
    return built if built.is_file() else core.ROOT / "index.html"


from nutrition.routes import create_router as create_nutrition_router
app.include_router(create_nutrition_router(core))
from studio_analytics.routes import create_router as create_analytics_router
app.include_router(create_analytics_router(core, get_activity_detail))


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(frontend_index(), media_type="text/html", headers={"Cache-Control": "no-cache"})


@app.get("/{asset_path:path}", include_in_schema=False)
def static_asset(asset_path: str) -> FileResponse:
    decoded = unquote(asset_path).replace("\\", "/")
    if not decoded or decoded.startswith("api/") or any(part in (".", "..") for part in decoded.split("/")):
        raise HTTPException(status_code=404, detail="Not found")

    for static_root in (core.ROOT / "dist", core.ROOT / "public"):
        resolved_root = static_root.resolve()
        candidate = (static_root / decoded).resolve()
        try:
            candidate.relative_to(resolved_root)
        except ValueError:
            continue
        if candidate.is_file():
            headers = {"X-Content-Type-Options": "nosniff"}
            if decoded == "service-worker.js":
                headers.update({"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})
            elif decoded.startswith("assets/"):
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                headers["Cache-Control"] = "no-cache"
            media_type = "application/manifest+json" if decoded == "manifest.webmanifest" else None
            return FileResponse(candidate, media_type=media_type, headers=headers)

    raise HTTPException(status_code=404, detail="Not found")
