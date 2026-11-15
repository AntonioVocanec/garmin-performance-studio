<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {comparisonNutrients,type Diary,type Energy} from '../lib/nutritionApi';
 let {days,energy}:{days:Diary[];energy:Energy|null}=$props();let host:HTMLElement;let mounted=$state(false);
 let charts:typeof import('../lib/charts')|undefined;
 const renderNutritionSeries=(...args:Parameters<typeof import('../lib/charts')['renderNutritionSeries']>)=>charts?.renderNutritionSeries(...args);
 onMount(()=>{let disposed=false;void import('../lib/charts').then(module=>{if(!disposed){charts=module;mounted=true}});return()=>{disposed=true}});onDestroy(()=>{if(host)charts?.disposeChartsInside(host)});
 $effect(()=>{if(!mounted)return;const points=days.map(d=>{const macros=comparisonNutrients(d);const total=energy?.history?.find(h=>h.date===d.date)?.totalCalories??(energy?.date===d.date?energy.totalCalories:null);const intake=d.nutrients.kcal===null?null:Number(d.nutrients.kcal);return {date:d.date,intake,expenditure:total,balance:d.complete&&intake!==null&&total!==null?intake-total:null,protein:d.nutrients.protein===null?null:Number(d.nutrients.protein),carbs:macros.carbs===null?null:Number(macros.carbs),fat:d.nutrients.fat===null?null:Number(d.nutrients.fat)}});renderNutritionSeries('nutrition-energy-chart',points,[{key:'intake',label:'Unos',color:'#69d7ef'},{key:'expenditure',label:'Garmin ukupno',color:'#b9a2fa'}],'kcal','Unos i potrošnja','days');renderNutritionSeries('nutrition-macro-chart',points,[{key:'protein',label:'Proteini',color:'#69d7ef'},{key:'carbs',label:'Ugljikohidrati',color:'#b9a2fa'},{key:'fat',label:'Masti',color:'#d9a6c8'}],'g','Tjedni makronutrijenti','days');renderNutritionSeries('nutrition-balance-chart',points,[{key:'balance',label:'Bilanca potvrđenih dana',color:'#69d7ef'}],'kcal','Energetska bilanca · potvrđeni dani','days')});
</script>
<div bind:this={host} class="nutrition-grid">
 <article class="panel"><h3>Unos i potrošnja · 7 dana</h3><p class="quiet">Lokalni dnevnik i službeni Garmin ukupni podaci. Praznine ostaju praznine.</p><div id="nutrition-energy-chart"></div></article>
 <article class="panel"><h3>Tjedni makronutrijenti</h3><p class="quiet">UH koriste usporedivu definiciju. Vrijednosti dobivene oduzimanjem vlakana su procjene; nepoznata definicija ostavlja prazninu.</p><div id="nutrition-macro-chart"></div></article>
 <details class="panel nutrition-details nutrition-wide"><summary>Energetska bilanca · potvrđeni dani</summary><p class="quiet">Bilanca je unos − zabilježena ukupna potrošnja. Potpunost dnevnika potvrđuješ sam.</p><div id="nutrition-balance-chart"></div></details>
</div>
