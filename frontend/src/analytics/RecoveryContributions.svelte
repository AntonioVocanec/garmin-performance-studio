<script lang="ts">
 import {onMount} from 'svelte';
 import {dashboardSnapshot,numberText,selectedDate,type Contribution,type RecoveryContributions} from '../lib/analyticsApi';
 let data=$state<RecoveryContributions|null>(null);
 const display=(v:number|null,unit:string)=>{if(v==null)return '—';if(unit!=='s')return `${numberText(v)} ${unit}`;const minutes=Math.round(Math.abs(v)/60);return `${v<0?'−':''}${Math.floor(minutes/60)} h ${minutes%60} min`};
 function compactStatus(signal: Contribution) {
  if (signal.value === null) return 'Nema zapisa';
  if (signal.partial) return 'Djelomični podaci';
  if (signal.delta === 0) return 'Na medijanu';
  if (signal.delta !== null) return `${signal.delta > 0 ? '+' : '−'}${display(Math.abs(signal.delta), signal.unit)} prema bazi`;
  if (signal.expectedDays > 1) return `${signal.sampleDays}/${signal.expectedDays} dana`;
  return 'Dostupno';
 }
 onMount(()=>{
  const update=(p:Record<string,unknown>|null)=>{data=p?.date===selectedDate()?((p?.normalized as Record<string,unknown>)?.recoveryContributions as RecoveryContributions)??null:null};
  update(dashboardSnapshot);const change=()=>{data=null};const receive=(e:Event)=>update((e as CustomEvent<Record<string,unknown>>).detail);
  window.addEventListener('analytics:dashboard',receive);document.getElementById('date')?.addEventListener('change',change);
  return()=>{window.removeEventListener('analytics:dashboard',receive);document.getElementById('date')?.removeEventListener('change',change)};
 });
</script>
<section id="recovery-contributions" class="recovery-contribution-panel" aria-labelledby="recovery-contribution-title">
 <h3 id="recovery-contribution-title">Što doprinosi današnjem oporavku?</h3>
 <p class="quiet">{data?.summary??'Doprinosi će se prikazati nakon učitavanja Garmin podataka.'}</p>
 <div class="recovery-contributions-grid">
  {#each data?.signals??[] as signal (signal.key)}
   <details class="analytics-card recovery-contribution">
    <summary>
     <span class="contribution-label">{signal.label}</span>
     <small>{compactStatus(signal)}</small>
    </summary>
    <div class="contribution-detail">
    {#if signal.value !== null}
     <p><strong>{display(signal.value, signal.unit)}</strong></p>
    {/if}
    <p>{signal.note}</p>
    {#if signal.baseline!==null}
     <p>Osobni medijan {display(signal.baseline,signal.unit)}{#if signal.delta!==null} · {signal.delta>0?'+':''}{display(signal.delta,signal.unit)}{/if} · {signal.baselineDays}/28 dana.</p>
    {:else if ['sleep','hrv','rhr'].includes(signal.key)}
     <p>Osobna baza obuhvaća {signal.baselineDays}/28 dana. Za usporedbu treba najmanje 7.</p>
    {/if}
    {#if signal.value===null}
     <p class="quiet">Nema zapisa za odabrani dan.</p>
    {:else if signal.expectedDays>1}
     <p class="quiet">{signal.sampleDays}/{signal.expectedDays} dana s podacima</p>
    {:else if signal.partial}
     <p class="quiet">Djelomični podaci</p>
    {/if}
     <p class="quiet">Datum · {signal.date}</p>
    </div>
   </details>
  {/each}
 </div>
 <p class="quiet">Svaki signal daje zaseban kontekst. Prikaz ne dodjeljuje novi rezultat spremnosti niti određuje intenzitet treninga.</p>
</section>
