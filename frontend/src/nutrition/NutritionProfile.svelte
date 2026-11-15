<script lang="ts">
 import { nutritionApi, type Profile } from '../lib/nutritionApi';
 let {profile,date,onchange}:{profile:Profile;date:string;onchange:()=>Promise<void>}=$props();
 let form=$state<Record<string,string>>({});let error=$state('');let busy=$state(false);let details:HTMLDetailsElement;
 $effect(()=>{form={calories:profile.calories??'',protein:profile.protein??'',carbs:profile.carbs??'',fat:profile.fat??'',restrictions:(profile.restrictions??[]).join(', '),allergens:(profile.allergens??[]).join(', '),excludedFoods:(profile.excludedFoods??[]).join(', '),methods:(profile.methods??[]).join(', '),mealsPerDay:String(profile.mealsPerDay??''),prepDays:String(profile.prepDays??''),prepPortions:String(profile.prepPortions??''),aiDailyRequests:String(profile.aiDailyRequests??0),aiDailyTokens:String(profile.aiDailyTokens??0)}});
 const labels:Record<string,string>={calories:'Energija · kcal',protein:'Proteini · g',carbs:'Ugljikohidrati · g',fat:'Masti · g',restrictions:'Prehrambene oznake (zarez)',allergens:'Alergeni (zarez)',excludedFoods:'Isključene namirnice (zarez)',methods:'Preferirani načini pripreme (zarez)',mealsPerDay:'Broj obroka',prepDays:'Meal Prep · 3, 5 ili 7 dana',prepPortions:'Zadani broj porcija',aiDailyRequests:'AI · najviše poziva dnevno',aiDailyTokens:'AI · dnevni budžet tokena'};

 const integerRanges:Record<string,[number,number]>={mealsPerDay:[1,12],prepDays:[3,7],prepPortions:[1,100],aiDailyRequests:[0,100],aiDailyTokens:[0,1000000]};
 function integerValue(key:string,value:string):number|null{
  const raw=value.trim();
  if(!raw)return key.startsWith('aiDaily')?0:null;
  const [minimum,maximum]=integerRanges[key];
  if(!/^\d+$/.test(raw))throw new Error(labels[key]+' mora biti cijeli broj bez separatora.');
  const number=Number(raw);
  if(!Number.isSafeInteger(number)||number<minimum||number>maximum)
   throw new Error(labels[key]+' mora biti u rasponu '+minimum+'–'+maximum+'.');
  if(key==='prepDays'&&![3,5,7].includes(number))throw new Error('Meal Prep može trajati 3, 5 ili 7 dana.');
  return number;
 }
 async function save(e:SubmitEvent){
  e.preventDefault();busy=true;error='';
  try{
   const body:Record<string,unknown>={expectedVersion:profile.version,effectiveDate:date,preferFrozen:profile.preferFrozen??false,sportsRules:profile.sportsRules??[]};
   for(const key of Object.keys(form)){
    if(['restrictions','allergens','excludedFoods','methods'].includes(key))
     body[key]=form[key].split(',').map(value=>value.trim()).filter(Boolean);
    else if(key in integerRanges)body[key]=integerValue(key,form[key]);
    else body[key]=form[key].trim()||null;
   }
   await nutritionApi('/profile','PUT',body);await onchange();details.open=false;
  }catch(e){error=e instanceof Error?e.message:String(e)}
  finally{busy=false}
 }

</script>
<details bind:this={details} class="panel nutrition-details"><summary>Profil i ciljevi prehrane <span>{profile.version?'Uredi':'Postavi profil'}</span></summary><form class="nutrition-form" onsubmit={save}>
 <p class="quiet">Profil počinje prazan. Ciljevi vrijede od {date}. Cilj UH koristi EU definiciju s odvojenim vlaknima. Nepopunjeni cilj ostaje bez procjene.</p>
 <div class="nutrition-fields">{#each Object.keys(labels) as k}<label>{labels[k]}<input bind:value={form[k]} maxlength="500" /></label>{/each}</div>
 <p class="quiet">AI pozivi dnevno · 0–100. Budžet tokena · 0–1.000.000. Upiši cijele brojeve bez separatora; prazno AI polje sprema se kao 0.</p>
 <label class="nutrition-check"><input type="checkbox" bind:checked={profile.preferFrozen}/>Prednost smrznutom voću i povrću</label><p class="quiet">AI je isključen uz budžet 0. Jedan zahtjev rezervira 8000 tokena; model može dodatno ograničiti stvarnu potrošnju.</p>
 {#if error}<p role="alert" class="error">{error}</p>{/if}<button class="btn" disabled={busy}>Spremi profil</button>
</form></details>
