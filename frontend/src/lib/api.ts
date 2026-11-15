export interface DashboardSource {
  ok: boolean;
  configured?: boolean;
  partial?: boolean;
  status?: number | null;
  count?: number;
  message?: string;
  fetchedAt?: string | null;
  cacheHit?: boolean;
  cacheAgeSeconds?: number | null;
}

export interface DashboardPayload {
  ok: true;
  date: string;
  generatedAt: string;
  range?: { start?: string; end?: string; activityStart?: string };
  sources?: Record<string, DashboardSource>;
  normalized: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface JournalEntry {
  date: string;
  rpe: number | null;
  fatigue: number | null;
  soreness: number | null;
  mood: number | null;
  notes: string;
  updatedAt?: string;
}

export interface JournalResponse {
  ok: true;
  date: string;
  entry: JournalEntry | null;
  history: JournalEntry[];
  events: LifeEvent[];
  eventHistory?: LifeEvent[];
}

export interface BloodLabResult {
  testName: string;
  category: string;
  valueText: string;
  numericValue: number | null;
  unit: string | null;
  referenceRange: string | null;
  labFlag: string | null;
  interpretation: string;
  confidence: "high" | "medium" | "low";
  pageNumber: number | null;
  needsReview: boolean;
  sourceDocument?: number | null;
  reportDate?: string | null;
  laboratory?: string | null;
  userVerified?: boolean;
  userVerifiedAt?: string | null;
  interpretationStale?: boolean;
  correctionHistory?: Array<Record<string, unknown>>;
}

export interface BloodLabDocument {
  documentNumber: number;
  reportDate: string | null;
  laboratory: string | null;
  note: string;
}

export interface BloodLabAnalysis {
  reportDate: string | null;
  laboratory: string | null;
  overview: string;
  documents?: BloodLabDocument[];
  results: BloodLabResult[];
  questionsForClinician: string[];
  explicitAlerts: string[];
  limitations: string;
  overviewStale?: boolean;
}

export interface SavedBloodLabReport {
  id: string;
  analysis: BloodLabAnalysis;
  createdAt: string;
}

export interface BloodLabReportsResponse {
  ok: true;
  aiConfigured: boolean;
  model: string | null;
  aiStatus?: { configured: boolean; state: string; checkedAt: string | null; message: string | null };
  reports: SavedBloodLabReport[];
}

export interface LifeEvent {
  id: string;
  date: string;
  time: string | null;
  category: string;
  impact: number;
  note: string;
  createdAt: string;
}

export type JournalInput = Omit<JournalEntry, "updatedAt">;

export class DashboardApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "DashboardApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new DashboardApiError("Dashboard nije dostupan. Provjeri vezu i pokušaj ponovno.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DashboardApiError(`Dashboard je vratio neispravan odgovor (${response.status}).`, response.status);
  }

  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    const message = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `Zahtjev nije uspio (${response.status}).`;
    throw new DashboardApiError(message, response.status);
  }
  return payload as T;
}

export function getDashboard(date: string, force = false, signal?: AbortSignal): Promise<DashboardPayload> {
  const query = new URLSearchParams({ date });
  if (force) query.set("force", "1");
  return requestJson<DashboardPayload>(`/api/dashboard?${query}`, { signal });
}

export function getSkinTemperature(date: string, force = false, signal?: AbortSignal): Promise<{
  ok: true;
  partial: boolean;
  message: string | null;
  data: {
    date: string;
    periodStart: string;
    periodEnd: string;
    currentDeviationC: number | null;
    meanDeviationC: number | null;
    medianDeviationC: number | null;
    nightsAvailable: number;
    nightsExpected: number;
    calibrationDays: number | null;
    calibrationStatus: string | null;
    history: Array<{ date: string; deviationC: number | null; calibrationDays: number | null }>;
  };
}> {
  const query = new URLSearchParams({ date });
  if (force) query.set("force", "1");
  return requestJson(`/api/skin-temperature?${query}`, { signal });
}

