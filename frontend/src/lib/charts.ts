import * as echarts from "echarts/core";
import type { EChartsCoreOption as EChartsOption, EChartsType } from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([AriaComponent, BarChart, CanvasRenderer, DataZoomComponent, GridComponent, LegendComponent, LineChart, ScatterChart, TooltipComponent]);

const chartReferenceColor = "#82979f";

/** Nutrition dates are independent of the Performance history-window override. */
export function renderNutritionSeries(id: string, points: Record<string, unknown>[], series: {key:string;label:string;color:string}[], unit: string, title='Prehrana'): void {
  const target=prepareTarget(id,points,`${title} · ${series.map(s=>s.label).join(', ')} · ${unit}`,220,points.filter(p=>series.some(s=>p[s.key]!=null)).length);
  if(!target)return;
  setChartInspector(target,title,points,'date',series.map(s=>({label:s.label,value:p=>valueOf(p,s.key)==null?'—':`${valueOf(p,s.key)?.toLocaleString('hr-HR',{maximumFractionDigits:1})} ${unit}`})));
  const chart=echarts.getInstanceByDom(target);
  chart?.setOption({backgroundColor:'transparent',aria:{enabled:true},tooltip:{trigger:'axis'},legend:{bottom:0,textStyle:{color:'#94a9ae'}},grid:{left:48,right:16,top:20,bottom:55},xAxis:{type:'category',data:points.map(p=>String(p.date).slice(5)),axisLabel:{color:'#94a9ae'}},yAxis:{type:'value',name:unit,axisLabel:{color:'#94a9ae'},splitLine:{lineStyle:{color:'#24363e'}}},series:series.map(s=>({name:s.label,type:'line',connectNulls:false,data:points.map(p=>p[s.key]??null),lineStyle:{color:s.color,width:2.5},itemStyle:{color:s.color},emphasis:{focus:'series',lineStyle:{width:4}},blur:{lineStyle:{opacity:.15}}}))} as EChartsOption);
  chart?.resize();
  if(chart){bindTimeSeriesInteractions(chart,target,points,'date',undefined,p=>series.map(s=>`${s.label}: ${valueOf(p,s.key)??'—'} ${unit}`).join('; '));bindDateHover(chart,target,points,'date')}
}

export function renderAnalyticsSeries(id:string,points:Record<string,unknown>[],series:{key:string;label:string;color:string}[],unit:string,title:string):void {
  renderNutritionSeries(id,points,series,unit,title);
  const target=document.getElementById(id);
  if(target){target.setAttribute('aria-label',title);echarts.getInstanceByDom(target)?.setOption({series:series.map(()=>({connectNulls:false,smooth:false,emphasis:{focus:'series',lineStyle:{width:4}},blur:{lineStyle:{opacity:0.25}}}))});}
}

export function renderRunningOverlay(id:string,runs:{name:string;trace?:Record<string,unknown>[]}[],metric:string):void {
 const points=runs.flatMap(r=>r.trace??[]);const target=prepareTarget(id,points,'Usporedba trčanja po proteklom vremenu',260,points.filter(p=>p[metric]!=null).length);if(!target)return;
 const colors=['#69d7ef','#b9a2fa','#d9a6c8','#78bce8','#c6b4e8'];const chart=echarts.getInstanceByDom(target);
 chart?.setOption({aria:{enabled:true},tooltip:{trigger:'axis'},legend:{bottom:0,textStyle:{color:'#acbdc4'}},grid:{left:50,right:20,top:30,bottom:70},xAxis:{type:'value',name:'Minute',axisLabel:{color:'#acbdc4',formatter:(s:number)=>(s/60).toFixed(0)}},yAxis:{type:'value',name:metric==='heartRate'?'bpm':'s/km',scale:true,axisLabel:{color:'#acbdc4'},splitLine:{lineStyle:{color:'#29383e'}}},series:runs.map((r,i)=>({name:r.name,type:'line',showSymbol:false,connectNulls:false,lineStyle:{color:colors[i],width:2.5},itemStyle:{color:colors[i]},emphasis:{focus:'series',lineStyle:{width:4}},data:(r.trace??[]).map(p=>[p.elapsedSeconds,p[metric]??null])}))},{notMerge:true});chart?.resize();
}

type Point = Record<string, unknown>;
type ValueFormatter = (value: number) => string;

interface LineChartOptions {
  color: string;
  height?: number;
  unit?: string;
  referenceLine?: { value: number; label?: string; color?: string; context?: string };
  dateKey?: string;
  ariaLabel: string;
  formatValue?: ValueFormatter;
  zoom?: boolean;
  connectNulls?: boolean;
  sourceLabel?: string;
  endDateKey?: string;
}

interface IntradayLineChartOptions {
  color: string;
  height?: number;
  unit?: string;
  ariaLabel: string;
  formatValue?: ValueFormatter;
  sourceLabel?: string;
}

interface ChartContextOptions {
  dateKey?: string;
  endDateKey?: string;
  periodLabel?: string;
  sourceLabel?: string;
  unit?: string;
  referenceLabel?: string;
}

interface TimelineSeries {
  key: string;
  label: string;
  color: string;
  formatValue?: ValueFormatter;
  initiallySelected?: boolean;
}

interface TimelineChartOptions extends ChartContextOptions {
  ariaLabel: string;
  height?: number;
  zoom?: boolean;
  unit?: string;
}

interface CorrelationPoint extends Point {
  date: string;
  x: number;
  y: number;
}

interface CorrelationChartOptions {
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  xColor: string;
  yColor: string;
  xFormat: ValueFormatter;
  yFormat: ValueFormatter;
  regression?: { slope: number; intercept: number } | null;
  sourceLabel?: string;
}

interface InspectorColumn {
  label: string;
  value: (point: Point) => string;
  exportValue?: (point: Point) => string;
}

interface ChartInspectorData {
  points: Point[];
  dateKey: string;
  endDateKey?: string;
  columns: InspectorColumn[];
}

export interface ChartAnnotation {
  id: string;
  date: string;
  kind: "activity" | "event" | "record";
  title: string;
  detail?: string;
  activityIds?: string[];
}

interface ResizeBinding {
  chart: EChartsType;
  observer?: ResizeObserver;
}

const bindings = new WeakMap<HTMLElement, ResizeBinding>();
interface DateLinkedChart { chart: EChartsType; target: HTMLElement; points: Point[]; dateKey: string }
interface PointerBinding { move: (event: PointerEvent) => void; leave: () => void }
interface TimeSeriesBinding {
  click: (event: MouseEvent) => void;
  keydown: (event: KeyboardEvent) => void;
  blur: () => void;
}
const dateLinkedCharts = new Map<string, DateLinkedChart>();
const pointerBindings = new WeakMap<HTMLElement, PointerBinding>();
const timeSeriesBindings = new WeakMap<HTMLElement, TimeSeriesBinding>();
const chartInspectorData = new WeakMap<HTMLDetailsElement, ChartInspectorData>();
const textColor = "#91a5aa";
const gridColor = "#29383e";
let activeChartDateRange: { start: string; end: string } | null = null;
let activeChartAnnotations: ChartAnnotation[] = [];
let activeLinkedHover: { sourceId: string; date: string } | null = null;
const rangedChartRenderers = new Map<string, () => void>();
const tooltipBase = {
  triggerOn: window.matchMedia("(pointer: coarse)").matches ? "click" : "mousemove|click",
  confine: true,
  backgroundColor: "#10191f",
  borderColor: "#36515a",
  borderWidth: 1,
  textStyle: { color: "#edf5f4", fontSize: 11 },
  extraCssText: "border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.35)",
};

function shortDate(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? text
    : date.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit" });
}

