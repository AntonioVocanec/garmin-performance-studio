<script lang="ts">
 import { onDestroy } from 'svelte';
 import { nutritionApi, type UsdaDraft, type UsdaHit } from '../lib/nutritionApi';
 let { name, nutrients, labels, apply }: {
   name:string; nutrients:Record<string,string>; labels:Record<string,string>; apply:(draft:UsdaDraft)=>void;
 } = $props();
 let override = $state<string|null>(null);
 const query = $derived((override ?? name).trim());
 let results = $state<UsdaHit[]>([]), preview = $state<UsdaDraft|null>(null);
 let notice = $state(''), loading = $state(false);
 let request:AbortController|undefined;
 function reset() {
   request?.abort();
   results=[]; preview=null; notice=''; loading=false;
 }
 $effect(()=>{ void query; reset(); });
 onDestroy(()=>request?.abort());
 async function lookup(hit?:UsdaHit) {
   request?.abort();
   preview=null; notice='';
   if (!hit) results=[];
   if (query.length<2 || query.length>100) {
     notice='Upit treba imati od 2 do 100 znakova.'; loading=false; return;
   }
   const controller = new AbortController();
   request=controller; loading=true;
   try {
     if (hit) {
       const draft=await nutritionApi<UsdaDraft>(`/food-imports/${hit.sourceId}/preview`, 'GET', undefined, controller.signal);
       if (!controller.signal.aborted) preview=draft;
     } else {
       const hits=await nutritionApi<UsdaHit[]>(`/food-search?q=${encodeURIComponent(query)}`, 'GET', undefined, controller.signal);
       if (!controller.signal.aborted) {
         results=hits;
         notice=hits.length ? 'Odaberi zapis za pregled.' : 'Nema rezultata. Pokušaj s engleskim nazivom, primjerice rolled oats.';
       }
     }
   } catch (e) {
     if (!controller.signal.aborted) notice=(e instanceof Error ? e.message : 'USDA je nedostupan.')+' Možeš nastaviti s ručnim unosom.';
   } finally { if (!controller.signal.aborted) loading=false; }
 }
</script>

<section class="nutrition-notice usda-picker" aria-label="USDA izvor">
 <div class="nutrition-actions">
   <label>Upit za USDA<input maxlength="100" value={override ?? name}
     oninput={e=>override=e.currentTarget.value}
     onkeydown={e=>{if(e.key==='Enter'){e.preventDefault();void lookup()}}}/></label>
   <button type="button" class="btn" onclick={()=>lookup()}>Pretraži USDA</button>
 </div>
 <p class="quiet">Upit možeš prevesti na engleski. Naziv namirnice u katalogu ostaje tvoj.</p>
 <p role="status">{loading?'Dohvaćam USDA podatke…':notice}</p>
 {#each results as hit}
   <div class="nutrition-row"><span>{hit.name} · {hit.dataType || 'Nepoznat tip'} · FDC {hit.sourceId}{hit.brand?' · '+hit.brand:''}</span>
     <button type="button" class="btn" aria-label={'Pregledaj '+hit.name} onclick={()=>lookup(hit)}>Pregledaj</button></div>
 {/each}
 {#if preview}
   <h4>{preview.nutritionData.usda.description}</h4>
   <p>{preview.nutritionData.usda.dataType} · FDC {preview.sourceId} · vrijednosti na 100 g</p>
   {#each Object.entries(labels) as [key,label]}
     <div class="nutrition-kv"><span>{label}</span><b>{nutrients[key] || 'Nepoznato'} → {preview.nutrients[key as keyof typeof preview.nutrients] ?? 'Nepoznato'}</b></div>
   {/each}
   <p class="quiet">Primjenom zamjenjuješ izvor, prikazane vrijednosti i njihove definicije. Preuzeti mikronutrijenti zamijenit će one iz prethodnog USDA odabira i istoimene ručne unose.</p>
   {#each Object.entries(preview.micronutrients) as [label,micro]}<p>{label} · {micro.value} {micro.unit}</p>{/each}
   <button type="button" class="btn" onclick={()=>{if(preview)apply(preview);reset();notice='Podaci su u obrascu. Provjeri stanje, alergene i vrijednosti prije spremanja.'}}>Primijeni u obrazac</button>
 {/if}
</section>
