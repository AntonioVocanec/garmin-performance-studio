<script lang="ts">
 import {nutritionApi,type Food,type Recipe} from '../lib/nutritionApi';
 let {mode,foods,onchange,recipe=null,food=null}:{mode:'food'|'recipe';foods:Food[];onchange:()=>Promise<void>;recipe?:Recipe|null;food?:Food|null}=$props();
 let name=$state(''),source=$state(''),foodState=$state('label'),unit=$state('g'),grams=$state(''),minimum=$state('0'),allergens=$state(''),tags=$state(''),known=$state(false);
 let micros=$state<{name:string;value:string;unit:string}[]>([]);
 let nutrients=$state<Record<string,string>>({kcal:'',protein:'',carbs:'',fat:'',fiber:''});
 let portions=$state('1'),minutes=$state('20'),method=$state('other'),category=$state('lunch'),steps=$state('');
 let ingredients=$state<{foodId:string;quantity:string;optional:boolean}[]>([]);let error=$state('');let busy=$state(false);
 let carbDefinition=$state('unknown'),energyMethod=$state('declared');
 $effect(()=>{carbDefinition=food?.nutritionData?.carbDefinition??'unknown';energyMethod=food?.nutritionData?.energyMethod??'declared'});
 function nutritionData(){
  const sameValues=food&&Object.entries(nutrients).every(([key,value])=>value===''?food.nutrients[key as keyof typeof food.nutrients]===null:Number(value.replace(',','.'))===Number(food.nutrients[key as keyof typeof food.nutrients]));
  const preserve=sameValues&&carbDefinition===food?.nutritionData?.carbDefinition&&energyMethod===food?.nutritionData?.energyMethod;
  return {carbDefinition,energyMethod,originalValues:preserve?food?.nutritionData?.originalValues??[]:[]};
 }
 $effect(()=>{if(recipe){name=recipe.name;portions=recipe.portions;minutes=String(recipe.minutes);method=recipe.method;category=recipe.category;steps=recipe.steps.join('\n');tags=recipe.tags.join(', ');ingredients=recipe.ingredients.map(i=>({...i}))}else if(food){name=food.name;source=food.source;foodState=food.state;unit=food.unit;grams=food.gramsPerUnit??'';minimum=food.minimumQuantity;allergens=food.allergens.join(', ');tags=food.dietaryTags.join(', ');known=food.allergensKnown;micros=Object.entries(food.micronutrients??{}).map(([name,m])=>({name,value:m.value,unit:m.unit}));nutrients=Object.fromEntries(Object.entries(food.nutrients).map(([k,v])=>[k,v??'']))}});
 async function save(e:SubmitEvent){e.preventDefault();error='';busy=true;try{
 if(mode==='food'){await nutritionApi(food?`/foods/${food.id}`:'/foods',food?'PATCH':'POST',{name,state:foodState,unit,gramsPerUnit:grams||null,minimumQuantity:minimum,allergens:allergens.split(',').map(x=>x.trim()).filter(Boolean),allergensKnown:known,dietaryTags:tags.split(',').map(x=>x.trim()).filter(Boolean),nutrients:Object.fromEntries(Object.entries(nutrients).map(([k,v])=>[k,v||null])),source,sourceId:food?.sourceId??null,nutritionData:nutritionData(),micronutrients:Object.fromEntries(micros.filter(m=>m.name).map(m=>[m.name,{value:m.value,unit:m.unit}])),expectedVersion:food?.version??1})}
 else {await nutritionApi(recipe?`/recipes/${recipe.id}`:'/recipes',recipe?'PATCH':'POST',{name,portions,minutes:Number(minutes),method,category,steps:steps.split('\n').filter(Boolean),ingredients,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),expectedVersion:recipe?.version??1})}
 await onchange();if(!recipe&&!food){name='';ingredients=[];steps=''}
 }catch(e){error=e instanceof Error?e.message:String(e)}finally{busy=false}}
