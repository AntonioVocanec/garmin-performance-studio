<script lang="ts">
  import { onMount } from 'svelte';

  interface Day { date: string; code: number | null; low: number | null; high: number | null; rainChance: number | null }
  interface Forecast { days: Day[]; updatedAt: string; stale: boolean }

  const zone = 'Europe/Zagreb';
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const rangeDate = new Intl.DateTimeFormat('hr-HR', { timeZone: zone, day: 'numeric', month: 'numeric' });
  const weekday = new Intl.DateTimeFormat('hr-HR', { timeZone: zone, weekday: 'short' });
  const localTime = new Intl.DateTimeFormat('hr-HR', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  const noon = (date: string) => new Date(date + 'T12:00:00Z');
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

  onMount(() => {
    const controller = new AbortController();
    let busy = false;
    let requestedDay = '';
    let nextCheck = 0;

    async function refresh() {
      const today = localDate.format(new Date());
      if (today !== requestedDay) {
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
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  });
</script>

<section class="forecast" aria-labelledby="forecast-heading">
  <h2 id="forecast-heading">Bjelovar · prognoza za 7 dana
    {#if forecast}<small>{rangeDate.format(noon(forecast.days[0].date))} – {rangeDate.format(noon(forecast.days[6].date))}</small>{/if}
  </h2>
  {#if forecast}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable forecast must accept keyboard focus.) -->
    <div class="strip" role="region" aria-label="Sedmodnevna vremenska prognoza" tabindex="0">
      <ol>
        {#each forecast.days as day, index (day.date)}
          {@const weather = condition(day.code)}
          <li>
            <time datetime={day.date}>{index === 0 ? 'Danas' : weekday.format(noon(day.date))}</time>
            <span class="icon" role="img" aria-label={weather?.[2] ?? 'Opis vremena nije dostupan'} title={weather?.[2]}>{weather?.[1] ?? '—'}</span>
            <span><span class="low" title="Najniža temperatura"><span class="sr">Najniža </span>{quantity(day.low, '°')}</span> / <b title="Najviša temperatura"><span class="sr">Najviša </span>{quantity(day.high, ' °C')}</b></span>
            <small>Oborine {quantity(day.rainChance, ' %')}</small>
          </li>
        {/each}
      </ol>
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
  .strip { overflow-x: auto; overscroll-behavior-x: contain; }
  .strip:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
  ol { display: grid; grid-template-columns: repeat(7, minmax(6.6rem, 1fr)); list-style: none; margin: 0; padding: 0; }
  li { display: grid; justify-items: center; gap: .15rem; padding: .35rem .15rem; font-size: var(--text-detail); white-space: nowrap; font-variant-numeric: tabular-nums; }
  li + li { border-left: 1px solid var(--line); }
  li:first-child time { color: var(--cyan); }
  time { font-weight: 700; }
  .icon { font-size: 1.3rem; }
  .low { color: var(--muted); }
  footer { margin-top: .5rem; }
  a { color: var(--muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