function contextDate(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? text
    : date.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fullDate(value: unknown): string {
  if (value == null) return "Datum nije dostupan";
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? text
    : date.toLocaleDateString("hr-HR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function setChartContext(target: HTMLElement, labels: string[]): void {
  const previous = target.previousElementSibling;
  const context = previous instanceof HTMLElement
    && previous.classList.contains("chart-context")
    && previous.dataset.chartContextFor === target.id
    ? previous
    : document.createElement("div");
  context.className = "chart-context";
  context.dataset.chartContextFor = target.id;
  context.replaceChildren(...labels.filter(Boolean).map((label) => {
    const item = document.createElement("span");
    item.textContent = label;
    return item;
  }));
  if (context.parentElement !== target.parentElement) target.insertAdjacentElement("beforebegin", context);
}

function registerRangedChart(id: string, render: () => void): void {
  rangedChartRenderers.set(id, render);
}

function filterPointsByRange(points: Point[], dateKey = "date", endDateKey?: string): Point[] {
  if (!activeChartDateRange) return points;
  const range = activeChartDateRange;
  return points.filter((point) => {
    const start = String(point[dateKey] ?? "").slice(0, 10);
    const end = String((endDateKey && point[endDateKey]) ?? point[dateKey] ?? "").slice(0, 10);
    return Boolean(start && end && start <= range.end && end >= range.start);
  });
}

export function setChartDateRange(start: string | null, end: string | null): void {
  activeChartDateRange = start && end && start <= end ? { start, end } : null;
  for (const [id, render] of rangedChartRenderers) {
    if (!document.getElementById(id)) rangedChartRenderers.delete(id);
    else render();
  }
}

export function setChartAnnotations(annotations: ChartAnnotation[]): void {
  activeChartAnnotations = annotations.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  for (const [id, render] of rangedChartRenderers) {
    if (!document.getElementById(id)) rangedChartRenderers.delete(id);
    else render();
  }
}

function annotationsForPoint(point: Point, dateKey: string, endDateKey?: string): ChartAnnotation[] {
  const start = String(point[dateKey] ?? "").slice(0, 10);
  const end = String((endDateKey && point[endDateKey]) ?? point[dateKey] ?? "").slice(0, 10);
  return activeChartAnnotations.filter((item) => item.date >= start && item.date <= end);
}

function annotationLines(points: Point[], dateKey: string, endDateKey?: string): Array<Record<string, unknown>> {
  const positions = new Map<string, ChartAnnotation[]>();
  points.forEach((point) => {
    const axisDate = String(point[dateKey] ?? "").slice(0, 10);
    if (!axisDate) return;
    const annotations = annotationsForPoint(point, dateKey, endDateKey);
    for (const item of annotations) {
      const key = `${axisDate}|${item.kind}`;
      const grouped = positions.get(key) ?? [];
      grouped.push(item);
      positions.set(key, grouped);
    }
  });
  return Array.from(positions.entries(), ([key, items]) => {
    const [axisDate, kind] = key.split("|");
    return {
      xAxis: axisDate,
      name: kind,
      annotationIds: items.map((item) => item.id),
      lineStyle: { color: annotationColor(kind), type: "dashed", opacity: 0.74, width: 1.25 },
    };
  });
}

function annotationColor(kind: string): string {
  return kind === "activity" ? "#69d7ef" : kind === "record" ? "#b9a2fa" : chartReferenceColor;
}

function escapeTooltip(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function annotationSummary(point: Point, dateKey: string, endDateKey?: string): string {
  const items = annotationsForPoint(point, dateKey, endDateKey);
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
    .map((item) => `${item.title}${item.detail ? ` · ${item.detail}` : ""}`)
    .join("; ") || "—";
}

function renderInspectorTable(details: HTMLDetailsElement): void {
  const data = chartInspectorData.get(details);
  const table = details.querySelector<HTMLTableElement>(".chart-data-table");
  if (!data || !table) return;
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = ["Datum", ...data.columns.map((column) => column.label), "Kontekst"];
  headers.forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headerRow.append(cell);
  });
  header.append(headerRow);
  const body = document.createElement("tbody");
  data.points.forEach((point) => {
    const row = document.createElement("tr");
    const start = String(point[data.dateKey] ?? "").slice(0, 10);
    const end = String((data.endDateKey && point[data.endDateKey]) ?? point[data.dateKey] ?? "").slice(0, 10);
    const dateCell = document.createElement("td");
    dateCell.textContent = start ? (end && end !== start ? `${start} – ${end}` : start) : "—";
    row.append(dateCell);
    data.columns.forEach((column) => {
      const cell = document.createElement("td");
      cell.textContent = column.value(point);
      row.append(cell);
    });
    const contextCell = document.createElement("td");
    contextCell.textContent = annotationSummary(point, data.dateKey, data.endDateKey);
    row.append(contextCell);
    body.append(row);
  });
  table.replaceChildren(header, body);
}

function downloadInspectorCsv(details: HTMLDetailsElement): void {
  const data = chartInspectorData.get(details);
  if (!data) return;
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const headers = ["Datum", ...data.columns.map((column) => column.label), "Kontekst"];
  const rows = data.points.map((point) => {
    const start = String(point[data.dateKey] ?? "").slice(0, 10);
    const end = String((data.endDateKey && point[data.endDateKey]) ?? point[data.dateKey] ?? "").slice(0, 10);
    return [
      end && end !== start ? `${start} – ${end}` : start,
      ...data.columns.map((column) => column.exportValue?.(point) ?? column.value(point)),
      annotationSummary(point, data.dateKey, data.endDateKey),
    ];
  });
  const csv = `\ufeff${[headers, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}`;
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  const safeName = details.dataset.chartInspectorFor?.replace(/[^a-z0-9_-]/gi, "-") || "garmin-graf";
  anchor.href = blobUrl;
  anchor.download = `${safeName}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function setChartInspector(
  target: HTMLElement,
  title: string,
  points: Point[],
  dateKey: string,
  columns: InspectorColumn[],
  endDateKey?: string,
): void {
  const existing = target.nextElementSibling;
  let details = existing instanceof HTMLDetailsElement
    && existing.classList.contains("chart-data-inspector")
    && existing.dataset.chartInspectorFor === target.id
    ? existing
    : null;
  if (!details) {
    details = document.createElement("details");
    details.className = "chart-data-inspector";
    details.dataset.chartInspectorFor = target.id;
    const summary = document.createElement("summary");
    const toolbar = document.createElement("div");
    toolbar.className = "chart-data-toolbar";
    const note = document.createElement("span");
    note.textContent = "Izvoz uključuje samo trenutno prikazane zapise.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chart-data-export";
    button.textContent = "Preuzmi CSV";
    button.addEventListener("click", () => downloadInspectorCsv(details!));
    toolbar.append(note, button);
    const wrap = document.createElement("div");
    wrap.className = "chart-data-table-wrap";
    const table = document.createElement("table");
    table.className = "chart-data-table";
    wrap.append(table);
    details.append(summary, toolbar, wrap);
    details.addEventListener("toggle", () => { if (details?.open) renderInspectorTable(details); });
    target.insertAdjacentElement("afterend", details);
  }
  const summary = details.querySelector("summary");
  if (summary) summary.textContent = `${title} · ${points.length.toLocaleString("hr-HR")} zapisa`;
  chartInspectorData.set(details, { points, dateKey, endDateKey, columns });
  if (details.open) renderInspectorTable(details);
}

function annotationTooltip(point: Point, dateKey: string, endDateKey?: string): string {
  const items = annotationsForPoint(point, dateKey, endDateKey);
  if (!items.length) return "";
  const unique = Array.from(new Map(items.map((item) => [item.id, item])).values());
  return `<br/><br/><b>Kontekst</b><br/>${unique.map((item) => `<span style="color:${annotationColor(item.kind)}">●</span> ${escapeTooltip(item.title)}${item.detail ? `<br/><small>${escapeTooltip(item.detail)}</small>` : ""}`).join("<br/>")}`;
}

function emitDateSelection(target: HTMLElement, points: Point[], dateKey: string, index: number, endDateKey?: string): void {
  const point = points[index];
  const date = String(point?.[dateKey] ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const context = annotationsForPoint(point, dateKey, endDateKey);
  const activities = Array.from(new Set(context.flatMap((item) => item.kind === "activity" ? item.activityIds ?? [] : [])));
  target.dispatchEvent(new CustomEvent("dashboard-chart-date-select", {
    bubbles: true,
    detail: {
      date: String((endDateKey && point[endDateKey]) ?? "").slice(0, 10) || date,
      bucketStart: endDateKey ? date : null,
      activityId: activities.length === 1 ? activities[0] : null,
    },
  }));
}

function hideLinkedTooltips(sourceId: string): void {
  if (activeLinkedHover?.sourceId !== sourceId) return;
  activeLinkedHover = null;
  for (const [id, linked] of dateLinkedCharts) {
    if (id !== sourceId && !linked.chart.isDisposed()) linked.chart.dispatchAction({ type: "hideTip" });
  }
}

function showLinkedDate(sourceId: string, date: string): void {
  if (activeLinkedHover?.sourceId === sourceId && activeLinkedHover.date === date) return;
  activeLinkedHover = { sourceId, date };
  for (const [id, linked] of dateLinkedCharts) {
    if (id === sourceId || linked.chart.isDisposed()) continue;
    const index = linked.points.findIndex((point) => String(point[linked.dateKey] ?? "").slice(0, 10) === date);
    if (index < 0) linked.chart.dispatchAction({ type: "hideTip" });
    else linked.chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
  }
}

function bindDateHover(chart: EChartsType, target: HTMLElement, points: Point[], dateKey: string): void {
  const previous = pointerBindings.get(target);
  if (previous) {
    target.removeEventListener("pointermove", previous.move);
    target.removeEventListener("pointerleave", previous.leave);
  }
  dateLinkedCharts.set(target.id, { chart, target, points, dateKey });
  const move = (event: PointerEvent) => {
    const rect = target.getBoundingClientRect();
    const axisValue = chart.convertFromPixel({ xAxisIndex: 0 }, event.clientX - rect.left);
    if (axisValue == null) {
      hideLinkedTooltips(target.id);
      return;
    }
    const numericIndex = Number(axisValue);
    const exactDate = String(axisValue ?? "").slice(0, 10);
    const point = /^\d{4}-\d{2}-\d{2}$/.test(exactDate)
      ? points.find((item) => String(item[dateKey] ?? "").slice(0, 10) === exactDate)
      : Number.isFinite(numericIndex) ? points[Math.round(numericIndex)] : undefined;
    const date = String(point?.[dateKey] ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) showLinkedDate(target.id, date);
    else hideLinkedTooltips(target.id);
  };
  const leave = () => hideLinkedTooltips(target.id);
  pointerBindings.set(target, { move, leave });
  target.addEventListener("pointermove", move, { passive: true });
  target.addEventListener("pointerleave", leave, { passive: true });
}

function bindTimeSeriesInteractions(
  chart: EChartsType,
  target: HTMLElement,
  points: Point[],
  dateKey: string,
  endDateKey?: string,
  describePoint: (point: Point) => string = () => "",
): void {
  const previous = timeSeriesBindings.get(target);
  if (previous) {
    target.removeEventListener("click", previous.click);
    target.removeEventListener("keydown", previous.keydown);
    target.removeEventListener("blur", previous.blur);
  }
  let selectedIndex = -1;
  const initialLabel = target.getAttribute("aria-label") ?? "Graf vremenske serije";
  const click = (event: MouseEvent) => {
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!chart.containPixel({ gridIndex: 0 }, [x, y])) return;
    const axisValue = chart.convertFromPixel({ xAxisIndex: 0 }, x);
    if (axisValue == null) return;
    const exactDate = String(axisValue).slice(0, 10);
    const index = /^\d{4}-\d{2}-\d{2}$/.test(exactDate)
      ? points.findIndex((point) => String(point[dateKey] ?? "").slice(0, 10) === exactDate)
      : Number.isFinite(Number(axisValue)) ? Math.round(Number(axisValue)) : -1;
    if (index >= 0 && index < points.length) emitDateSelection(target, points, dateKey, index, endDateKey);
  };
  const selectPoint = (index: number) => {
    if (index < 0 || index >= points.length) return;
    selectedIndex = index;
    const point = points[index];
    const start = String(point[dateKey] ?? "").slice(0, 10);
    const end = String((endDateKey && point[endDateKey]) ?? point[dateKey] ?? "").slice(0, 10);
    const dateLabel = end && end !== start ? `${fullDate(start)} – ${fullDate(end)}` : fullDate(start);
    const description = describePoint(point).trim();
    const context = annotationSummary(point, dateKey, endDateKey);
    target.setAttribute("aria-label", `${initialLabel}. Odabrano: ${dateLabel}. ${description}${context !== "—" ? `. Kontekst: ${context}` : ""}`);
    chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) showLinkedDate(target.id, start);
  };
  const keydown = (event: KeyboardEvent) => {
    let index = selectedIndex;
    if (event.key === "ArrowLeft") index = selectedIndex < 0 ? points.length - 1 : Math.max(0, selectedIndex - 1);
    else if (event.key === "ArrowRight") index = selectedIndex < 0 ? 0 : Math.min(points.length - 1, selectedIndex + 1);
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = points.length - 1;
    else if (event.key === "Enter" && selectedIndex >= 0) {
      event.preventDefault();
      emitDateSelection(target, points, dateKey, selectedIndex, endDateKey);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      selectedIndex = -1;
      target.setAttribute("aria-label", initialLabel);
      chart.dispatchAction({ type: "hideTip" });
      hideLinkedTooltips(target.id);
      return;
    } else return;
    event.preventDefault();
    selectPoint(index);
  };
  const blur = () => hideLinkedTooltips(target.id);
  timeSeriesBindings.set(target, { click, keydown, blur });
  target.addEventListener("click", click);
  target.addEventListener("keydown", keydown);
  target.addEventListener("blur", blur);
}

function formatDateRange(points: Point[], dateKey: string, endDateKey?: string): string {
  const starts = points
    .map((point) => String(point[dateKey] ?? "").slice(0, 10))
    .filter(Boolean)
    .sort();
  if (!starts.length) return "Razdoblje nije dostupno";
  const ends = endDateKey
    ? points.map((point) => String(point[endDateKey] ?? point[dateKey] ?? "").slice(0, 10)).filter(Boolean).sort()
    : starts;
  const first = starts[0];
  const last = ends[ends.length - 1];
  return first === last
    ? `Datum ${contextDate(first)}`
    : `${contextDate(first)} – ${contextDate(last)}`;
}

function setTimeSeriesContext(
  target: HTMLElement,
  points: Point[],
  seriesKeys: string[],
  options: ChartContextOptions = {},
): void {
  const dateKey = options.dateKey ?? "date";
  const valueCount = points.reduce(
    (count, point) => count + seriesKeys.filter((key) => valueOf(point, key) != null).length,
    0,
  );
  const expectedCount = points.length * seriesKeys.length;
  const actualPeriod = formatDateRange(points, dateKey, options.endDateKey);
  const labels = [
    activeChartDateRange
      ? `Odabrano ${contextDate(activeChartDateRange.start)} – ${contextDate(activeChartDateRange.end)}`
      : options.periodLabel ?? `Podaci ${actualPeriod}`,
    activeChartDateRange ? `Zapisi ${points.length ? actualPeriod : "nisu dostupni"}` : "",
    expectedCount ? `${valueCount} od ${expectedCount} točaka s podatkom` : "Nema zapisa u odgovoru izvora",
    options.unit ? `Jedinica ${options.unit.trim()}` : "",
    options.sourceLabel ?? "",
    options.referenceLabel ?? "",
  ];
  setChartContext(target, labels);
}

function insufficientDataMessage(valueCount: number): string {
  return valueCount === 0
    ? "Nema mjerenja s vrijednošću za ovaj prikaz."
    : "Nema dovoljno vrijednosti za trend; potrebne su barem dvije po seriji.";
}

function valueOf(point: Point, key: string): number | null {
  const value = point[key];
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function targetFor(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function disposeTarget(target: HTMLElement): void {
  const timeSeries = timeSeriesBindings.get(target);
  if (timeSeries) {
    target.removeEventListener("click", timeSeries.click);
    target.removeEventListener("keydown", timeSeries.keydown);
    target.removeEventListener("blur", timeSeries.blur);
    timeSeriesBindings.delete(target);
  }
  const pointer = pointerBindings.get(target);
  if (pointer) {
    target.removeEventListener("pointermove", pointer.move);
    target.removeEventListener("pointerleave", pointer.leave);
    pointerBindings.delete(target);
  }
  dateLinkedCharts.delete(target.id);
  if (activeLinkedHover?.sourceId === target.id) hideLinkedTooltips(target.id);
  const binding = bindings.get(target);
  binding?.observer?.disconnect();
  (binding?.chart || echarts.getInstanceByDom(target))?.dispose();
  bindings.delete(target);
  target.style.height = "";
  target.removeAttribute("role");
  target.removeAttribute("aria-label");
  target.removeAttribute("aria-keyshortcuts");
  target.removeAttribute("aria-description");
  target.removeAttribute("aria-live");
  target.removeAttribute("tabindex");
}

export function disposeChartsInside(container: HTMLElement): void {
  const disposedIds = new Set([container.id, ...Array.from(container.querySelectorAll<HTMLElement>("[id]"), (element) => element.id)].filter(Boolean));
  disposedIds.forEach((id) => rangedChartRenderers.delete(id));
  const targets = [
    ...(container.matches(".echarts-host") ? [container] : []),
    ...container.querySelectorAll<HTMLElement>(".echarts-host"),
  ];
  targets.forEach((target) => {
    disposeTarget(target);
    const inspector = target.nextElementSibling;
    if (inspector instanceof HTMLDetailsElement && inspector.classList.contains("chart-data-inspector") && inspector.dataset.chartInspectorFor === target.id) {
      inspector.remove();
    }
    const previous = target.previousElementSibling;
    if (previous instanceof HTMLElement && previous.classList.contains("chart-context") && previous.dataset.chartContextFor === target.id) {
      previous.remove();
    }
  });
}

function prepareTarget(id: string, points: Point[], ariaLabel: string, height: number, valueCount = points.length): HTMLElement | null {
  const target = targetFor(id);
  if (!target) return null;
  disposeTarget(target);
  if (valueCount < 2) {
    target.innerHTML = `<div class="empty-chart">${insufficientDataMessage(valueCount)}</div>`;
    return null;
  }

  target.classList.add("echarts-host");
  target.setAttribute("role", "img");
  target.setAttribute("aria-label", ariaLabel);
  target.setAttribute("aria-description", "Fokusiraj graf. Strelice lijevo i desno mijenjaju datum, Home i End vode na prvi ili zadnji zapis, Enter otvara odabrani datum, a Escape zatvara pregled.");
  target.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight Home End Enter Escape");
  target.setAttribute("aria-live", "polite");
  target.tabIndex = 0;
  target.style.height = `${height}px`;
  target.replaceChildren();
  // ECharts 6.1.0 can leave line-series pixels corrupted while an axis tooltip
  // moves if dirty-rectangle rendering is enabled. The dashboard uses axis
  // pointers on its trend charts, so use a full canvas repaint for reliable hover.
  const chart = echarts.init(target, undefined, { renderer: "canvas", useDirtyRect: false });
  const binding: ResizeBinding = { chart };
  binding.observer = new ResizeObserver(() => chart.resize());
  binding.observer.observe(target);
  bindings.set(target, binding);
  return target;
}

function makeLineOption(
  points: Point[],
  key: string,
  options: LineChartOptions,
  name: string,
): EChartsOption {
  const formatValue = options.formatValue ?? ((value: number) => value.toLocaleString("hr-HR", { maximumFractionDigits: 1 }));
  const dateKey = options.dateKey ?? "date";
  const labels = points.map((point) => String(point[dateKey] ?? ""));
  const annotationData = annotationLines(points, dateKey, options.endDateKey);
  const markerData = [
    ...(options.referenceLine ? [{
      yAxis: options.referenceLine.value,
      name: options.referenceLine.label ?? "Osobna baza",
      lineStyle: { color: options.referenceLine.color ?? chartReferenceColor, type: "dashed", width: 1.35, opacity: 0.9 },
      label: options.referenceLine.label ? {
        show: true,
        formatter: options.referenceLine.label,
        position: "insideEndTop",
        color: options.referenceLine.color ?? chartReferenceColor,
        fontSize: 8,
        backgroundColor: "rgba(12,20,25,.82)",
        padding: [2, 4],
        borderRadius: 3,
      } : { show: false },
    }] : []),
    ...annotationData,
  ];
  const interval = Math.max(0, Math.ceil(points.length / 6) - 1);
  const axisFont = window.matchMedia("(max-width: 520px)").matches ? 8 : 9;
  return {
    animation: false,
    aria: { enabled: true, label: { description: options.ariaLabel } },
    grid: { top: 12, right: 9, bottom: options.zoom ? 35 : 24, left: 44, containLabel: false },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: options.color, opacity: 0.55 } },
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw[0] : raw;
        if (typeof params !== "object" || params === null) return "";
        const dataIndex = Number((params as { dataIndex?: unknown }).dataIndex);
        const point = points[dataIndex];
        if (!point) return "";
        const value = valueOf(point, key);
        const reference = options.referenceLine?.label
          ? `<br/><span style="color:${options.referenceLine.color ?? chartReferenceColor}">┄</span> ${escapeTooltip(options.referenceLine.label)}`
          : "";
        return `${fullDate(point[dateKey])}<br/><span style="color:${options.color}">●</span> ${name}: <b>${value == null ? "—" : `${formatValue(value)}${options.unit ?? ""}`}</b>${reference}${annotationTooltip(point, dateKey, options.endDateKey)}`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: {
        color: textColor,
        fontSize: axisFont,
        hideOverlap: true,
        interval,
        formatter: (value: string) => shortDate(value),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitNumber: 3,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor, width: 1 } },
      axisLabel: {
        color: textColor,
        fontSize: axisFont,
        formatter: (raw: number) => `${formatValue(Number(raw))}${options.unit ?? ""}`,
      },
    },
    dataZoom: options.zoom
      ? [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
        { type: "slider", xAxisIndex: 0, height: 12, bottom: 1, borderColor: "transparent", backgroundColor: "#1b2a30", fillerColor: "rgba(105,215,239,.2)", handleStyle: { color: options.color }, textStyle: { color: textColor, fontSize: 8 }, dataBackground: { lineStyle: { color: "#45606a" }, areaStyle: { color: "#24363d" } } }]
      : undefined,
    series: [{
      name,
      type: "line",
      data: points.map((point) => valueOf(point, key)),
      connectNulls: options.connectNulls ?? false,
      smooth: 0.18,
      showSymbol: points.length <= 24,
      symbolSize: 5,
      lineStyle: { color: options.color, width: 2.5, cap: "round" },
      itemStyle: { color: options.color, borderColor: "#10191f", borderWidth: 2 },
      areaStyle: { color: options.color, opacity: 0.06 },
      emphasis: { focus: "series", scale: 1.25, lineStyle: { width: 3.5 } },
      ...(markerData.length ? {
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#60777d", type: "dashed", width: 1, opacity: 0.75 },
          label: { show: false },
          data: markerData,
        },
      } : {}),
    }],
  };
}

export function renderLineChart(
  id: string,
  points: Point[],
  key: string,
  options: LineChartOptions,
  name = options.ariaLabel,
): void {
  const originalPoints = points;
  registerRangedChart(id, () => renderLineChart(id, originalPoints, key, options, name));
  const displayPoints = filterPointsByRange(originalPoints, options.dateKey ?? "date", options.endDateKey);
  const valueCount = displayPoints.filter((point) => valueOf(point, key) != null).length;
  const target = targetFor(id);
  if (!target) return;
  setTimeSeriesContext(target, displayPoints, [key], {
    dateKey: options.dateKey,
    endDateKey: options.endDateKey,
    sourceLabel: options.sourceLabel,
    unit: options.unit,
    referenceLabel: options.referenceLine?.label
      ? `Crta · ${options.referenceLine.context ?? options.referenceLine.label}`
      : "",
  });
  const formatValue = options.formatValue ?? ((value: number) => value.toLocaleString("hr-HR", { maximumFractionDigits: 1 }));
  setChartInspector(target, name, displayPoints, options.dateKey ?? "date", [{
    label: `${name}${options.unit ? ` (${options.unit.trim()})` : ""}`,
    value: (point) => {
      const value = valueOf(point, key);
      return value == null ? "—" : `${formatValue(value)}${options.unit ?? ""}`;
    },
    exportValue: (point) => {
      const value = valueOf(point, key);
      return value == null ? "" : value.toLocaleString("hr-HR", { maximumFractionDigits: 6 });
    },
  }], options.endDateKey);
  const chartTarget = prepareTarget(id, displayPoints, options.ariaLabel, options.height ?? 150, valueCount);
  if (!chartTarget) return;
  const chart = echarts.getInstanceByDom(chartTarget);
  chart?.setOption(makeLineOption(displayPoints, key, options, name), { notMerge: true, lazyUpdate: true });
  chart?.resize();
  if (chart) {
    bindTimeSeriesInteractions(
      chart,
      chartTarget,
      displayPoints,
      options.dateKey ?? "date",
      options.endDateKey,
      (point) => {
        const value = valueOf(point, key);
        return `${name}: ${value == null ? "nema podatka" : `${formatValue(value)}${options.unit ?? ""}`}`;
      },
    );
    bindDateHover(chart, chartTarget, displayPoints, options.dateKey ?? "date");
  }
}

export function renderEcgWaveform(
  id: string,
  samples: number[],
  sampleRate: number,
  sampleStride: number,
  durationSeconds: number | null,
  ariaLabel: string,
): void {
  const points = samples.map((value, index) => ({ value, index }));
  const target = targetFor(id);
  if (!target) return;
  setChartContext(target, [
    durationSeconds == null ? "ECG signal" : `Trajanje ${durationSeconds.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} s`,
    `${samples.length.toLocaleString("hr-HR")} uzoraka`,
    "Garmin Connect",
  ]);
  const chartTarget = prepareTarget(id, points, ariaLabel, 175);
  if (!chartTarget) return;
  const chart = echarts.getInstanceByDom(chartTarget);
  const interval = Math.max(0, Math.ceil(points.length / 6) - 1);
  chart?.setOption({
    animation: false,
    aria: { enabled: true, label: { description: ariaLabel } },
    grid: { top: 10, right: 9, bottom: 25, left: 36, containLabel: false },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "#69d7ef", opacity: 0.55 } },
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw[0] : raw;
        if (typeof params !== "object" || params === null) return "";
        const index = Number((params as { dataIndex?: unknown }).dataIndex);
        const value = samples[index];
        const seconds = sampleRate > 0 ? index * sampleStride / sampleRate : index;
        return `${seconds.toLocaleString("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s · uzorak <b>${Number(value).toLocaleString("hr-HR", { maximumFractionDigits: 2 })}</b>`;
      },
    },
    xAxis: {
      type: "category",
      data: points.map((point) => sampleRate > 0 ? (point.index * sampleStride / sampleRate).toFixed(1) : String(point.index)),
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: 8, interval, formatter: (value: string) => `${value} s` },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitNumber: 3,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: gridColor, width: 1 } },
    },
    series: [{
      name: "Garmin ECG uzorci",
      type: "line",
      data: samples,
      showSymbol: false,
      smooth: false,
      sampling: "lttb",
      lineStyle: { color: "#69d7ef", width: 1.35 },
      emphasis: { disabled: true },
    }],
  }, { notMerge: true, lazyUpdate: true });
  chart?.resize();
  if (durationSeconds != null) chartTarget.setAttribute("aria-label", `${ariaLabel}; ${durationSeconds} sekundi`);
}

