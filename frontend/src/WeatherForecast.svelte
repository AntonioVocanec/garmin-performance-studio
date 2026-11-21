<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardSnapshot } from './lib/analyticsApi';

  type Metric = 'temp' | 'rain' | 'wind';
  interface Hour { time: string; temp: number | null; rain: number | null; wind: number | null; direction: number | null }
  interface Current extends Hour { humidity: number | null; code: number | null; daylight: number | null }
  interface Day { date: string; hours?: Hour[]; code: number | null; low: number | null; high: number | null; rainChance: number | null }
  interface Forecast { days: Day[]; current?: Current | null; updatedAt: string; stale: boolean }

  interface PlannedRun {
    title: string;
    date: string;
    start?: string;
    allDay?: boolean;
    distanceKm?: number | null;
    durationSeconds?: number | null;
  }
  interface RunnaSchedule {
    ok: boolean;
    configured: boolean;
    upcomingRuns?: PlannedRun[];
  }

  const zone = 'Europe/Zagreb';
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const rangeDate = new Intl.DateTimeFormat('hr-HR', { timeZone: zone, day: 'numeric', month: 'numeric' });
  const weekday = new Intl.DateTimeFormat('hr-HR', { timeZone: zone, weekday: 'short' });
  const localTime = new Intl.DateTimeFormat('hr-HR', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  const noon = (date: string) => new Date(date + 'T12:00:00Z');
  const decimal = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 });
  const quantity = (value: number | null, unit: string) => value == null ? '—' : Math.round(value) + unit;

  const conditions: [number[], string, string][] = [
    [[0], '☀️', 'Vedro'], [[1, 2], '🌤️', 'Djelomice sunčano'], [[3], '☁️', 'Oblačno'],
    [[45, 48], '🌫️', 'Magla'], [[51, 53, 55], '🌦️', 'Rosulja'], [[56, 57], '🌧️', 'Ledena rosulja'],
    [[61, 63, 65], '🌧️', 'Kiša'], [[66, 67], '🌧️', 'Ledena kiša'], [[71, 73, 75, 77], '🌨️', 'Snijeg'],
    [[80, 81, 82], '🌦️', 'Pljuskovi'], [[85, 86], '🌨️', 'Snježni pljuskovi'],
    [[95], '⛈️', 'Grmljavinsko nevrijeme'], [[96, 99], '⛈️', 'Grmljavinsko nevrijeme s tučom'],
  ];
  function condition(code: number | null) {
    return conditions.find(([codes]) => code !== null && codes.includes(code));
  }

  let forecast = $state<Forecast | null>(null);
  let loading = $state(true);

  let selected = $state(0);
  let metric = $state<Metric>('temp');
  const labels: Record<Metric, string> = {temp:'Temperatura', rain:'Oborine', wind:'Vjetar'};
  const metrics: Metric[] = ['temp','rain','wind'];
  const day = $derived(forecast?.days[selected]);
  const current = $derived(selected === 0 ? forecast?.current : null);
  const symbol = $derived(condition(current ? current.code : day?.code ?? null));
  const night = $derived(current?.daylight === 0 && (current.code === 0 || current.code === 1 || current.code === 2));
  const slots = $derived((day?.hours ?? []).filter(h => Number(h.time.slice(11,13)) % 3 === 0));
  const temperatures = $derived(slots.flatMap(h => h.temp === null ? [] : [h.temp]));
  const lower = $derived(Math.min(...temperatures) - 2);
  const upper = $derived(Math.max(...temperatures) + 2);
  function point(i: number, temp: number) {
    return ((i + .5) / slots.length * 100) + ',' + (62 - (temp - lower) / (upper - lower) * 54);
  }

  let schedule = $state<RunnaSchedule | null>(null);
  let popupDay = $state<Day | null>(null);
  let popupLeft = $state(0);
  let dayStrip = $state<HTMLDivElement>();
  let popupTrigger: HTMLButtonElement | null = null;
  let popupInput: 'pointer' | 'focus' | 'touch' | null = null;
  const upcoming = $derived(schedule?.ok ? schedule.upcomingRuns ?? [] : []);
  const dayRuns = $derived(upcoming.filter(run => run.date === popupDay?.date));
  const beyondVisiblePlan = $derived(popupDay && upcoming.length >= 8 && popupDay.date > upcoming[upcoming.length - 1].date);

  function showPlan(day: Day, trigger: HTMLButtonElement, input: NonNullable<typeof popupInput>, cursorX?: number) {
    if (!dayStrip) return;
    const strip = dayStrip.getBoundingClientRect();
    const button = trigger.getBoundingClientRect();
    const width = Math.min(224, strip.width);
    const anchor = cursorX ?? button.left + button.width / 2;
    popupLeft = Math.max(0, Math.min(strip.width - width, anchor - strip.left + 12));
    popupDay = day;
    popupTrigger = trigger;
    popupInput = input;
  }

  function hidePlan() {
    popupDay = null;
    popupTrigger = null;
    popupInput = null;
  }

  function trainingDetails(run: PlannedRun) {
    const time = new Date(run.start ?? '');
    return [
      run.allDay || !Number.isFinite(time.getTime()) ? 'Termin nije zadan' : localTime.format(time),
      run.distanceKm != null ? decimal.format(run.distanceKm) + ' km' : null,
      run.durationSeconds != null && run.durationSeconds > 0 ? Math.max(1, Math.round(run.durationSeconds / 60)) + ' min' : null,
    ].filter(Boolean).join(' · ');
  }

  onMount(() => {
    function readSchedule(payload: Record<string, unknown> | null) {
      const normalized = payload?.normalized as { runnaSchedule?: RunnaSchedule } | undefined;
      schedule = normalized?.runnaSchedule ?? null;
    }
    const receiveSchedule = (event: Event) => readSchedule((event as CustomEvent<Record<string, unknown>>).detail);
    readSchedule(dashboardSnapshot);
    window.addEventListener('analytics:dashboard', receiveSchedule);
    const controller = new AbortController();
    let busy = false;
    let requestedDay = '';
    let nextCheck = 0;

    async function refresh() {
      const today = localDate.format(new Date());
      if (today !== requestedDay) {
        selected = 0;
        hidePlan();
        forecast = null;
        loading = true;
      }
      if (busy || (today === requestedDay && Date.now() < nextCheck)) return;
      requestedDay = today;
      busy = true;
      try {
        const response = await fetch('/api/weather/forecast', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: Forecast = await response.json();
        if (data.days?.length !== 7 || data.days[0].date !== today) throw new Error();
        forecast = data;
        nextCheck = data.stale ? Date.now() + 300_000 : Date.parse(data.updatedAt) + 3_600_000;
      } catch {
        if (forecast) forecast = { ...forecast, stale: true };
        nextCheck = Date.now() + 300_000;
      } finally {
        busy = false;
        loading = false;
        if (!controller.signal.aborted && today !== localDate.format(new Date())) void refresh();
      }
    }
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    let timer: number;
    function scheduleMinute() {
      timer = window.setTimeout(() => {
        visible();
        scheduleMinute();
      }, 60_000 - Date.now() % 60_000);
    }
    scheduleMinute();
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      window.removeEventListener('analytics:dashboard', receiveSchedule);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  });
</script>

<svelte:window onresize={hidePlan} />

<section class="forecast" aria-labelledby="forecast-heading">
  <h2 id="forecast-heading">Bjelovar · prognoza za 7 dana
    {#if forecast}<small>{rangeDate.format(noon(forecast.days[0].date))} – {rangeDate.format(noon(forecast.days[6].date))}</small>{/if}
  </h2>
  {#if forecast}
    {#if day}
      <div class="summary">
        <span class="big-icon" aria-hidden="true">{night ? '🌙' : symbol?.[1] ?? '—'}</span>
        <strong class="degrees">{current ? quantity(current.temp, '°') : quantity(day.high, '°')}<small>C</small></strong>
        <div class="facts">
          <span>Oborine {quantity(current ? current.rain : day.rainChance, ' %')}</span>
          {#if current}<span>Vlažnost {quantity(current.humidity, ' %')}</span><span>Vjetar {quantity(current.wind, ' km/h')}</span>
          {:else}<span>Najniža {quantity(day.low, ' °C')}</span>{/if}
        </div>
        <div class="when"><b>{current ? 'Trenutačno' : 'Dnevna prognoza'}</b>
          <span>{weekday.format(noon(day.date))} {rangeDate.format(noon(day.date))} {current?.time.slice(11,16) ?? ''}</span>
          <span>{night && current?.code !== 0 ? 'Djelomice oblačno' : symbol?.[2] ?? 'Opis vremena nije dostupan'}</span>
        </div>
      </div>
      <div class="modes" role="group" aria-label="Prikaz satne prognoze">
        {#each metrics as key}<button aria-pressed={key === metric} onclick={() => metric = key}>{labels[key]}</button>{/each}
      </div>
      {#if slots.some(h => h[metric] !== null)}
        <div class="timeline" aria-label={labels[metric]} style:--count={slots.length}>
          {#if metric === 'temp'}
            <svg viewBox="0 0 100 65" preserveAspectRatio="none" aria-hidden="true">
              {#each slots as h,i}
                {@const next = slots[i+1]}
                {#if h.temp !== null && next && next.temp !== null}
                  <polygon fill="#e4bb482d" points={point(i,h.temp)+' '+point(i+1,next.temp)+' '+((i+1.5)/slots.length*100)+',65 '+((i+.5)/slots.length*100)+',65'}/>
                  <line x1={(i+.5)/slots.length*100} x2={(i+1.5)/slots.length*100} y1={62-(h.temp-lower)/(upper-lower)*54} y2={62-(next.temp-lower)/(upper-lower)*54} stroke="#f1c447" stroke-width="2" vector-effect="non-scaling-stroke"/>
                {/if}
              {/each}
            </svg>
          {/if}
          {#each slots as hour}
            <div class="slot">
              <b>{quantity(hour[metric],metric === 'temp' ? '°' : metric === 'rain' ? '%' : '')}</b>
              {#if metric === 'wind'}<span class="wind-unit">km/h</span>
                <span class="arrow" aria-label={hour.direction == null ? 'Smjer nepoznat' : 'Vjetar iz smjera '+hour.direction+'°'} style:transform={'rotate('+((hour.direction ?? 0)+180)+'deg)'}>{hour.direction != null && hour.wind !== 0 ? '↑' : '·'}</span>
              {:else if metric === 'rain' && hour.rain !== null}<i style:height={(1 + hour.rain * .48)+'px'}></i>{/if}
              <small>{hour.time.slice(11,16)}</small>
            </div>
          {/each}
        </div>
      {:else}<p class="missing">Satna prognoza za ovaj prikaz nije dostupna.</p>{/if}
    {/if}
    <div class="day-strip" bind:this={dayStrip}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable forecast must accept keyboard focus.) -->
      <div class="strip" role="region" aria-label="Sedmodnevna vremenska prognoza" tabindex="0"
        onscroll={hidePlan}>
        <ol>
          {#each forecast.days as day, index (day.date)}
            {@const weather = condition(day.code)}
            <li>
              <button type="button" class="day" aria-pressed={selected === index}
                aria-describedby={popupDay?.date === day.date ? 'forecast-training-tip' : undefined}
                onpointermove={(event) => {
                  if (event.pointerType !== 'touch') showPlan(day, event.currentTarget, 'pointer', event.clientX);
                }}
                onpointerleave={(event) => {
                  if (popupTrigger === event.currentTarget && popupInput === 'pointer') hidePlan();
                }}
                onfocus={(event) => {
                  if (event.currentTarget.matches(':focus-visible')) showPlan(day, event.currentTarget, 'focus');
                }}
                onblur={(event) => {
                  if (popupTrigger === event.currentTarget && popupInput !== 'pointer') hidePlan();
                }}
                onclick={(event) => {
                  selected = index;
                  if (event instanceof PointerEvent && event.pointerType === 'touch') {
                    showPlan(day, event.currentTarget, 'touch');
                  }
                }}>
                <time datetime={day.date}>{index === 0 ? 'Danas' : weekday.format(noon(day.date))}</time>
                <span class="icon" role="img" aria-label={weather?.[2] ?? 'Opis vremena nije dostupan'} title={weather?.[2]}>{weather?.[1] ?? '—'}</span>
                <span><span class="low" title="Najniža temperatura"><span class="sr">Najniža </span>{quantity(day.low, '°')}</span> / <b title="Najviša temperatura"><span class="sr">Najviša </span>{quantity(day.high, ' °C')}</b></span>
                <small>Oborine {quantity(day.rainChance, ' %')}</small>
              </button>
            </li>
          {/each}
        </ol>
      </div>
      {#if popupDay}
        <div class="training-tip" id="forecast-training-tip" role="tooltip" style:left={popupLeft + 'px'}>
          <span class="tip-label">Runna · {weekday.format(noon(popupDay.date))} {rangeDate.format(noon(popupDay.date))}</span>
          {#each dayRuns as run}
            <div class="tip-run"><strong>{run.title}</strong><small>{trainingDetails(run)}</small></div>
          {:else}
            {#if !schedule?.ok}
              <span>Plan treninga trenutačno nije dostupan.</span>
            {:else if beyondVisiblePlan}
              <span>Prikaz rasporeda ne obuhvaća ovaj datum.</span>
            {:else}
              <span>Nema nadolazećeg trčanja u rasporedu.</span>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
    <footer>
      <a href="https://open-meteo.com/">Open-Meteo</a>
      {#if forecast.stale} · Zadnja dostupna prognoza u {localTime.format(new Date(forecast.updatedAt))}{/if}
    </footer>
  {:else}
    <p role="status">{loading ? 'Učitavam prognozu…' : 'Prognoza trenutačno nije dostupna'}</p>
  {/if}
</section>

<style>
  .forecast { margin-top: 1rem; padding-top: .85rem; border-top: 1px solid var(--line); min-width: 0; }
  h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: .25rem .75rem; margin: 0 0 .6rem; font-size: 1rem; }
  small, footer { font-size: var(--text-caption); font-weight: 500; color: var(--muted); }
  .day-strip { position: relative; }
  .training-tip {
    position: absolute;
    z-index: 2;
    bottom: calc(100% + 6px);
    pointer-events: none;
    box-sizing: border-box;
    width: min(100%, 224px);
    display: grid;
    gap: .25rem;
    padding: .5rem .625rem;
    border: 1px solid #36515a;
    border-radius: 9px;
    background: #10191f;
    color: #edf5f4;
    font-size: .75rem;
    line-height: 1.45;
    box-shadow: 0 8px 28px rgba(0,0,0,.35);
  }
  .tip-label { color: var(--muted); }
  .tip-run { display: grid; gap: .1rem; overflow-wrap: anywhere; }
  .tip-run strong::before { content: '● '; color: var(--cyan); }
  .tip-run small { font-size: inherit; }
  .strip { overflow-x: auto; overscroll-behavior-x: contain; }
  .strip:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
  ol { display: grid; grid-template-columns: repeat(7, minmax(6.6rem, 1fr)); list-style: none; margin: 0; padding: 0; }
  .summary { display:flex; align-items:center; gap:clamp(.45rem,2vw,1.3rem); flex-wrap:wrap; padding:.6rem 0; }
  .big-icon {font-size:clamp(2rem,5vw,3.4rem);line-height:1}
  .degrees {font-size:clamp(2rem,5vw,3.3rem);line-height:1;font-weight:550}
  .degrees small {vertical-align:top}
  .facts,.when {display:grid;font-size:var(--text-detail);color:var(--muted)}
  .when {margin-left:auto;text-align:right}.when b{color:var(--text)}
  .modes {display:flex;gap:1rem;margin:.7rem 0 .3rem}
  .modes button,.day {background:transparent;color:var(--text);border:none;cursor:pointer}
  .modes button {font-size:var(--text-detail);padding:.5rem 0;border-bottom:3px solid transparent}
  .modes button[aria-pressed=true]{border-color:#edbf4a}
  .timeline {position:relative;display:grid;grid-template-columns:repeat(var(--count),minmax(0,1fr));margin:.7rem 0 1rem}
  .timeline svg {position:absolute;top:26px;width:100%;height:55px;pointer-events:none}
  .slot {position:relative;height:106px;text-align:center;font-size:var(--text-detail)}
  .slot small,.slot i,.arrow,.wind-unit {position:absolute;left:0;right:0}
  .slot small {bottom:0}.slot i{bottom:25px;background:#76baff}.arrow{top:44px;font-size:1.3rem}.wind-unit{top:20px;font-size:var(--text-caption);color:var(--muted)}
  .missing {padding:1rem 0}
  .day[aria-pressed=true]{background:#25363d;border-radius:.6rem;box-shadow:inset 0 0 0 1px var(--line)}
  .day:focus-visible,.modes button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
  @media(max-width:520px){.when{width:100%;display:flex;flex-wrap:wrap;gap:.5rem;text-align:left}.slot small{font-size:var(--text-caption)}.timeline{overflow-x:auto;grid-template-columns:repeat(var(--count),minmax(0,1fr))}.slot small{letter-spacing:-.05em}}
  .day {width:100%;display: grid; justify-items: center; gap: .15rem; padding: .35rem .15rem; font-size: var(--text-detail); white-space: nowrap; font-variant-numeric: tabular-nums; }
  li + li { border-left: 1px solid var(--line); }
  li:first-child time { color: var(--cyan); }
  time { font-weight: 700; }
  .icon { font-size: 1.65rem; }
  .low { color: var(--muted); }
  footer { margin-top: .5rem; }
  a { color: var(--muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
