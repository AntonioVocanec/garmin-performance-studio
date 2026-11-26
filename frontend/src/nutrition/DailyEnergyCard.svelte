<script lang="ts">
  import {fmt, comparisonNutrients, carbExplanation, type Diary, type Energy} from '../lib/nutritionApi';

  let {diary, energy, busy, settingsReady, onsettings, oncomplete}: {
    diary: Diary; energy: Energy | null; busy: boolean; settingsReady: boolean;
    onsettings: () => void; oncomplete: () => void;
  } = $props();
  const target = $derived(Number(diary.targets.calories) > 0 ? Number(diary.targets.calories) : null);
  const intake = $derived(diary.nutrients.kcal == null ? null : Number(diary.nutrients.kcal));
  const remaining = $derived(target !== null && intake !== null ? Math.round(target - intake) : null);
  const progress = $derived(target !== null && intake !== null ? Math.min(100, intake / target * 100) : 0);
  const garmin = $derived(energy?.date === diary.date && energy.status !== 'unavailable' ? energy : null);
  const macros = $derived(comparisonNutrients(diary));
  const useReportedCarbs = $derived(macros.carbs == null && diary.nutrients.carbs != null);
  const labels = [['protein','Proteini'],['carbs','Ugljikohidrati'],['fat','Masti'],['fiber','Vlakna']] as const;
</script>

<article class="panel nutrition-day-summary" aria-label="Energija">
  <header>
    <div><h3>Energija</h3><span>{target === null ? 'Dnevni cilj nije postavljen' : 'Cilj '+fmt(target,0)+' kcal'}</span></div>
    <button type="button" class="settings" disabled={!settingsReady} onclick={onsettings} aria-label="Uredi ciljeve prehrane" title="Uredi ciljeve prehrane">⚙</button>
  </header>
  <div class="balance">
    <div class="side"><span>Uneseno</span><strong>{fmt(intake,0)}</strong><small>kcal</small></div>
    <div class="gauge" class:over={remaining !== null && remaining < 0}>
      <svg viewBox="0 0 160 136" aria-hidden="true">
        <path d="M 25 119 A 66 66 0 1 1 135 119" pathLength="100"/>
        {#if progress > 0}<path class="fill" d="M 25 119 A 66 66 0 1 1 135 119" pathLength="100" stroke-dasharray={progress+' 100'}/>{/if}
      </svg>
      <div class="reading">
        <strong>{fmt(remaining === null ? null : Math.abs(remaining),0)}</strong>
        <small>{remaining !== null && remaining < 0 ? 'kcal iznad cilja' : 'kcal do cilja'}</small>
      </div>
    </div>
    <div class="side"><span>Aktivno</span><strong>{fmt(garmin?.activeCalories,0)}</strong><small>kcal · Garmin</small></div>
  </div>
  <section>
    <h4>Makronutrijenti</h4>
    <div class="macros">
      {#each labels as [key,label]}
        {@const reported = key === 'carbs' && useReportedCarbs}
        {@const value = reported ? diary.nutrients.carbs : macros[key]}
        {@const goal = Number(diary.targets[key])}
        <div class={'macro '+key}>
          <span>{label}</span>
          {#if goal > 0 && value != null}
            <progress aria-label={reported ? 'Ugljikohidrati prema zapisima · okvirni napredak' : label} value={Math.min(Number(value),goal)} max={goal}></progress>
          {/if}
          <strong>{key === 'carbs' && !reported && value != null && diary.carbComparison === 'estimated' ? '≈ ' : ''}{fmt(value)}{goal > 0 ? ' / '+fmt(goal) : ''} g</strong>
          {#if reported}<small>{goal > 0 ? 'Okvirno · prema zapisima' : 'Prema zapisima'}</small>{/if}
        </div>
      {/each}
    </div>
    <details>
      <summary>Kako se računa?</summary>
      <p>Preostale kalorije razlika su između cilja i unosa iz dnevnika. Aktivne kalorije prikazane su zasebno.</p>
      {#if garmin?.provisional || garmin?.status==='partial'}<p>Garminov podatak obuhvaća dosad sinkroniziranu aktivnost.</p>{/if}
      {#if diary.entries.length}
        <p>{useReportedCarbs ? 'Zbroj ugljikohidrata dolazi iz evidentiranih obroka. Zapisi mogu različito računati vlakna, pa je usporedba s ciljem okvirna.' : carbExplanation(diary.carbComparison)}</p>
        <p>UH {fmt(diary.nutrients.carbs)} g prema izvornim zapisima. Energija prema izvornoj deklaraciji.</p>
      {/if}
    </details>
  </section>
  <button type="button" class="completion" role="switch" aria-checked={diary.complete} disabled={busy} onclick={oncomplete}>
    Dnevnik je potpun <span class="switch" aria-hidden="true"></span>
  </button>
</article>

<style>
  header,.completion {display:flex; align-items:center; justify-content:space-between; gap:8px}
  header h3,section h4 {margin:0}
  header span,small,.side span,.macro span,details {color:var(--muted); font-size:var(--text-detail)}
  .settings,.completion {color:var(--text); background:transparent; border:0; cursor:pointer; min-height:44px}
  .settings {font-size:1.45rem; width:44px; border-radius:50%; background:var(--surface-hi)}
  .balance {display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.8fr) minmax(0,1fr); align-items:center; text-align:center; margin-block:8px}
  .side,.reading {display:grid; justify-items:center; gap:2px; min-width:0}
  .side strong,.reading strong,.macro strong {font-variant-numeric:tabular-nums}
  .side strong {font-size:1.25rem}
  .gauge {position:relative; width:100%; max-width:184px; justify-self:center; color:var(--mint)}
  .gauge.over {color:var(--amber)}
  svg {display:block; width:100%}
  path {stroke:var(--line); stroke-width:10; fill:none; stroke-linecap:round}
  path.fill {stroke:currentColor}
  .reading {position:absolute; inset:22% 0 0; align-content:center}
  .reading strong {font-size:clamp(1.4rem,3vw,2.25rem); line-height:1.1}
  .reading small {font-size:var(--text-caption); color:var(--text)}
  .macros {display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 20px; margin-block:12px 4px}
  .macro {display:flex; flex-direction:column; justify-content:space-between; gap:4px; --accent:var(--cyan)}
  .protein {--accent:var(--violet)} .fat {--accent:var(--amber)}
  .macro progress {appearance:none; height:5px; border:0; border-radius:6px; overflow:hidden; background:var(--line)}
  progress::-webkit-progress-bar {background:var(--line)}
  progress::-webkit-progress-value {background:var(--accent)}
  progress::-moz-progress-bar {background:var(--accent)}
  .macro strong {font-size:var(--text-detail)}
  details {margin-top:8px}
  .completion {width:100%; padding:12px 0 0; border-top:1px solid var(--line); font:inherit; text-align:start}
  .switch {width:40px; height:24px; border:1px solid var(--muted); border-radius:14px; padding:3px}
  .switch::before {content:''; display:block; width:16px; height:16px; border-radius:50%; background:var(--muted)}
  [aria-checked=true] .switch {background:var(--mint); border-color:var(--mint)}
  [aria-checked=true] .switch::before {margin-left:auto; background:var(--bg)}
</style>