export function renderIntradayLineChart(
  id: string,
  points: Point[],
  key: string,
  options: IntradayLineChartOptions,
  name = options.ariaLabel,
): void {
  const valueCount = points.filter((point) => valueOf(point, key) != null).length;
  const target = targetFor(id);
  if (!target) return;
  const times = points.map((point) => String(point.time ?? "")).filter(Boolean);
  setChartContext(target, [
    times.length ? `Tijek ${times[0]} – ${times[times.length - 1]}` : "Tijek dana",
    `${valueCount} od ${points.length} uzoraka s podatkom`,
    options.unit ? `Jedinica ${options.unit.trim()}` : "",
    options.sourceLabel ?? "",
  ]);
  const chartTarget = prepareTarget(id, points, options.ariaLabel, options.height ?? 155, valueCount);
  if (!chartTarget) return;
  const chart = echarts.getInstanceByDom(chartTarget);
  const formatValue = options.formatValue ?? ((value: number) => value.toLocaleString("hr-HR", { maximumFractionDigits: 0 }));
  const labels = points.map((point) => String(point.time ?? ""));
  const interval = Math.max(0, Math.ceil(points.length / 6) - 1);
  const axisFont = window.matchMedia("(max-width: 520px)").matches ? 8 : 9;
  chart?.setOption({
    animation: false,
    aria: { enabled: true, label: { description: options.ariaLabel } },
    grid: { top: 12, right: 10, bottom: 24, left: 34, containLabel: false },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: options.color, opacity: 0.55 } },
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw[0] : raw;
        if (typeof params !== "object" || params === null) return "";
        const dataIndex = Number((params as { dataIndex?: unknown }).dataIndex);
        const point = points[dataIndex];
        if (!point) return "";
        const value = valueOf(point, key);
        return `${String(point.time ?? "—")} · <span style="color:${options.color}">●</span> ${name}: <b>${value == null ? "—" : `${formatValue(value)}${options.unit ?? ""}`}</b>`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: axisFont, hideOverlap: true, interval },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      interval: 25,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor, width: 1 } },
      axisLabel: { color: textColor, fontSize: axisFont },
    },
    series: [{
      name,
      type: "line",
      data: points.map((point) => valueOf(point, key)),
      connectNulls: false,
      smooth: 0.12,
      showSymbol: points.length <= 24,
      symbolSize: 5,
      lineStyle: { color: options.color, width: 2.5, cap: "round" },
      itemStyle: { color: options.color, borderColor: "#10191f", borderWidth: 2 },
      areaStyle: { color: options.color, opacity: 0.08 },
      emphasis: { focus: "series", scale: 1.25, lineStyle: { width: 3.5 } },
    }],
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
}

