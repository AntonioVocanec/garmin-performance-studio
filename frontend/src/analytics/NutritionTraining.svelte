<script lang="ts">
 import {onDestroy} from 'svelte';
 import {analytics,shift,numberText as fmt} from '../lib/analyticsApi';
 import Series from './Series.svelte';
 let {date}:{date:string}=$props();
 interface Day {date:string;load:number|null;kcal:number|null;carbs:number|null;complete:boolean;carbComparison:string;nextDate:string;nextHrv:{value:number}|null;nextSleep:{value:number}|null;nextRestingHeartRate:{value:number}|null;exclusions:string[]}
 interface Context {rows:Day[];groups:{label:string;days:number;kcal:{value:number|null;days:number};carbs:{value:number|null;days:number};calorieTargetPercent:number|null;carbTargetPercent:number|null}[];eligibleDays:number;thresholds:{lowerMax:number|null;higherAbove:number|null};sufficient:boolean;note:string}
 let open=$state(false),span=$state('28'),data=$state<Context|null>(null),error=$state(''),busy=$state(false);let controller:AbortController|undefined;
 async function load(){controller?.abort();const c=new AbortController();controller=c;busy=true;data=null;error='';try{const r=await analytics<Context>(`/nutrition-training?start=${shift(date,-Number(span)+1)}&end=${date}`,c.signal);if(!c.signal.aborted)data=r}catch(e){if(!c.signal.aborted)error=e instanceof Error?e.message:'Učitavanje nije uspjelo.'}finally{if(controller===c)busy=false}}
 $effect(()=>{date;span;if(open)void load()});onDestroy(()=>controller?.abort());
</script>
<details class="panel analytics-panel nutrition-wide" id="nutrition-training-context" ontoggle={e=>open=e.currentTarget.open}><summary><strong>Prehrana, trening i oporavak sljedećeg dana</strong></summary>
 <div class="analytics-controls"><label>Razdoblje<select bind:value={span}><option value="28">28 dana</option><option value="90">90 dana</option></select></label><button class="btn" onclick={()=>void load()}>Osvježi usporedbu</button></div>
 {#if busy}<p role="status">Učitavam lokalne zapise…</p>{/if}{#if error}<p role="status" class="analytics-error">{error}</p>{/if}
 {#if data}<p>{data.eligibleDays} dana ispunjava uvjete · niža trećina do {fmt(data.thresholds.lowerMax)} loada · viša iznad {fmt(data.thresholds.higherAbove)}.</p><p class="quiet">{data.note}</p>
 {#if !data.sufficient}<p>Još nema najmanje 5 potvrđenih dana u obje grupe. Pojedinačni zapisi dostupni su u nastavku.</p>{/if}
 <div class="analytics-grid">{#each data.groups as g}<article class="analytics-card"><span>{g.label} · {g.days} dana</span><strong>{fmt(g.kcal.value,0)} kcal</strong><p>Medijan unosa · {g.kcal.days} zapisa<br/>UH {fmt(g.carbs.value)} g · {g.carbs.days} usporedivih zapisa</p><p>Energija {fmt(g.calorieTargetPercent)}% · UH {fmt(g.carbTargetPercent)}% tada važećeg cilja</p></article>{/each}</div>
 <Series id="nutrition-training-load-chart" title="Dnevni trening load" rows={data.rows.map(r=>({...r}))} series={[{key:'load',label:'Garmin dnevni load',color:'#b9a2fa'}]} unit="load"/>
 <div class="analytics-table"><table><thead><tr><th>Trening-dan</th><th>Unos / UH</th><th>Load</th><th>Sljedeći dan</th><th>Uključivanje</th></tr></thead><tbody>{#each data.rows as row}<tr><td>{row.date}</td><td>{fmt(row.kcal,0)} kcal / {fmt(row.carbs)} g<br/>{row.carbComparison==='estimated'?'UH procijenjeni':row.carbComparison==='exact'?'UH usporedivi':'UH nisu usporedivi'}</td><td>{fmt(row.load)}</td><td>{row.nextDate}<br/>HRV {fmt(row.nextHrv?.value)} ms<br/>RHR {fmt(row.nextRestingHeartRate?.value)} bpm<br/>San {fmt(row.nextSleep?.value==null?null:row.nextSleep.value/3600)} h</td><td>{row.exclusions.length?row.exclusions.join(' '):'Uključen'}</td></tr>{/each}</tbody></table></div>{/if}
</details>