</script>
<form class="nutrition-form" onsubmit={save}>
 <div class="nutrition-fields"><label>Naziv<input required maxlength="150" bind:value={name}/></label>
 {#if mode==='food'}
 <label>Stanje<select bind:value={foodState}><option value="label">Kako je deklarirano</option><option value="raw">Sirovo</option><option value="cooked">Kuhano</option><option value="dry">Suho</option></select></label>
 <label>Inventarna jedinica<select bind:value={unit}><option value="g">g</option><option value="ml">ml</option><option value="piece">kom</option></select></label>
 {#if unit!=='g'}<label>Grama po {unit==='ml'?'ml':'komadu'}<input inputmode="decimal" bind:value={grams}/></label>{/if}
 <label>Minimalna zaliha<input inputmode="decimal" bind:value={minimum}/></label><label>Izvor podataka<input required maxlength="300" bind:value={source} placeholder="Deklaracija proizvoda / provjereni izvor"/></label>
 <label>Definicija ugljikohidrata<select bind:value={carbDefinition}><option value="unknown">Nije potvrđena</option><option value="eu_available">EU deklaracija · UH odvojeni od vlakana</option><option value="total_including_fiber">Ukupni UH uključuju vlakna · potvrđeno na izvoru</option></select></label>
 <label>Metoda energije<select bind:value={energyMethod}><option value="declared">Deklarirana energija</option><option value="unknown">Nepoznata metoda</option><option value="usda_1008">USDA 1008</option><option value="atwater_general">Atwater opći faktori</option><option value="atwater_specific">Atwater specifični faktori</option></select></label>
 {#each Object.keys(nutrients) as k}<label>{k} / 100 g<input inputmode="decimal" bind:value={nutrients[k]} placeholder="Nepoznato"/></label>{/each}
 <label>Alergeni (zarez)<input bind:value={allergens}/></label><label>Potvrđene prehrambene oznake<input bind:value={tags} placeholder="vegetarijansko, bez jaja"/></label>
 <label class="nutrition-check"><input type="checkbox" bind:checked={known}/>Sastav i alergeni provjereni na izvoru</label>
 {:else}
 <label>Broj porcija<input required inputmode="decimal" bind:value={portions}/></label><label>Vrijeme · min<input required inputmode="numeric" bind:value={minutes}/></label>
 <label>Način pripreme<select bind:value={method}><option value="other">Ostalo</option><option value="instant_pot">Instant Pot</option><option value="one_pot">One-pot</option><option value="oven">Pećnica</option><option value="air_fryer">Air fryer</option></select></label>
 <label>Prehrambene oznake<input bind:value={tags} placeholder="vegetarijansko, bez jaja"/></label><label>Obrok<select bind:value={category}><option value="breakfast">Doručak</option><option value="lunch">Ručak</option><option value="dinner">Večera</option><option value="snack">Užina</option></select></label>
 {/if}</div>
 {#if mode==='food'}<details><summary>Opcionalni mikronutrijenti · /100 g</summary>{#each micros as micro,i}<div class="nutrition-ingredient"><label>Naziv mikronutrijenta<input required bind:value={micro.name}/></label><label>Vrijednost<input required inputmode="decimal" bind:value={micro.value}/></label><label>Jedinica<select bind:value={micro.unit}><option>mg</option><option>ug</option><option>g</option><option>IU</option></select></label><button type="button" class="btn" onclick={()=>micros=micros.filter((_,j)=>i!==j)}>Ukloni</button></div>{/each}<button type="button" class="btn" onclick={()=>micros.push({name:'',value:'',unit:'mg'})}>Dodaj mikronutrijent</button></details>{/if}
 {#if mode==='recipe'}<h4>Sastojci · količine u inventarnoj jedinici namirnice</h4>
 {#each ingredients as item,i}<div class="nutrition-ingredient"><label>Namirnica<select required bind:value={item.foodId}><option value="">Odaberi</option>{#each foods as f}<option value={f.id}>{f.name} · {f.unit} · {f.state}</option>{/each}</select></label><label>Količina<input required inputmode="decimal" bind:value={item.quantity}/></label><button type="button" class="btn" onclick={()=>ingredients=ingredients.filter((_,j)=>j!==i)}>Ukloni</button></div>{/each}
 <button type="button" class="btn" onclick={()=>ingredients.push({foodId:'',quantity:'100',optional:false})}>Dodaj sastojak</button>
 <label>Koraci · svaki u novom retku<textarea required rows="5" bind:value={steps}></textarea></label>{/if}
 {#if error}<p class="error" role="alert">{error}</p>{/if}<button class="btn" disabled={busy}>{food||recipe?'Spremi novu verziju':'Spremi'}</button>
</form>
