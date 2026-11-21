<script lang="ts">
  import {fmt, type Entry, type Nutrients, type PlanEntry} from '../lib/nutritionApi';

  let {meal, busy, loading, planStatusLabels, onadd, onundo}: {
    meal: {key:string; label:string; entries:Entry[]; planned:PlanEntry[]};
    busy:boolean; loading:boolean; planStatusLabels:Record<string,string>;
    onadd:(trigger:HTMLButtonElement)=>void; onundo:(id:string)=>void;
  } = $props();
  let expanded = $state(true);
  let editing = $state(false);

  function total(key:keyof Nutrients, useSourceCarbs=false) {
    let sum = 0;
    for (const {nutrients} of meal.entries) {
      const value = key === 'carbs' && !useSourceCarbs ? nutrients.comparableNutrients?.carbs : nutrients[key];
      if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value))) return null;
      sum += Number(value);
    }
    return sum;
  }
  const comparableCarbs = $derived(total('carbs'));
  const reportedCarbs = $derived(comparableCarbs === null ? total('carbs',true) : null);
  const estimatedCarbs = $derived(comparableCarbs !== null && meal.entries.some(entry=>entry.nutrients.carbComparison==='estimated'));
  const macros = [
    ['protein','proteina'], ['carbs','UH'], ['fiber','vlakana'], ['fat','masti'],
  ] as const;
  const units:Record<string,string> = {piece:'kom', portion:'porc.'};
  const icons:Record<string,string> = {food:'🧺', recipe:'🥣', portion:'🍽️'};
</script>

<section class="nutrition-meal" aria-labelledby={'diary-meal-'+meal.key}>
  <header>
    <h4 id={'diary-meal-'+meal.key}>
      <button class="toggle" aria-expanded={expanded} aria-controls={'meal-body-'+meal.key}
        onclick={()=>{expanded=!expanded; editing=false}}>
        <span class="chevron" class:expanded aria-hidden="true"></span>{meal.label}
      </button>
    </h4>
    {#if meal.entries.length}
      <strong class="meal-energy">{fmt(total('kcal'),0)} <small>kcal</small></strong>
    {/if}
  </header>
  {#if meal.entries.length}
    <div class="macros">
      {#each macros as [key,label]}
        {#if key === 'carbs' && reportedCarbs !== null}
          <span>{fmt(reportedCarbs)} g UH iz zapisa</span>
        {:else if key === 'carbs'}
          <span>{estimatedCarbs ? '≈ ' : ''}{fmt(comparableCarbs)} g UH</span>
        {:else}
          <span>{fmt(total(key))} g {label}</span>
        {/if}
      {/each}
    </div>
  {/if}
  <div id={'meal-body-'+meal.key} hidden={!expanded}>
    {#if meal.entries.length}
      <ul aria-label="Evidentirano">
        {#each meal.entries as entry (entry.id)}
          <li>
            <span class="item-icon" aria-hidden="true">{icons[entry.nutrients.sourceKind??'']??'🍽️'}</span>
            <div class="item"><strong>{entry.name}</strong><small>{fmt(entry.quantity,3)} {units[entry.unit]??entry.unit}</small></div>
            <span class="energy">{fmt(entry.nutrients.kcal,0)} <small>kcal</small></span>
            {#if editing}
              <button class="undo" aria-label={'Poništi unos · '+entry.name} disabled={busy}
                onclick={()=>onundo(entry.operation_id)}>Poništi unos</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if meal.planned.length}
      <p class="planned-label">Iz plana</p>
      <ul aria-label="Iz plana">
        {#each meal.planned as planned (planned.id)}
          <li>
            <span class="item-icon" aria-hidden="true">🍽️</span>
            <div class="item"><strong>{planned.name}</strong><small>{planStatusLabels[planned.status]??'Iz plana'} · {fmt(planned.portions,3)} porc.</small></div>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      {#if meal.entries.length}
        <button class="edit" aria-pressed={editing} onclick={()=>editing=!editing}>{editing?'Završi uređivanje':'Uredi unose'}</button>
      {:else}
        <span class="empty">Nema unosa</span>
      {/if}
      <button class="add" aria-label={'Dodaj unos · '+meal.label} disabled={loading||busy}
        onclick={event=>onadd(event.currentTarget)}><span aria-hidden="true">+</span> Dodaj unos</button>
    </div>
  </div>
</section>

<style>
  .nutrition-meal {
    background:var(--surface); border:1px solid var(--line); border-radius:16px;
    margin-block:10px; padding:12px clamp(12px,2vw,22px) 16px;
  }
  header,.actions {display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap}
  .nutrition-meal header h4 {margin:0; flex:1}
  button {font:inherit; cursor:pointer; min-height:44px; border:0; border-radius:8px}
  button:disabled {opacity:.55; cursor:default}
  .toggle {display:flex; gap:12px; align-items:center; width:100%; padding:0; background:transparent; color:var(--text); font-size:1.12rem; font-weight:750}
  .chevron {width:8px; height:8px; border:solid var(--muted); border-width:0 2px 2px 0; transform:rotate(45deg)}
  .chevron.expanded {transform:rotate(225deg)}
  .meal-energy,.energy {font-variant-numeric:tabular-nums; white-space:nowrap}
  .meal-energy {font-size:1.1rem}
  small,.macros,.empty,.planned-label {color:var(--muted); font-size:var(--text-detail)}
  .macros {display:flex; gap:2px 8px; flex-wrap:wrap; margin:0 0 8px 20px}
  .macros span {white-space:nowrap}
  .macros span:not(:last-child)::after {content:' ·'; color:var(--muted)}
  ul {list-style:none; margin:0; padding:0}
  li {display:grid; grid-template-columns:32px minmax(0,1fr) auto; align-items:center; gap:4px 10px; padding:10px 0; border-top:1px solid var(--line)}
  .item-icon {font-size:1.3rem; text-align:center}
  .item {display:grid; overflow-wrap:anywhere}
  .energy {text-align:end}
  .actions {margin-top:6px}
  .add {margin-inline-start:auto; border-radius:24px; padding:8px 18px; background:var(--cyan); color:var(--bg); font-weight:750}
  .add:hover:enabled {filter:brightness(1.1)}
  .edit,.undo {padding:4px; background:transparent; color:var(--muted); font-size:var(--text-detail); text-decoration:underline; text-underline-offset:3px}
  .undo {grid-column:2/-1; justify-self:start}
  .planned-label {font-weight:650}
</style>