export function getGarminProfile(date: string, force = false, signal?: AbortSignal): Promise<{
  ok: true;
  partial: boolean;
  message: string | null;
  data: {
    date: string;
    gear: { items: Array<Record<string, unknown>>; count: number; activeCount: number; retiredCount: number; available: boolean };
    racePredictions: { date: string | null; predictions: Array<{ label: string; timeSeconds: number }> } | null;
    runningEconomy: { date: string; score: number; classification: string; history: Array<{ date: string; score: number }> } | null;
    ecg: { readings: Array<Record<string, unknown>>; latest: Record<string, unknown> | null; waveform: { samples: number[]; sampleRate: number | null; sampleStride: number; sampleCount: number; durationSeconds: number | null } | null };
    personalRecords: Array<Record<string, unknown>>;
    bodyComposition: { latest: Record<string, unknown> | null; previous: Record<string, unknown> | null; changeKg: number | null; sampleCount: number; history: Array<{ date: string; weightKg: number | null }> };
  };
}> {
  const query = new URLSearchParams({ date });
  if (force) query.set("force", "1");
  return requestJson(`/api/garmin-profile?${query}`, { signal });
}

export function getEcgDetail(ecgId: string, force = false, signal?: AbortSignal): Promise<{
  ok: true;
  data: {
    reading: Record<string, unknown>;
    waveform: { date: string | null; samples: number[]; sampleRate: number | null; sampleStride: number; sampleCount: number; durationSeconds: number | null } | null;
  };
}> {
  const query = new URLSearchParams();
  if (force) query.set("force", "1");
  const suffix = query.size ? `?${query}` : "";
  return requestJson(`/api/ecg/${encodeURIComponent(ecgId)}${suffix}`, { signal });
}

export function getActivityDetails(activityId: string, force = false, signal?: AbortSignal): Promise<{
  ok: true;
  activity: Record<string, unknown>;
  detail: Record<string, unknown>;
  localRpe: ActivityRpeEntry | null;
  message: string | null;
}> {
  const query = new URLSearchParams();
  if (force) query.set("force", "1");
  const suffix = query.size ? `?${query}` : "";
  return requestJson(`/api/activities/${encodeURIComponent(activityId)}${suffix}`, { signal });
}

export function getJournal(date: string, signal?: AbortSignal): Promise<JournalResponse> {
  const query = new URLSearchParams({ date });
  return requestJson<JournalResponse>(`/api/journal?${query}`, { signal });
}

export function saveJournal(entry: JournalInput): Promise<JournalResponse> {
  return requestJson<JournalResponse>("/api/journal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}

export function saveLifeEvent(event: Omit<LifeEvent, "id" | "createdAt">): Promise<JournalResponse> {
  return requestJson<JournalResponse>("/api/journal/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

export function deleteLifeEvent(id: string): Promise<{ ok: true }> {
  return requestJson(`/api/journal/events/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getBloodLabReports(signal?: AbortSignal): Promise<BloodLabReportsResponse> {
  return requestJson<BloodLabReportsResponse>("/api/lab-reports", { signal });
}

export async function analyzeBloodLabPdfs(files: readonly File[], signal?: AbortSignal): Promise<{
  ok: true;
  analysis: BloodLabAnalysis;
  model: string;
}> {
  const documents = await Promise.all(files.map((file) => new Promise<{ data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: String(reader.result).split(",", 2)[1] });
    reader.onerror = () => reject(new Error("PDF nije moguće pročitati. Ponovno odaberi datoteku."));
    reader.onabort = () => reject(new Error("Čitanje PDF-a je prekinuto."));
    reader.readAsDataURL(file);
  })));
  return requestJson("/api/lab-reports/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Health-Analysis-Consent": "true" },
    body: JSON.stringify({ files: documents }),
    signal,
  });
}

export function saveBloodLabReport(analysis: BloodLabAnalysis): Promise<{
  ok: true;
  report: SavedBloodLabReport;
}> {
  return requestJson("/api/lab-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(analysis),
  });
}

export function correctBloodLabResult(reportId: string, resultIndex: number, changes: Record<string, unknown>): Promise<{
  ok: true;
  report: SavedBloodLabReport;
}> {
  return requestJson(`/api/lab-reports/${encodeURIComponent(reportId)}/results/${resultIndex}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function deleteBloodLabReport(id: string): Promise<{ ok: true }> {
  return requestJson(`/api/lab-reports/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface ActivityRpeEntry {
  rpe: number;
  note: string;
  updatedAt: string;
}

export function saveActivityRpe(activityId: string, entry: { rpe: number | null; note: string }): Promise<{
  ok: true;
  activityId: string;
  date: string;
  activityName: string;
  entry: ActivityRpeEntry | null;
}> {
  return requestJson(`/api/activities/${encodeURIComponent(activityId)}/rpe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}