export function renderActivityMetric(
  id: string,
  points: Point[],
  key: string,
  color: string,
  unit: string,
  formatValue: ValueFormatter,
  ariaLabel: string,
): void {
  const usable = points.filter((point) => valueOf(point, key) != null && valueOf(point, "elapsedSeconds") != null);
  const target = targetFor(id);
  if (!target) return;
  setChartContext(target, [
    "Tijekom odabrane aktivnosti",
    `${usable.length.toLocaleString("hr-HR")} uzoraka`,
    `Jedinica ${unit}`,
    "Garmin aktivnost",
  ]);
  const chartTarget = prepareTarget(id, usable, ariaLabel, 200, usable.length);
  if (!chartTarget) return;
  chartTarget.setAttribute("aria-description", `Vodoravna os prikazuje proteklo vrijeme, okomita os prikazuje ${unit}. Točke su dostupne samo ako ih Garmin zabilježi.`);
  chartTarget.removeAttribute("aria-keyshortcuts");
  const chart = echarts.getInstanceByDom(chartTarget);
  const series = usable.map((point) => [valueOf(point, "elapsedSeconds"), valueOf(point, key)]);
  const axisFont = window.matchMedia("(max-width: 520px)").matches ? 8 : 9;
  chart?.setOption({
    animation: false,
    aria: { enabled: true, label: { description: ariaLabel } },
    grid: { top: 12, right: 10, bottom: 30, left: 46 },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color, opacity: 0.55 } },
      formatter: (raw: unknown) => {
        const item = Array.isArray(raw) ? raw[0] : raw;
        if (typeof item !== "object" || item === null) return "";
        const value = item as { value?: unknown };
        const pair = Array.isArray(value.value) ? value.value : [];
        const seconds = Number(pair[0]);
        const metricValue = Number(pair[1]);
        const elapsed = Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "—";
        return `${elapsed} · ${Number.isFinite(metricValue) ? `${formatValue(metricValue)} ${unit}` : "nema uzorka"}`;
      },
    },
    xAxis: {
      type: "value",
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: axisFont, hideOverlap: true, formatter: (rawSeconds: number) => { const seconds=Math.max(0,Math.round(Number(rawSeconds)));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`; } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: unit,
      nameTextStyle: { color: textColor, fontSize: 8 },
      scale: true,
      splitNumber: 4,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: axisFont, formatter: (value: number) => `${formatValue(Number(value))}` },
    },
    series: [{
      name: ariaLabel,
      type: "line",
      data: series,
      showSymbol: usable.length <= 24,
      symbolSize: 4,
      connectNulls: false,
      smooth: 0.12,
      lineStyle: { color, width: 2.4, cap: "round" },
      itemStyle: { color, borderColor: "#10191f", borderWidth: 2 },
      areaStyle: { color, opacity: 0.08 },
      emphasis: { focus: "series", scale: 1.2, lineStyle: { width: 3.4 } },
    }],
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
}

export function renderPairLineChart(
  id: string,
  points: Point[],
  keyA: string,
  keyB: string,
  colorA: string,
  colorB: string,
  labelA: string,
  labelB: string,
  ariaLabel: string,
  context: ChartContextOptions = {},
): void {
  const originalPoints = points;
  registerRangedChart(id, () => renderPairLineChart(id, originalPoints, keyA, keyB, colorA, colorB, labelA, labelB, ariaLabel, context));
  const displayPoints = filterPointsByRange(originalPoints, context.dateKey ?? "date", context.endDateKey);
  const valueCountA = displayPoints.filter((point) => valueOf(point, keyA) != null).length;
  const valueCountB = displayPoints.filter((point) => valueOf(point, keyB) != null).length;
  const target = targetFor(id);
  if (!target) return;
  setTimeSeriesContext(target, displayPoints, [keyA, keyB], context);
  const formatInspectorValue = (value: number | null) => value == null
    ? "—"
    : `${value.toLocaleString("hr-HR", { maximumFractionDigits: 1 })}${context.unit ? ` ${context.unit}` : ""}`;
  setChartInspector(target, ariaLabel, displayPoints, context.dateKey ?? "date", [
    { label: labelA, value: (point) => formatInspectorValue(valueOf(point, keyA)), exportValue: (point) => valueOf(point, keyA)?.toLocaleString("hr-HR", { maximumFractionDigits: 6 }) ?? "" },
    { label: labelB, value: (point) => formatInspectorValue(valueOf(point, keyB)), exportValue: (point) => valueOf(point, keyB)?.toLocaleString("hr-HR", { maximumFractionDigits: 6 }) ?? "" },
  ], context.endDateKey);
  const chartTarget = prepareTarget(id, displayPoints, ariaLabel, 150, Math.max(valueCountA, valueCountB));
  if (!chartTarget) return;
  const chart = echarts.getInstanceByDom(chartTarget);
  const base = makeLineOption(displayPoints, keyA, { color: colorA, ariaLabel, height: 150, dateKey: context.dateKey, endDateKey: context.endDateKey }, labelA);
  const baseSeries = Array.isArray(base.series) ? base.series[0] : undefined;
  chart?.setOption({
    ...base,
    legend: {
      show: true,
      bottom: 0,
      left: "center",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: textColor, fontSize: 9 },
      data: [labelA, labelB],
    },
    grid: { top: 12, right: 8, bottom: 38, left: 42 },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line" },
      formatter: (raw: unknown) => {
        const first = Array.isArray(raw) ? raw[0] : raw;
        if (typeof first !== "object" || first === null) return "";
        const index = Number((first as { dataIndex?: unknown }).dataIndex);
        const point = displayPoints[index];
        if (!point) return "";
        const fmt = (value: number | null) => value == null ? "—" : value.toLocaleString("hr-HR", { maximumFractionDigits: 1 });
        return `${fullDate(point[context.dateKey ?? "date"])}<br/><span style="color:${colorA}">●</span> ${labelA}: <b>${fmt(valueOf(point, keyA))}</b><br/><span style="color:${colorB}">●</span> ${labelB}: <b>${fmt(valueOf(point, keyB))}</b>${annotationTooltip(point, context.dateKey ?? "date", context.endDateKey)}`;
      },
    },
    series: [
      { ...baseSeries, name: labelA, type: "line", data: displayPoints.map((point) => valueOf(point, keyA)), itemStyle: { color: colorA }, lineStyle: { color: colorA, width: 2.4 }, areaStyle: { color: colorA, opacity: 0.05 }, blur: { lineStyle: { opacity: 0.14 }, itemStyle: { opacity: 0.14 }, areaStyle: { opacity: 0.01 } }, emphasis: { focus: "series", lineStyle: { width: 3.6 } } },
      { ...baseSeries, name: labelB, type: "line", data: displayPoints.map((point) => valueOf(point, keyB)), itemStyle: { color: colorB }, lineStyle: { color: colorB, width: 2.4 }, areaStyle: { color: colorB, opacity: 0.04 }, blur: { lineStyle: { opacity: 0.14 }, itemStyle: { opacity: 0.14 }, areaStyle: { opacity: 0.01 } }, emphasis: { focus: "series", lineStyle: { width: 3.6 } } },
    ],
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
  if (chart) {
    bindTimeSeriesInteractions(
      chart,
      chartTarget,
      displayPoints,
      context.dateKey ?? "date",
      context.endDateKey,
      (point) => `${labelA}: ${formatInspectorValue(valueOf(point, keyA))}; ${labelB}: ${formatInspectorValue(valueOf(point, keyB))}`,
    );
    bindDateHover(chart, chartTarget, displayPoints, context.dateKey ?? "date");
  }
}

export function renderTimelineSeriesChart(
  id: string,
  originalPoints: Point[],
  series: TimelineSeries[],
  options: TimelineChartOptions,
  title: string,
): void {
  registerRangedChart(id, () => renderTimelineSeriesChart(id, originalPoints, series, options, title));
  const dateKey = options.dateKey ?? "date";
  const displayPoints = filterPointsByRange(originalPoints, dateKey, options.endDateKey);
  const target = targetFor(id);
  if (!target) return;
  const seriesKeys = series.map((item) => item.key);
  setTimeSeriesContext(target, displayPoints, seriesKeys, {
    dateKey,
    endDateKey: options.endDateKey,
    sourceLabel: options.sourceLabel,
    unit: options.unit,
  });
  const valueCount = Math.max(0, ...series.map((item) => displayPoints.filter((point) => valueOf(point, item.key) != null).length));
  const formatValue = (item: TimelineSeries, value: number | null): string => {
    if (value == null) return "—";
    const formatted = (item.formatValue ?? (number => number.toLocaleString("hr-HR", { maximumFractionDigits: 1 })))(value);
    return `${formatted}${options.unit ? ` ${options.unit}` : ""}`;
  };
  setChartInspector(target, title, displayPoints, dateKey, series.map((item) => ({
    label: `${item.label}${options.unit ? ` (${options.unit})` : ""}`,
    value: (point) => formatValue(item, valueOf(point, item.key)),
    exportValue: (point) => valueOf(point, item.key)?.toLocaleString("hr-HR", { maximumFractionDigits: 6 }) ?? "",
  })), options.endDateKey);
  const primary = series[0];
  if (!primary) {
    target.innerHTML = '<div class="empty-chart">Nema serija za prikaz.</div>';
    return;
  }
  const chartTarget = prepareTarget(id, displayPoints, options.ariaLabel, options.height ?? 230, valueCount);
  if (!chartTarget) return;
  const chart = echarts.getInstanceByDom(chartTarget);
  const base = makeLineOption(displayPoints, primary.key, {
    color: primary.color,
    height: options.height ?? 230,
    dateKey,
    endDateKey: options.endDateKey,
    ariaLabel: options.ariaLabel,
    zoom: options.zoom ?? true,
    sourceLabel: options.sourceLabel,
    unit: options.unit ? ` ${options.unit}` : "",
    formatValue: primary.formatValue,
  }, primary.label);
  chart?.setOption({
    ...base,
    legend: series.length > 1 ? {
      show: true,
      type: "plain",
      bottom: 0,
      left: "center",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 8,
      textStyle: { color: textColor, fontSize: 8 },
      data: series.map((item) => item.label),
      selected: Object.fromEntries(series.map((item) => [item.label, item.initiallySelected !== false])),
    } : undefined,
    grid: { top: 12, right: 10, bottom: options.zoom === false ? 25 : 48, left: 48, containLabel: false },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line" },
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw : [raw];
        const first = params.find((item) => typeof item === "object" && item !== null) as { dataIndex?: unknown } | undefined;
        const index = Number(first?.dataIndex);
        const point = displayPoints[index];
        if (!point) return "";
        const start = String(point[dateKey] ?? "").slice(0, 10);
        const end = String((options.endDateKey && point[options.endDateKey]) ?? point[dateKey] ?? "").slice(0, 10);
        const dateLabel = end && end !== start ? `${fullDate(start)} – ${fullDate(end)}` : fullDate(start);
        const values = series.map((item) => `<br/><span style="color:${item.color}">●</span> ${escapeTooltip(item.label)}: <b>${escapeTooltip(formatValue(item, valueOf(point, item.key)))}</b>`).join("");
        return `${dateLabel}${values}${annotationTooltip(point, dateKey, options.endDateKey)}`;
      },
    },
    series: series.map((item) => ({
      name: item.label,
      type: "line",
      data: displayPoints.map((point) => valueOf(point, item.key)),
      connectNulls: false,
      smooth: 0.12,
      showSymbol: displayPoints.length <= 24,
      symbolSize: 4,
      lineStyle: { color: item.color, width: 2.2, cap: "round" },
      itemStyle: { color: item.color, borderColor: "#10191f", borderWidth: 2 },
      blur: { lineStyle: { opacity: 0.14 }, itemStyle: { opacity: 0.14 } },
      emphasis: { focus: "series", scale: 1.2, lineStyle: { width: 3.6 } },
    })),
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
  if (chart) {
    bindTimeSeriesInteractions(
      chart,
      chartTarget,
      displayPoints,
      dateKey,
      options.endDateKey,
      (point) => series.map((item) => `${item.label}: ${formatValue(item, valueOf(point, item.key))}`).join("; "),
    );
    bindDateHover(chart, chartTarget, displayPoints, dateKey);
  }
}

export function renderCorrelationScatter(
  id: string,
  points: CorrelationPoint[],
  options: CorrelationChartOptions,
): void {
  const target = targetFor(id);
  if (!target) return;
  setChartContext(target, [
    `${points.length.toLocaleString("hr-HR")} zajedničkih dana`,
    `X · ${options.xLabel}${options.xUnit ? ` (${options.xUnit})` : ""}`,
    `Y · ${options.yLabel}${options.yUnit ? ` (${options.yUnit})` : ""}`,
    options.sourceLabel ?? "",
  ]);
  setChartInspector(target, `${options.yLabel} prema ${options.xLabel}`, points, "date", [
    { label: `${options.xLabel}${options.xUnit ? ` (${options.xUnit})` : ""}`, value: (point) => `${options.xFormat(Number(point.x))}${options.xUnit ? ` ${options.xUnit}` : ""}`, exportValue: (point) => Number(point.x).toLocaleString("hr-HR", { maximumFractionDigits: 6 }) },
    { label: `${options.yLabel}${options.yUnit ? ` (${options.yUnit})` : ""}`, value: (point) => `${options.yFormat(Number(point.y))}${options.yUnit ? ` ${options.yUnit}` : ""}`, exportValue: (point) => Number(point.y).toLocaleString("hr-HR", { maximumFractionDigits: 6 }) },
  ]);
  const chartTarget = prepareTarget(id, points, `${options.yLabel} prema ${options.xLabel}`, 300, points.length);
  if (!chartTarget) return;
  chartTarget.setAttribute("aria-description", "Svaka točka označava jedan datum sa zapisom za obje metrike. Zumiraj graf ili otvori tablicu za datume i CSV izvoz.");
  chartTarget.removeAttribute("aria-keyshortcuts");
  const chart = echarts.getInstanceByDom(chartTarget);
  const xs = points.map((point) => point.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const regressionData = options.regression && minX !== maxX
    ? [[minX, options.regression.slope * minX + options.regression.intercept], [maxX, options.regression.slope * maxX + options.regression.intercept]]
    : [];
  const axisFont = window.matchMedia("(max-width: 520px)").matches ? 8 : 9;
  chart?.setOption({
    animation: false,
    aria: { enabled: true, label: { description: `${options.yLabel} u odnosu na ${options.xLabel}, po zajedničkim datumima` } },
    grid: { top: 18, right: 12, bottom: 48, left: 52, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: "item",
      formatter: (raw: unknown) => {
        if (typeof raw !== "object" || raw === null) return "";
        const index = Number((raw as { dataIndex?: unknown }).dataIndex);
        const point = points[index];
        if (!point) return "";
        return `${fullDate(point.date)}<br/><span style="color:${options.xColor}">●</span> ${escapeTooltip(options.xLabel)}: <b>${escapeTooltip(options.xFormat(point.x))}${options.xUnit ? ` ${escapeTooltip(options.xUnit)}` : ""}</b><br/><span style="color:${options.yColor}">●</span> ${escapeTooltip(options.yLabel)}: <b>${escapeTooltip(options.yFormat(point.y))}${options.yUnit ? ` ${escapeTooltip(options.yUnit)}` : ""}</b>${annotationTooltip(point, "date")}`;
      },
    },
    xAxis: {
      type: "value",
      name: `${options.xLabel}${options.xUnit ? ` · ${options.xUnit}` : ""}`,
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: { color: textColor, fontSize: axisFont },
      scale: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: axisFont, formatter: (value: number) => options.xFormat(Number(value)), hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: `${options.yLabel}${options.yUnit ? ` · ${options.yUnit}` : ""}`,
      nameTextStyle: { color: textColor, fontSize: axisFont },
      scale: true,
      splitNumber: 4,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: axisFont, formatter: (value: number) => options.yFormat(Number(value)), hideOverlap: true },
    },
    dataZoom: [{ type: "inside", xAxisIndex: 0, yAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: false }],
    series: [
      {
        name: "Zajednički datumi",
        type: "scatter",
        data: points.map((point) => ({ value: [point.x, point.y], date: point.date })),
        symbolSize: window.matchMedia("(pointer: coarse)").matches ? 12 : 9,
        itemStyle: { color: options.xColor, borderColor: "#d5e5e8", borderWidth: 1.2, opacity: 0.88 },
        blur: { itemStyle: { opacity: 0.16 } },
        emphasis: { focus: "self", scale: 1.45, itemStyle: { color: options.yColor, borderColor: "#ffffff", borderWidth: 2 } },
      },
      ...(regressionData.length ? [{
        name: "Linearna crta trenda",
        type: "line" as const,
        data: regressionData,
        showSymbol: false,
        silent: true,
        lineStyle: { color: options.yColor, width: 1.5, type: "dashed", opacity: 0.72 },
        tooltip: { show: false },
      }] : []),
    ],
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
}

export function renderWeeklyVolume(id: string, points: Point[], sportLabel = "Trčanje"): void {
  const ariaLabel = `Tjedna udaljenost za ${sportLabel} u kilometrima`;
  const originalPoints = points;
  registerRangedChart(id, () => renderWeeklyVolume(id, originalPoints, sportLabel));
  const displayPoints = filterPointsByRange(originalPoints, "start", "end");
  const values = displayPoints.map((point) => valueOf(point, "distanceKm"));
  const target = targetFor(id);
  if (!target) return;
  const firstWeek = displayPoints[0];
  const lastWeek = displayPoints.at(-1);
  const periodLabel = firstWeek?.start && (lastWeek?.end || lastWeek?.start)
    ? `${contextDate(firstWeek.start)} – ${contextDate(lastWeek.end ?? lastWeek.start)}`
    : undefined;
  setTimeSeriesContext(target, displayPoints, ["distanceKm"], { dateKey: "start", endDateKey: "end", periodLabel, sourceLabel: `Garmin aktivnosti · ${sportLabel}`, unit: "km" });
  setChartInspector(target, `Tjedna udaljenost · ${sportLabel}`, displayPoints, "start", [
    { label: "Udaljenost (km)", value: (point) => {
      const value = valueOf(point, "distanceKm");
      return value == null ? "—" : `${value.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} km`;
    }, exportValue: (point) => valueOf(point, "distanceKm")?.toLocaleString("hr-HR", { maximumFractionDigits: 6 }) ?? "" },
    { label: `${sportLabel} · aktivnosti`, value: (point) => point.count == null ? "—" : Number(point.count).toLocaleString("hr-HR"), exportValue: (point) => point.count == null ? "" : Number(point.count).toLocaleString("hr-HR") },
    { label: "Udaljenost · pokrivenost", value: (point) => point.distanceCoverage == null || point.activityCount == null ? "—" : `${Number(point.distanceCoverage).toLocaleString("hr-HR")}/${Number(point.activityCount).toLocaleString("hr-HR")} aktivnosti`, exportValue: (point) => point.distanceCoverage == null || point.activityCount == null ? "" : `${Number(point.distanceCoverage).toLocaleString("hr-HR")}/${Number(point.activityCount).toLocaleString("hr-HR")}` },
  ], "end");
  const chartTarget = prepareTarget(id, displayPoints, ariaLabel, 150, values.filter((value) => value != null).length);
  if (!chartTarget) return;
  const chart = echarts.getInstanceByDom(chartTarget);
  const labels = displayPoints.map((point) => String(point.start ?? ""));
  const chartValues = values;
  chart?.setOption({
    animation: false,
    aria: { enabled: true, label: { description: ariaLabel } },
    grid: { top: 12, right: 8, bottom: 25, left: 42 },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (raw: unknown) => {
        const first = Array.isArray(raw) ? raw[0] : raw;
        if (typeof first !== "object" || first === null) return "";
        const index = Number((first as { dataIndex?: unknown }).dataIndex);
        const point = displayPoints[index];
        if (!point) return "";
        const distance = chartValues[index];
        const count = point.count == null ? "—" : Number(point.count).toLocaleString("hr-HR");
        const coverage=point.distanceCoverage==null||point.activityCount==null?"":`<br/>Udaljenost dostupna za ${Number(point.distanceCoverage).toLocaleString("hr-HR")}/${Number(point.activityCount).toLocaleString("hr-HR")} aktivnosti`;
        return `${fullDate(point.start)}<br/><b>${distance == null ? "—" : `${distance.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} km`}</b> · ${count} aktivnosti · ${escapeTooltip(sportLabel)}${coverage}${annotationTooltip(point, "start", "end")}`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: 8, hideOverlap: true, interval: Math.max(0, Math.ceil(displayPoints.length / 8) - 1), formatter: (value: string) => shortDate(value) },
    },
    yAxis: {
      type: "value",
      min: 0,
      splitNumber: 3,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: 8, formatter: (value: number) => `${Math.round(value)} km` },
    },
    series: [{
      type: "bar",
      data: chartValues.map((value, index) => value == null ? null : ({ value, itemStyle: { color: index === chartValues.length - 1 ? "#69d7ef" : "#347883", opacity: index === chartValues.length - 1 ? 1 : 0.78, borderRadius: [4, 4, 0, 0] } })),
      ...(annotationLines(displayPoints, "start", "end").length ? {
        markLine: { silent: true, symbol: "none", label: { show: false }, data: annotationLines(displayPoints, "start", "end") },
      } : {}),
      barMaxWidth: 24,
      emphasis: { focus: "series", itemStyle: { color: "#8eb0ee" } },
    }],
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
  if (chart) bindTimeSeriesInteractions(chart, chartTarget, displayPoints, "start", "end", (point) => {
    const distance = valueOf(point, "distanceKm");
    const count = point.count == null ? null : Number(point.count);
    const coverage=point.distanceCoverage==null||point.activityCount==null?"":`; udaljenost dostupna za ${Number(point.distanceCoverage).toLocaleString("hr-HR")}/${Number(point.activityCount).toLocaleString("hr-HR")} aktivnosti`;
    return `Udaljenost · ${sportLabel}: ${distance == null ? "nema podatka" : `${distance.toLocaleString("hr-HR", { maximumFractionDigits: 1 })} km`}; aktivnosti: ${count == null || !Number.isFinite(count) ? "nema podatka" : count.toLocaleString("hr-HR")}${coverage}`;
  });
}

export function renderHeartRateZoneComparison(
  id: string,
  recent: Array<{ zone: number; seconds: number | null; percentage: number | null }>,
  previous: Array<{ zone: number; seconds: number | null; percentage: number | null }>,
): void {
  const periods = [previous, recent];
  const names = ["Z1 · oporavak", "Z2 · lagano", "Z3 · aerobno", "Z4 · prag", "Z5 · visoki intenzitet"];
  const legendNames = ["Z1", "Z2", "Z3", "Z4", "Z5"];
  const colors = ["#5bb6d0", "#69d7ef", "#78bce8", "#b9a2fa", "#c79be8"];
  const target = prepareTarget(id, periods.flat(), "Usporedba vremena trčanja u pet Garminovih zona pulsa tijekom dva četverotjedna razdoblja", 205);
  if (!target) return;
  const chart = echarts.getInstanceByDom(target);
  const secondsText = (value: number | null) => value == null ? "—" : `${(value / 60).toLocaleString("hr-HR", { maximumFractionDigits: 0 })} min`;
  chart?.setOption({
    animation: false,
    aria: { enabled: true, label: { description: "Usporedba raspodjele vremena trčanja u Garminovim zonama pulsa, posljednja četiri tjedna prema prethodna četiri" } },
    color: colors,
    grid: { top: 22, right: 12, bottom: 43, left: 38, containLabel: false },
    legend: { bottom: 0, left: "center", itemWidth: 9, itemHeight: 8, itemGap: 12, textStyle: { color: textColor, fontSize: 9 }, data: legendNames },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (raw: unknown) => {
        const params = Array.isArray(raw) ? raw : [raw];
        const first = params[0];
        if (typeof first !== "object" || first === null) return "";
        const index = Number((first as { dataIndex?: unknown }).dataIndex);
        const period = periods[index];
        if (!period) return "";
        const total = period.reduce((sum, zone) => sum + (Number(zone.seconds) || 0), 0);
        const rows = period.map((zone) => {
          const name = names[Math.max(0, Math.min(names.length - 1, Number(zone.zone) - 1))];
          const pct = zone.percentage == null ? "—" : `${Number(zone.percentage).toLocaleString("hr-HR", { maximumFractionDigits: 1 })}%`;
          return `${name}: <b>${secondsText(zone.seconds)}</b> · ${pct}`;
        });
        const label = index === 1 ? "Posljednja 4 tjedna" : "Prethodna 4 tjedna";
        return `<b>${label}</b><br/>Ukupno ${secondsText(total || null)}<br/>${rows.join("<br/>")}`;
      },
    },
    xAxis: {
      type: "category",
      data: ["Prethodna 4 tjedna", "Posljednja 4 tjedna"],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: 8, interval: 0, hideOverlap: false, lineHeight: 11 },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      splitNumber: 4,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: 8, formatter: (value: number) => `${Math.round(value)}%` },
    },
    series: names.map((_, index) => ({
      name: legendNames[index],
      type: "bar",
      stack: "zone-share",
      barWidth: 44,
      emphasis: { focus: "series" },
      itemStyle: { borderColor: "rgba(8,15,19,.45)", borderWidth: 1, borderRadius: index === names.length - 1 ? [4, 4, 0, 0] : 0 },
      data: periods.map((period) => period[index]?.percentage ?? null),
    })),
  } as EChartsOption, { notMerge: true, lazyUpdate: true });
  chart?.resize();
}
