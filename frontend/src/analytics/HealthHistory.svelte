<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {analytics,healthHistory,shift,selectedDate,type Range,type HealthHistory} from '../lib/analyticsApi';
 import AnalyticsSeries from './Series.svelte';
 let opened=$state(false),metric=$state('hrv'),span=$state('56'),end=$state(''),start=$state(''),data=$state<HealthHistory|null>(null),busy=$state(false),error=$state('');
 let controller:AbortController|undefined;
 const labels:Record<string,string>={hrv:'HRV',restingHeartRate:'Puls u mirovanju',sleepSeconds:'San',sleepScore:'Sleep Score',stress:'Stres',bodyBattery:'Body Battery',dayRespiration:'Disanje',daySpO2:'SpO₂',skinTemperature:'Temperatura kože'};
 const preset=(days:string)=>{span=days;end=selectedDate();start=shift(end,-(Number(days)-1));void load()};
 async function load(){
  controller?.abort();if(!opened||!start||!end)return;
  const c=new AbortController();controller=c;data=null;busy=true;error='';const key=metric;const range:Range={start,end};
  if(start>end||end>selectedDate()||start<shift(end,-364)){error='Odaberi do 365 dana, zaključno s datumom pregleda.';busy=false;return}
  try{
   let result=await healthHistory(range,key,c.signal);if(c.signal.aborted)return;data=result;
   const missing=result.coverage[key].missingDates;
   for(let i=0;i<missing.length;){
    const a=missing[i],b=[shift(a,13),range.end].sort()[0];while(i<missing.length&&missing[i]<=b)i++;
    const fetched=await analytics<{rateLimited:boolean;sources:Record<string,{ok:boolean;partial:boolean}>}>('/health/fetch',c.signal,{start:a,end:b,metrics:[key]});
    result=await healthHistory(range,key,c.signal);if(c.signal.aborted)return;data=result;
    if(fetched.rateLimited){error='Garmin je ograničio zahtjeve. Spremljeni podaci ostaju prikazani; nastavi kasnije.';break}
    if(Object.values(fetched.sources).some(s=>!s.ok||s.partial)){error='Izvor nije potpuno dostupan. Prikazani su sačuvani zapisi; pokušaj ponovno kasnije.';break}
   }
  }catch(e){if(!c.signal.aborted)error=e instanceof Error?e.message:'Povijest nije dostupna.'}finally{if(controller===c)busy=false}
 }
 onMount(()=>{
  end=selectedDate();start=shift(end,-55);
  const change=()=>{controller?.abort();data=null;if(span==='custom'){end=[end,selectedDate()].sort()[0];if(start>end)start=shift(end,-27)}else{end=selectedDate();start=shift(end,-(Number(span)||56)+1)}void load()};
  const globalRange=(event:Event)=>{const range=(event as CustomEvent<Range|null>).detail;if(range){start=range.start;end=range.end;span='custom'}else{span='56';end=selectedDate();start=shift(end,-55)}void load()};
  document.getElementById('date')?.addEventListener('change',change);window.addEventListener('analytics:range',globalRange);
  return()=>{document.getElementById('date')?.removeEventListener('change',change);window.removeEventListener('analytics:range',globalRange)};
 });
 onDestroy(()=>controller?.abort());
 const coverage=$derived(data?.coverage[metric]);
 const valueText=(value:unknown)=>{if(value==null)return '—';if(metric!=='sleepSeconds')return Number(value).toLocaleString('hr-HR',{maximumFractionDigits:2});const n=Math.round(Number(value));return `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
</script>
<details class="panel analytics-panel" id="health-history-panel" ontoggle={(e)=>{opened=e.currentTarget.open;if(opened)void load();else controller?.abort()}}>
 <summary><strong>Zdravstvena povijest · do 12 mjeseci</strong></summary>
 <p class="quiet">Odaberi metriku i razdoblje. Podaci se dopunjavaju postupno; prazni dani ostaju prazni.</p>
 <div class="analytics-controls"><label>Metrika<select bind:value={metric} onchange={()=>void load()}>{#each Object.entries(labels) as [key,label]}<option value={key}>{label}</option>{/each}</select></label>
 <label>Razdoblje<select aria-label="Razdoblje zdravstvene povijesti" bind:value={span} onchange={()=>span==='custom'?undefined:preset(span)}>{#each [7,28,56,90,180,365] as n}<option value={String(n)}>{n} dana</option>{/each}<option value="custom">Vlastito</option></select></label></div>
 <form class="analytics-controls" onsubmit={(e)=>{e.preventDefault();void load()}}><label>Od<input type="date" bind:value={start} max={end}/></label><label>Do<input type="date" bind:value={end} max={selectedDate()}/></label><button class="btn" type="submit">{busy?'Ponovno učitaj':'Učitaj razdoblje'}</button></form>
 <div aria-live="polite"><p>{busy?'Dopunjavam povijest… ':''}{coverage?`${coverage.days}/${coverage.expectedDays} dana s mjerenjem · ${coverage.source}`:'Čeka odabir.'}</p>{#if error}<p class="analytics-error" role="status">{error}</p>{/if}</div>
 {#if data&&coverage}<p class="quiet">Traženo {start} – {end} · mjerenja {coverage.availableStart??'nisu dostupna'} – {coverage.availableEnd??'—'} · uspješno dohvaćeno {coverage.fetchedDays} dana. Izvori i vrijeme dohvata nalaze se uz svaki redak.</p>
 <AnalyticsSeries id="health-history-chart" title={coverage.label} rows={metric==='sleepSeconds'?data.rows.map(r=>({...r,sleepSeconds:r.sleepSeconds==null?null:Number(r.sleepSeconds)/3600})):data.rows} series={[{key:metric,label:coverage.label,color:'#69d7ef'}]} unit={metric==='sleepSeconds'?'h':coverage.unit}/>
 <details><summary>Izvor i vrijeme dohvata</summary><div class="analytics-table"><table><thead><tr><th>Datum</th><th>Vrijednost · {metric==='sleepSeconds'?'HH:MM:SS':coverage.unit}</th><th>Izvor / dohvat</th></tr></thead><tbody>{#each data.rows as row}{@const observation=(row.observations as Record<string,{source:string;fetchedAt:string}>)?.[metric]}<tr><td>{String(row.date)}</td><td>{valueText(row[metric])}</td><td>{observation?.source??'Nema zapisa'}<br/>{observation?.fetchedAt?new Date(observation.fetchedAt).toLocaleString('hr-HR',{timeZone:'Europe/Zagreb'}):'—'}</td></tr>{/each}</tbody></table></div></details>{/if}
</details>
