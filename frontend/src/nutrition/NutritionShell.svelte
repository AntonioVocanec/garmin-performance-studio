<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {DashboardApiError} from '../lib/api';
 import {nutritionApi as api,validateShoppingPreview,type ShoppingPreviewItem,fmt,comparisonNutrients,carbExplanation,mealLabels,locationLabels,type Food,type Recipe,type Lot,type Diary,type Profile,type PlanEntry,type Shopping,type Energy,type Overview,type CookingPreview} from '../lib/nutritionApi';
 import {nutritionGroupFor,nutritionViewForHash} from '../lib/nutritionViews';
 import NutritionProfile from './NutritionProfile.svelte';
 import CatalogEditor from './CatalogEditor.svelte';
 import NutritionCharts from './NutritionCharts.svelte';
 import NutritionTraining from '../analytics/NutritionTraining.svelte';
 let view=$state('overview'),active=$state(false),date=$state(''),loading=$state(false),busy=$state(false),error=$state(''),message=$state('');
 let foods=$state<Food[]>([]),recipes=$state<Recipe[]>([]),lots=$state<Lot[]>([]),profile=$state<Profile>({version:0}),diary=$state<Diary|null>(null),overviewResponse=$state<Overview|null>(null),plans=$state<PlanEntry[]>([]),lists=$state<Shopping[]>([]),days=$state<Diary[]>([]),energy=$state<Energy|null>(null);
 let history=$state<{id:string;operation_id:string;created_at:string;reason:string;delta:number;reversed_by:string|null}[]>([]);
 let foodEdit=$state<Food|null>(null),recipeEdit=$state<Recipe|null>(null),search=$state(''),recipeFilter=$state('');
 let editorOpen=$state(false),editorVersion=$state(0);
 let receiptDialog:HTMLDialogElement;
 let receiptSearch=$state<HTMLInputElement>(),receiptAmount=$state<HTMLInputElement>();
 let savingReceiptFood=$state(false);
 let receiptQuery=$state(''),receiptError=$state(''),receiptAddingFood=$state(false);
 let receiptFood=$state(''),receiptQuantity=$state(''),receiptLocation=$state('pantry'),receiptExpiry=$state(''),receiptCost=$state(''),receiptDate=$state('');
 let logKind=$state('food'),logSource=$state(''),logQuantity=$state('1'),logMeal=$state('lunch'),logConsume=$state(false);
 let prepRecipe=$state(''),prepQuantity=$state(''),prepLocation=$state('fridge'),prepExpiry=$state(''),prepMass=$state('');
 let prepRecipeVersion=$state<Recipe|null>(null),preparedDate=$state('');
 let scheduledRecipe=$state(''),scheduledQuantity=$state('1');
 let scheduleSelection=0;
 let prepPreview=$state<(CookingPreview & {fingerprint:string})|null>(null);
 let prepOptionalPositions=$state<number[]>([]);
 let scale=$state<Record<string,{portions:string;factor:string;feasible:boolean;missing:{name:string;quantity:string}[];warnings:string[]}>>({});
 let planRecipe=$state(''),planDate=$state(''),planPortions=$state('1'),planMeal=$state('lunch');
 let schedule=$state<{id:string;planned_date:string;name:string;recipe_version_id:string;portions:number}[]>([]),planSummary=$state<{nutrients:Record<string,string|null>;estimatedCost:string|null;days:{date:string;nutrients:Record<string,string|null>}[]}|null>(null);
 let planFormOpen=$state(false),planDateInput=$state<HTMLInputElement>();
 let planRecipeVersion=$state<{id:string;name:string}|null>(null);
 let logRecipeVersion=$state<{id:string;name:string}|null>(null);
 let scheduleId=$state<string|null>(null),plannedPrepDate=$state(''),planEdit=$state<{id:string;version:number}|null>(null);
 let shoppingPreview=$state<{items:ShoppingPreviewItem[];token:string}|null>(null);
 let shoppingStart=$state(''),shoppingEnd=$state('');
 let shoppingRevision=0;
 let aiRetry=$state(false);
 let aiLots=$state<string[]>([]),aiPreview=$state<{previewId:string;items:{name:string;quantity:string;unit:string}[];staticInstructions:string}|null>(null),aiConfirmed=$state(false),aiDrafts=$state<{id:string;recipe:{name:string;steps:string[];ingredients:{foodId:string;quantity:string}[]}}[]>([]);
 let trainingMinutes=$state(''),extraCalories=$state(''),extraCarbs=$state('');
 let controller:AbortController|undefined,energyController:AbortController|undefined;
 const titles:Record<string,string>={overview:'Moj dan',trends:'Trendovi prehrane',planner:'Tjedni planer',recipes:'Recepti',prep:'Meal Prep',portions:'Gotove porcije','ai-recipes':'AI recepti',inventory:'Zalihe',shopping:'Kupovina',catalog:'Katalog namirnica','inventory-history':'Povijest inventara'};
 let mealDialog: HTMLDialogElement;
 let mealTrigger=$state<HTMLButtonElement>();
 let mealReturnFocus:HTMLButtonElement|undefined;
 let profileDetails=$state<HTMLDetailsElement>();
 let logError=$state('');
 let logSourceError=$state('');
 let logSourceField=$state<HTMLSelectElement>();
 const isDailyView=$derived(view==='overview');
 const planStatusLabels:Record<string,string>={planned:'Planirano',prepared:'Pripremljeno u planu',
   consumed:'Označeno konzumirano u planu',skipped:'Preskočeno u planu'};
 const overview=$derived(overviewResponse?.diary.date===date?overviewResponse:null);
 const stockOverview=$derived(overviewResponse?.diary.date===receiptToday()?overviewResponse:null);
 const dayMeals=$derived(Object.entries(mealLabels).map(([key,label])=>({
   label,key,
   entries:diary?.entries.filter(entry=>entry.meal===key)??[],
   planned:overview?.meals.filter(meal=>meal.meal===key)??[],
 })));
 const selectedPortion=$derived(logKind==='portion'?overview?.portions.find(l=>l.id===logSource):undefined);
 const portionQuantity=$derived(Number(logQuantity.replace(',','.')));
 const nutritionSection=$derived('nutrition-'+view);
 const navigationGroup=$derived(nutritionGroupFor(nutritionSection));
 const navigationLinks=$derived([navigationGroup.primary,...navigationGroup.secondary]);
 function shift(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
 function planDayLabel(day:string,long=false){
   return new Intl.DateTimeFormat('hr-HR',{weekday:long?'long':'short',day:'numeric',month:'numeric',timeZone:'UTC'})
     .format(new Date(day+'T12:00:00Z'));
 }
 function selectPlanDay(day:string){
   if(day===date)return;
   const input=document.getElementById('date') as HTMLInputElement|null;
   if(input){input.value=day;input.dispatchEvent(new Event('change',{bubbles:true}))}
 }
 function startPlanShopping(){
   resetShoppingRange();
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
     if(view!=='shopping')return;
     const builder=document.getElementById('nutrition-shopping-builder');
     builder?.focus({preventScroll:true});
     builder?.scrollIntoView({block:'start',behavior:'instant'});
   }));
 }
 function weekStart(day:string){return shift(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7))}
 const inventoryLots=$derived([...lots].sort((a,b)=>{
   // The API orders by expiry already. Keep expired lots visible after usable ones.
   return Number(Number(a.expiredQuantity)>0)-Number(Number(b.expiredQuantity)>0);
 }));
 const matchingReceiptFoods=$derived(foods.filter(food=>
   food.name.toLocaleLowerCase('hr').includes(receiptQuery.trim().toLocaleLowerCase('hr'))));
 const shoppingRange=$derived({start:shoppingStart,end:shoppingEnd});
 const shoppingRangeValid=$derived(Boolean(shoppingStart&&shoppingEnd&&shoppingEnd>=shoppingStart));
 const isSelectedWeek=$derived(Boolean(date&&shoppingStart===weekStart(date)&&shoppingEnd===shift(shoppingStart,6)));
 const receiptItem=$derived(foods.find(f=>f.id===receiptFood));
 const receiptUnit=$derived(receiptItem?.unit==='piece'?'kom':receiptItem?.unit??'');
 function recipeChoices(frozen:{id:string;name:string}|null){
   const choices=recipes.map(r=>({id:r.versionId,name:r.name}));
   if(frozen&&!choices.some(r=>r.id===frozen.id)){
     choices.push({id:frozen.id,name:frozen.name+' · spremljena verzija'});
   }
   return choices;
 }
 const options=$derived(logKind==='food'
   ? foods.map(f=>({id:f.id,name:f.name,unit:f.unit}))
   : logKind==='recipe'
     ? recipeChoices(logRecipeVersion).map(r=>({...r,unit:'porcija'}))
     : (overview?.portions??[]).map(l=>({id:l.id,name:`${l.name} · ${l.quantity} porcija`,unit:'porcija'})));
 const prepChoices=$derived(recipeChoices(prepRecipeVersion?{id:prepRecipeVersion.versionId,name:prepRecipeVersion.name}:null));
 const selectedPrepRecipe=$derived(recipes.find(r=>r.versionId===prepRecipe)??prepRecipeVersion);
 const preparedLots=$derived(inventoryLots.filter(l=>l.batch_id));
 const availablePortions=$derived(new Map((overview?.portions??[]).map(l=>[l.id,l])));
 const portionCards=$derived([...preparedLots,...[...availablePortions.values()].filter(l=>!preparedLots.some(p=>p.id===l.id))]);
 const prepBody=$derived({recipeVersionId:prepRecipe,portions:prepQuantity,location:prepLocation,expiresOn:prepExpiry,asOf:date,cookedMass:prepMass||null,scheduleId,optionalIngredientPositions:[...prepOptionalPositions].sort((a,b)=>a-b)});
 const shownRecipes=$derived(recipes.filter(r=>r.name.toLocaleLowerCase('hr').includes(search.toLocaleLowerCase('hr'))&&(!recipeFilter||r.tags.includes(recipeFilter))));
 const nutritionTargets=$derived(diary?.targets??{});
 const comparableMacros=$derived(diary?comparisonNutrients(diary):null);
 const balance=$derived(
   diary?.date===date && energy?.date===date && diary.nutrients.kcal!=null && energy.totalCalories!=null
     ? Number(diary.nutrients.kcal)-energy.totalCalories : null
 );
 const allDays=$derived(date?Array.from({length:7},(_,i)=>shift(weekStart(date),i)):[]);
 async function load(){if(!active||!date)return;const requestedDate=date,overviewDate=view==='inventory'?receiptToday():date,revision=contextRevision;controller?.abort();controller=new AbortController();const signal=controller.signal;loading=true;error='';
 try{const [f,r,l,p,d,o,pl,sl,h,ds,sch,ps]=await Promise.all([api<Food[]>('/foods','GET',undefined,signal),api<Recipe[]>('/recipes','GET',undefined,signal),api<Lot[]>('/inventory','GET',undefined,signal),api<Profile>('/profile','GET',undefined,signal),api<Diary>(`/diary?date=${date}`,'GET',undefined,signal),api<Overview>(`/dashboard?date=${overviewDate}`,'GET',undefined,signal),api<PlanEntry[]>(`/plan?week=${weekStart(date)}`,'GET',undefined,signal),api<Shopping[]>('/shopping/lists','GET',undefined,signal),api<typeof history>('/inventory/history','GET',undefined,signal),api<Diary[]>(`/analytics?start=${shift(date,-6)}&end=${date}`,'GET',undefined,signal),api<typeof schedule>('/prep/schedule','GET',undefined,signal),api<NonNullable<typeof planSummary>>(`/plan/summary?week=${weekStart(date)}`,'GET',undefined,signal)]);if(signal.aborted||date!==requestedDate||revision!==contextRevision||!active)return;
 if(d.date!==requestedDate){diary=null;throw new Error('Datum primljenog dnevnika ne odgovara odabranom danu. Osvježi prehranu.')}
 const revealDiary=!diary&&location.hash==='#nutrition-diary';
 foods=f;recipes=r;lots=l;profile=p;if(!prepQuantity&&p.prepPortions)prepQuantity=String(p.prepPortions);diary=d;overviewResponse=o.diary.date===overviewDate?o:null;plans=pl;lists=sl;history=h;days=ds;schedule=sch;planSummary=ps;
 if(revealDiary){
   await tick();
   if(revision===contextRevision&&location.hash==='#nutrition-diary')window.dispatchEvent(new Event('dashboard:content-updated'));
 }}
 catch(e){if(!signal.aborted&&revision===contextRevision)error=e instanceof Error?e.message:String(e)}finally{if(!signal.aborted)loading=false}}
 async function loadEnergy(){
   energyController?.abort();
   energy=null;
   if(!active||!date)return;
   const requestedDate=date,revision=contextRevision;
   energyController=new AbortController();
   const signal=energyController.signal;
   const unavailable:Energy={date:requestedDate,status:'unavailable',source:'Garmin',fetchedAt:null,
     totalCalories:null,activeCalories:null,restingCalories:null,localEstimate:null,provisional:false};
   try{
     const result=await api<Energy>(`/energy?date=${requestedDate}`,'GET',undefined,signal);
     if(signal.aborted||date!==requestedDate||revision!==contextRevision||!active)return;
     energy=result.date===requestedDate ? result : unavailable;
   }catch{
     if(!signal.aborted&&date===requestedDate&&revision===contextRevision&&active)energy=unavailable;
   }
 }
 function refresh(){
   if(active){invalidateShopping();void load();void loadEnergy()}
 }
 let contextRevision=0;
 function clearNotices(){
  contextRevision++;error='';message='';logError='';
  mealDialog?.close();
  receiptDialog?.close();
  if(profileDetails)profileDetails.open=false;
  prepPreview=null;preparedDate='';scheduleSelection++;invalidateShopping();scale={};
  aiPreview=null;aiConfirmed=false;aiRetry=false;
 }
 async function action<T>(
  work:()=>Promise<T>,
  success='Promjena je spremljena.',
  options:{apply?:(result:T)=>void;isCurrent?:()=>boolean;onError?:(error:unknown)=>void;showError?:boolean}={},
 ){
  if(busy)return;
  const revision=contextRevision;
  const isCurrent=()=>active&&revision===contextRevision&&(options.isCurrent?.()??true);
  busy=true;error='';message='';
  try{
   const result=await work();
   if(!isCurrent())return;
   options.apply?.(result);
   message=success;await load();
  }catch(e){
   if(isCurrent()){
    options.onError?.(e);
    if(options.showError!==false)error=e instanceof Error?e.message:String(e);
   }
  }finally{busy=false}
 }
 function invalidateShopping(){
   shoppingRevision++;
   shoppingPreview=null;
 }
 function resetShoppingRange(){
   shoppingStart=date?weekStart(date):'';
   shoppingEnd=shoppingStart?shift(shoppingStart,6):'';
 }
 async function previewShopping(e:SubmitEvent){
   e.preventDefault();
   if(!shoppingRangeValid)return;
   const range={...shoppingRange};
   invalidateShopping();
   const revision=shoppingRevision;
   await action(()=>api<{items:unknown;token:string}>('/shopping/preview?includeToken=true','POST',range),
     'Pregled manjka je spreman.',{
       isCurrent:()=>revision===shoppingRevision,
       apply:result=>{
         const items=validateShoppingPreview(result?.items);
         if(!result||typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token)){
           throw new Error('Podaci pregleda kupovine nisu valjani.');
         }
         shoppingPreview={items,token:result.token};
       },
     });
 }
 async function saveShopping(){
   if(!shoppingPreview||!shoppingRangeValid)return;
   const body={...shoppingRange,previewToken:shoppingPreview.token};
   await action(()=>api('/shopping/lists','POST',body),'Popis za kupovinu je spremljen.',{
     apply:invalidateShopping,
     onError:e=>{if(e instanceof DashboardApiError&&e.status===409)invalidateShopping()},
   });
 }
 function navigate(){const previousView=view,wasActive=active;const hash=location.hash;active=document.querySelector('main.shell')?.getAttribute('data-active-view')==='nutrition'||hash.startsWith('#nutrition-')||hash==='#view-nutrition';view=nutritionViewForHash(hash);if(previousView!==view||wasActive!==active)clearNotices();if(active&&date&&(!diary||previousView!==view||!wasActive)){void load();if(energy?.date!==date)void loadEnergy()}}
 onMount(()=>{
   const input=document.getElementById('date') as HTMLInputElement;
   date=input.value;
   resetDateInputs();
   navigate();
   const changed=()=>{
     const sameWeek=date&&input.value&&weekStart(date)===weekStart(input.value);
     clearNotices();
     date=input.value;
     resetDateInputs();
     controller?.abort();
     energyController?.abort();
     energy=null;
     diary=null;
     overviewResponse=null;
     days=[];
     if(!sameWeek){plans=[];planSummary=null}
     refresh();
   };
   window.addEventListener('dashboard:navigation',navigate);
   window.addEventListener('popstate',navigate);
   input.addEventListener('change',changed);
   document.getElementById('refresh')?.addEventListener('click',refresh);
   return()=>{
     controller?.abort();
     energyController?.abort();
     window.removeEventListener('dashboard:navigation',navigate);
     window.removeEventListener('popstate',navigate);
     input.removeEventListener('change',changed);
     document.getElementById('refresh')?.removeEventListener('click',refresh);
   };
 });
 function resetDateInputs(){
   resetPlanForm();
   plannedPrepDate=date>receiptToday()?date:receiptToday();
   resetShoppingRange();
 }
 function receiptToday(){
   return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zagreb',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 }
 function openReceipt(){
   receiptAddingFood=false;
   receiptError='';
   receiptFood='';
   receiptQuery='';
   receiptQuantity='';
   receiptLocation='pantry';
   receiptDate=receiptToday();
   receiptExpiry='';
   receiptCost='';
   receiptDialog.showModal();
 }
 async function returnToReceipt(food?:Food){
   if(!receiptDialog.open)return;
   if(food){
     if(!foods.some(item=>item.id===food.id))foods=[...foods,food];
     receiptFood=food.id;
     receiptQuery=food.name;
   }
   receiptAddingFood=false;
   await tick();
   if(receiptDialog.open){
     if(food)receiptAmount?.focus();
     else receiptSearch?.focus();
   }
 }
 async function saveReceipt(e:SubmitEvent){
   e.preventDefault();
   if(busy||!receiptItem)return;
   receiptError='';
   let saved=false;
   const body={foodId:receiptFood,quantity:receiptQuantity,location:receiptLocation,
     expiresOn:receiptExpiry||null,cost:receiptCost||null,receivedOn:receiptDate};
   await action(()=>api('/inventory/receipts','POST',body),'Namirnica je zaprimljena u zalihe.',{
     apply:()=>{saved=true},
     onError:e=>{receiptError=e instanceof Error?e.message:String(e)},
     showError:false,
   });
   if(saved)receiptDialog.close();
 }
 async function openMeal({
   source,meal='lunch',trigger=mealTrigger,
 }: {source?:{portionId:string}|PlanEntry;meal?:string;trigger?:HTMLButtonElement}={}){
   const portion=source&&'portionId' in source?source:null;
   const plan=source&&'recipe_version_id' in source?source:null;
   logError='';
   logSourceError='';
   logKind=portion?'portion':plan?'recipe':'food';
   logRecipeVersion=plan?{id:plan.recipe_version_id,name:plan.name}:null;
   logSource=portion?.portionId??plan?.recipe_version_id??'';
   logQuantity=plan?.portions??'1';
   logMeal=plan?.meal??meal;
   logConsume=false;
   const revision=contextRevision;
   await tick();
   if(active&&isDailyView&&revision===contextRevision&&!mealDialog.open){
     // Some browsers do not focus a button when clicked. Establish the modal's return target.
     mealReturnFocus=trigger;
     if (!source) trigger?.focus({preventScroll:true});
     mealDialog.showModal();
   }
 }
 function openLinkedMeal(source:{portionId:string}|PlanEntry){
   const selectedDate='entry_date' in source?source.entry_date:date;
   // The dashboard handles the anchor at document level before opening the form.
   requestAnimationFrame(()=>{
     if(!isDailyView)return;
     if(date!==selectedDate)selectPlanDay(selectedDate);
     if(date===selectedDate)void openMeal({source});
   });
 }
 function mealClosed(){
   if (active && isDailyView && document.activeElement===document.body) {
     (mealReturnFocus?.isConnected ? mealReturnFocus : mealTrigger)?.focus({preventScroll:true});
   }
   mealReturnFocus=undefined;
 }
 async function log(e:SubmitEvent){
   e.preventDefault();
   const form=e.currentTarget as HTMLFormElement;
   logError='';
   if (!logSourceField?.value) {
     logSourceError=logKind==='portion'?'Odaberi gotovu porciju.':logKind==='recipe'?'Odaberi recept.':'Odaberi namirnicu.';
     await tick();
     logSourceField?.focus();
     return;
   }
   logSourceError='';
   if (!form.reportValidity()) return;
   let saved=false;
   await action(
     ()=>api('/diary/entries','POST',{date,meal:logMeal,kind:logKind,sourceId:logSource,quantity:logQuantity,consumeInventory:logConsume}),
     'Obrok je zabilježen uz nutritivni snapshot.',
     {apply:()=>{saved=true},showError:false,
      onError:e=>{logError=e instanceof Error?e.message:String(e)}},
   );
   if(saved)mealDialog.close();
 }
 async function lotAction(e:SubmitEvent,lot:Lot){e.preventDefault();const data=new FormData(e.currentTarget as HTMLFormElement);const kind=String(data.get('kind'));await action(()=>api(`/inventory/${kind}`,'POST',{lotId:lot.id,quantity:String(data.get('quantity')),reason:String(data.get('reason')),location:String(data.get('location')),expectedVersion:lot.version}))}
 async function purchase(e:SubmitEvent,item:Shopping['items'][number]){e.preventDefault();const f=new FormData(e.currentTarget as HTMLFormElement);await action(()=>api('/shopping/receive','POST',{itemId:item.id,quantity:String(f.get('quantity')),location:String(f.get('location')),expiresOn:String(f.get('expiresOn'))||null,cost:String(f.get('cost'))||null,expectedVersion:item.version,receivedOn:String(f.get('receivedOn'))||null}))}
 async function previewPrep(e:SubmitEvent){
  e.preventDefault();
  const body={...prepBody,optionalIngredientPositions:[...prepBody.optionalIngredientPositions]};
  const fingerprint=JSON.stringify(body);
  prepPreview=null;preparedDate='';
  await action(()=>api<CookingPreview>('/prep/preview','POST',body),
   'Provjeri sastojke, količine i rok prije potvrde kuhanja.',{
    isCurrent:()=>fingerprint===JSON.stringify(prepBody),
    apply:result=>{prepPreview={...result,fingerprint}},
   });
 }
 $effect(()=>{if(prepPreview&&prepPreview.fingerprint!==JSON.stringify(prepBody))prepPreview=null});
 async function commitPrep(){
  if(!prepPreview?.feasible||prepPreview.fingerprint!==JSON.stringify(prepBody))return;
  const fingerprint=prepPreview.fingerprint;
  const body={...prepBody,optionalIngredientPositions:[...prepBody.optionalIngredientPositions],previewToken:prepPreview.previewToken};
  await action(()=>api('/prep/batches','POST',body),
   'Kuhanje je potvrđeno; gotove porcije su u zalihama.',{
    isCurrent:()=>fingerprint===JSON.stringify(prepBody),
    apply:()=>{prepPreview=null;scheduleId=null;preparedDate=body.asOf},
    onError:e=>{if(e instanceof DashboardApiError&&(e.status===409||e.status===422))prepPreview=null},
   });
 }
 function scaleBody(form:HTMLFormElement){
  const data=new FormData(form);
  return {portions:String(data.get('portions'))||null,byInventory:data.get('byInventory')==='on',asOf:date};
 }
 async function previewScale(e:SubmitEvent,recipe:Recipe){
  e.preventDefault();
  const form=e.currentTarget as HTMLFormElement,body=scaleBody(form);
  const fingerprint=JSON.stringify(body),versionId=recipe.versionId;
  delete scale[recipe.id];
  await action(()=>api<(typeof scale)[string]>(`/recipes/${recipe.id}/scale-preview`,'POST',body),
   'Skaliranje je pregled, original je sačuvan.',{
    isCurrent:()=>form.isConnected&&JSON.stringify(scaleBody(form))===fingerprint&&recipes.find(r=>r.id===recipe.id)?.versionId===versionId,
    apply:result=>{scale[recipe.id]=result},
   });
 }
 async function openUsdaEditor(){
  foodEdit=null;editorOpen=true;
  await tick();
  document.querySelector<HTMLInputElement>('.usda-picker input')?.focus();
 }
 function resetAi(){aiPreview=null;aiConfirmed=false;aiRetry=false;aiDrafts=[]}
 function selectedLots(){return JSON.stringify([...aiLots].sort())}
 async function previewAi(){
  const lotIds=[...aiLots],selection=selectedLots();
  resetAi();
  await action(()=>api<NonNullable<typeof aiPreview>>('/ai/preview','POST',{lotIds}),
   'Pregledaj namirnice prije potvrde.',{
    isCurrent:()=>selectedLots()===selection,
    apply:result=>{aiPreview=result},
   });
 }
 async function generateAi(){
  if(!aiPreview||!aiConfirmed)return;
  const previewId=aiPreview.previewId,selection=selectedLots();
  aiDrafts=[];
  await action(()=>api<{drafts:typeof aiDrafts}>('/ai/generate','POST',{previewId,confirmation:true}),
   'Prijedlozi su spremni za pregled.',{
    isCurrent:()=>aiConfirmed&&aiPreview?.previewId===previewId&&selectedLots()===selection,
    onError:()=>{resetAi();aiRetry=true},
    apply:result=>{aiDrafts=result.drafts;aiPreview=null;aiConfirmed=false},
   });
 }
 function resetPlanForm(){
   planFormOpen=false;
   planEdit=null;
   planRecipeVersion=null;
   planDate=date;
   planMeal='lunch';
   planRecipe='';
   planPortions='1';
 }
 async function openPlanForm(entry?:PlanEntry,copy=false,recipe?:Recipe){
   resetPlanForm();
   if(entry){
     if(!copy)planEdit={id:entry.id,version:entry.version};
     planDate=copy?shift(entry.entry_date,1):entry.entry_date;
     planRecipeVersion={id:entry.recipe_version_id,name:entry.name};
     planRecipe=entry.recipe_version_id;
     planPortions=entry.portions;
     planMeal=entry.meal;
   }
   if(recipe)planRecipe=recipe.versionId;
   planFormOpen=true;
   if(view==='planner'){
     await tick();
     planDateInput?.focus();
   }
 }
 async function savePlan(e:SubmitEvent){
   e.preventDefault();
   const status=plans.find(p=>p.id===planEdit?.id)?.status??'planned';
   const body={date:planDate,meal:planMeal,recipeVersionId:planRecipe,portions:planPortions,expectedVersion:planEdit?.version??1,status};
   const path=planEdit?`/plan/entries/${planEdit.id}`:'/plan/entries';
   await action(()=>api(path,planEdit?'PATCH':'POST',body),'Obrok je spremljen u plan.',{apply:resetPlanForm});
 }
 async function setPlanStatus(entry:PlanEntry,status:string){
   await action(()=>api(`/plan/entries/${entry.id}`,'PATCH',{
     date:entry.entry_date,meal:entry.meal,recipeVersionId:entry.recipe_version_id,
     portions:entry.portions,expectedVersion:entry.version,status,
   }),'Oznaka obroka u planu je spremljena.');
 }
 function setPrepRecipe(recipe:Recipe){
   scheduleId=null;
   scheduleSelection++;
   prepRecipeVersion=null;
   prepRecipe=recipe.versionId;
   prepQuantity=recipe.portions;
   prepOptionalPositions=[];
   prepPreview=null;
   preparedDate='';
 }
 async function loadScheduledPrep(item:(typeof schedule)[number]){
   const selection=++scheduleSelection;
   const revision=contextRevision;
   const id=item.recipe_version_id;
   error='';
   try{
     const recipe=recipes.find(r=>r.versionId===id)??await api<Recipe>(`/recipes/versions/${encodeURIComponent(id)}`);
     if(selection!==scheduleSelection||revision!==contextRevision||view!=='prep')return;
     setPrepRecipe(recipe);
     prepRecipeVersion=recipe;
     prepQuantity=String(item.portions/1000);
     scheduleId=item.id;
     await tick();
     document.getElementById('nutrition-prep-heading')?.focus();
   }catch(e){
     if(selection===scheduleSelection&&revision===contextRevision)error=e instanceof Error?e.message:String(e);
   }
 }
 async function savePrepSchedule(e:SubmitEvent){
   e.preventDefault();
   const body={plannedDate:plannedPrepDate,recipeVersionId:scheduledRecipe,portions:scheduledQuantity};
   await action(()=>api('/prep/schedule','POST',body),'Priprema je zakazana.',{
     apply:()=>{scheduledRecipe='';scheduledQuantity='1'},
   });
 }
 function sourceName(id:string){return foods.find(f=>f.id===id)?.name??'Namirnica'}
 async function adaptive(){await action(()=>api(`/adaptive/apply?date=${date}`,'POST',{trainingLabel:energy?.nextRun?.title??'Vlastiti plan treninga',durationMinutes:Number(trainingMinutes),extraCalories:extraCalories||'0',extraCarbs:extraCarbs||'0',expectedVersion:profile.version}),'Prilagodba je potvrđena i spremljena od odabranog datuma.')}

</script>

<div class="nutrition" aria-busy={loading||busy}>
 {#if active && navigationGroup.secondary.length}
 <nav class="nutrition-subnav" aria-label={'Odjeljci · '+navigationGroup.label}>
   {#each navigationLinks as link (link.id)}
     <a href={'#'+link.id} aria-current={link.id===nutritionSection?'page':undefined}>{link.label}</a>
   {/each}
 </nav>
 {/if}
 <div class="nutrition-toolbar">
   <div class="nutrition-heading">
     <h2>{titles[view]}</h2>
     <span class="badge"><time datetime={date}>{date}</time></span>
     {#if isDailyView && diary && (diary.complete || diary.entries.length)}
       <span class="badge">{diary.complete?'Potvrđen dan':'Dnevnik nije zaključen'}</span>
     {/if}
   </div>
   {#if active && isDailyView}
     <button class="btn nutrition-primary" bind:this={mealTrigger} onclick={()=>openMeal()} disabled={loading||busy||!diary}>Evidentiraj obrok</button>
   {/if}
   {#if active && view==='inventory'}
     <button class="btn nutrition-primary" onclick={openReceipt} disabled={loading||busy}>Zaprimi namirnicu</button>
   {/if}
   <button class="btn" onclick={refresh} disabled={loading}>Osvježi prehranu</button>
   {#if active}<NutritionProfile {profile} {date} onchange={load} bind:details={profileDetails}/>{/if}
 </div>
 {#if error}<div class="nutrition-notice error" role="alert">{error}</div>{/if}
 {#if message}<div class="nutrition-notice" role="status">{message}</div>{/if}
 {#if loading&&!diary}<div class="loading">Učitavam prehranu…</div>{/if}
 {#if active}
 {#if isDailyView && diary}
 <div class="nutrition-day">
   <article class="panel nutrition-day-meals" id="nutrition-diary">
     <h3>Dnevnik prehrane</h3>
     {#each dayMeals as meal (meal.key)}
       <section class="nutrition-meal" aria-labelledby={'diary-meal-'+meal.key}>
         <header class="nutrition-meal-heading">
           <h4 id={'diary-meal-'+meal.key}>{meal.label}</h4>
           <button type="button" class="btn nutrition-add-meal" aria-label={'Dodaj unos · '+meal.label}
             disabled={loading||busy} onclick={event=>openMeal({meal:meal.key,trigger:event.currentTarget})}>Dodaj unos</button>
         </header>
         {#each meal.entries as entry (entry.id)}
           <div class="nutrition-row">
             <div>
               <span class="badge">Evidentirano</span>
               <p><b>{entry.name}</b> · {entry.quantity} {entry.unit} · {fmt(entry.nutrients.kcal,0)} kcal · {fmt(entry.nutrients.protein)} g proteina</p>
             </div>
             <button class="btn" disabled={busy} onclick={()=>action(()=>api(`/operations/${entry.operation_id}/reverse`,'POST'),'Unos je poništen kompenzacijom povezanog inventara.')}>Poništi unos</button>
           </div>
         {:else}
           <p class="quiet nutrition-meal-empty">Nema unosa</p>
         {/each}
         {#each meal.planned as planned (planned.id)}
           <p><span class="badge">{planStatusLabels[planned.status]??'Iz plana'}</span> <b>{planned.name}</b> · {fmt(planned.portions,3)} porcija</p>
         {/each}
       </section>
     {/each}
     <button class="btn" disabled={busy} onclick={()=>action(()=>api(`/diary/days/${date}`,'PUT',{complete:!diary!.complete}))}>{diary.complete?'Ponovno otvori dan':'Potvrdi da je dnevnik za dan potpun'}</button>
   </article>
   <article class="panel nutrition-day-summary">
     <section>
       <h3>Energija</h3>
       <strong class="nutrition-value">{fmt(diary.nutrients.kcal,0)} <small>kcal uneseno</small></strong>
       {#if nutritionTargets.calories}
         <p>Cilj {fmt(nutritionTargets.calories,0)} kcal</p>
       {:else}
         <button class="btn" onclick={()=>{if(profileDetails){profileDetails.open=true;profileDetails.querySelector('summary')?.focus()}}}>Postavi cilj</button>
       {/if}
       {#if nutritionTargets.calories&&diary.nutrients.kcal!==null}
         <progress aria-label="Napredak prema dnevnom kalorijskom cilju" max="100" value={Math.min(100,Number(diary.nutrients.kcal)/Number(nutritionTargets.calories)*100)}></progress>
         <p>{fmt(Number(diary.nutrients.kcal)/Number(nutritionTargets.calories)*100,0)}% cilja</p>
       {/if}
     </section>
     <section>
       <div class="nutrition-day-summary-heading">
         <h3>Makronutrijenti</h3>
         <span class="quiet">Unos / cilj</span>
       </div>
       {#each [['protein','Proteini'],['carbs','Ugljikohidrati'],['fat','Masti']] as [key,label]}
         <div class="nutrition-kv"><span>{label}</span><b>{fmt(comparableMacros?.[key as keyof typeof diary.nutrients])} / {fmt(nutritionTargets[key])} g</b></div>
       {/each}
       {#if diary.entries.length}
         <p class="quiet">{carbExplanation(diary.carbComparison)}</p>
         <p class="quiet">UH {fmt(diary.nutrients.carbs)} g prema izvornim zapisima.</p>
         <p class="quiet">Vlakna {fmt(diary.nutrients.fiber)} g · energija prema izvornoj deklaraciji.</p>
       {/if}
     </section>
   </article>
 </div>
 {:else if view==='trends' && diary}
 <article class="panel"><h3>Garmin energetski kontekst</h3><strong class="nutrition-value">{fmt(energy?.totalCalories,0)} <small>kcal ukupno</small></strong><p>Aktivno {fmt(energy?.activeCalories,0)} kcal · mirovanje {fmt(energy?.restingCalories,0)} kcal</p><p>Lokalna procjena punog dana: ≈{fmt(energy?.localEstimate,0)} kcal</p><p>Bilanca do sinkronizacije: {fmt(balance,0)} kcal</p><p class="quiet">{energy?.source??'Garmin'} · {energy?.date??date} · {energy==null?'Učitavanje':energy.totalCalories==null?'Nedostupno':energy.status==='partial'?'Djelomično':'Dostupno'}. {diary.complete?'':'Dnevnik je nepotpun.'}</p></article>
 <NutritionCharts {days} {energy}/>
 <NutritionTraining {date}/>
 {:else if view==='inventory'}
 {#if stockOverview && (stockOverview.alerts.length || stockOverview.lowStock.length)}
   <article class="panel">
     <h3>Upozorenja zaliha</h3>
     <ul class="nutrition-stock-alerts">
       {#each stockOverview.alerts as lot (lot.id)}
         <li>
           <strong>{lot.name}</strong>
           <span>{lot.quantity} {lot.unit} · {lot.expires_on && lot.expires_on < stockOverview.diary.date?'Istekao rok':'Rok'} {lot.expires_on}</span>
         </li>
       {/each}
       {#each stockOverview.lowStock as food (food.id)}
         <li><strong>{food.name}</strong><span>Ispod minimalne zalihe od {food.minimumQuantity} {food.unit}</span></li>
       {/each}
     </ul>
   </article>
 {/if}
 <p class="quiet">Trenutačne zalihe. Namirnice s najbližim rokom prikazane su prve.</p>
 <div class="nutrition-grid">{#each inventoryLots as lot (lot.id)}<article class="panel"><h3>{lot.name}</h3>{#if Number(lot.expiredQuantity)>0}<span class="badge">Istekao rok</span>{/if}<strong class="nutrition-value">{lot.quantity} <small>{lot.unit}</small></strong><p>{locationLabels[lot.location]} · rok {lot.expires_on??'nije zadan'}</p><p>Raspoloživo {lot.availableQuantity??'—'} {lot.unit} · isteklo {lot.expiredQuantity??'—'} {lot.unit}</p><p class="quiet">Primitak ili priprema {lot.receivedOn??'datum nije poznat; zaliha je isključena iz raspoloživosti'}</p><details><summary>Otpad, premještanje ili korekcija</summary><form class="nutrition-form" onsubmit={(e)=>lotAction(e,lot)}><label>Operacija<select name="kind"><option value="waste">Otpad</option><option value="transfers">Premjesti količinu</option><option value="adjustments">Postavi ispravno stanje</option></select></label><label>Količina<input name="quantity" required inputmode="decimal"/></label><label>Lokacija<select name="location">{#each Object.entries(locationLabels) as [k,l]}<option value={k}>{l}</option>{/each}</select></label><label>Razlog<input name="reason" required maxlength="300"/></label><button class="btn" disabled={busy}>Potvrdi promjenu</button></form></details></article>{:else}<article class="panel"><p class="quiet">Nema namirnica na stanju. Odaberi Zaprimi namirnicu za prvi primitak.</p></article>{/each}</div>
 {:else if view==='ai-recipes'}
 <article class="panel"><h3>AI Recipe Assistant</h3><p class="quiet">Odaberi namirnice. Prije slanja prikazat će se točan sadržaj zahtjeva. AI budžet postavljaš u profilu.</p>{#each lots.filter(l=>l.food_id) as l}<label class="nutrition-check"><input type="checkbox" value={l.id} bind:group={aiLots} onchange={resetAi}/>{l.name} · {l.quantity} {l.unit} · {l.expires_on??'bez roka'}</label>{/each}<button class="btn" disabled={busy||!aiLots.length} onclick={previewAi}>{aiRetry?'Novi pregled za slanje':'Prikaži sadržaj za slanje'}</button>
 {#if aiPreview}<div class="nutrition-notice"><h4>OpenAI-ju se šalje</h4>{#each aiPreview.items as i}<p>{i.name} · {i.quantity} {i.unit}</p>{/each}<details><summary>Statičke upute</summary><p>{aiPreview.staticInstructions}</p></details><label class="nutrition-check"><input type="checkbox" bind:checked={aiConfirmed}/>Potvrđujem slanje prikazanih naziva i količina OpenAI-ju</label><button class="btn" disabled={busy||!aiConfirmed} onclick={generateAi}>Generiraj recepte</button></div>{/if}
 {#each aiDrafts as draft}<details class="nutrition-notice"><summary>{draft.recipe.name}</summary>{#each draft.recipe.ingredients as i}<p>{sourceName(i.foodId)} · {i.quantity}</p>{/each}<ol>{#each draft.recipe.steps as s}<li>{s}</li>{/each}</ol><button class="btn" disabled={busy} onclick={()=>action(()=>api(`/ai/drafts/${draft.id}/save`,'POST'))}>Spremi recept lokalno</button></details>{/each}</article>
 {:else if view==='catalog'}
 <details class="panel nutrition-details" bind:open={editorOpen}><summary>{foodEdit?'Uredi namirnicu':'Nova namirnica'}</summary>
 {#key JSON.stringify([date,foodEdit?.id,editorVersion])}
 <CatalogEditor mode="food" {foods} food={foodEdit} showLookup={editorOpen} onexisting={f=>{foodEdit=f;editorOpen=true}}
   onrefresh={load} onchange={async()=>{foodEdit=null;editorVersion++;message='Namirnica je spremljena u katalog.';await load()}}/>
 {/key}{#if foodEdit}<button type="button" class="btn" onclick={()=>foodEdit=null}>Završi uređivanje namirnice</button>{/if}</details>
 <details class="panel nutrition-details"><summary>Provjereni nutritivni izvori · USDA</summary>
 <p>Pronađi izvor i pregledaj vrijednosti u obrascu prije spremanja.</p>
 <button class="btn" onclick={openUsdaEditor}>Otvori USDA pretragu u obrascu</button></details>
 <details class="panel nutrition-details"><summary>Katalog namirnica · {foods.length}</summary>{#each foods as f}<div class="nutrition-row"><span>{f.name} · {f.state} · {f.source} · {f.retrievedAt??"datum izvora nije dostupan"}</span><button class="btn" onclick={()=>{foodEdit=f;editorOpen=true}}>Uredi</button></div>{:else}<p class="quiet">Katalog je prazan.</p>{/each}</details>
 {:else if view==='inventory-history'}
 <article class="panel"><h3>Promjene zaliha</h3>{#each history as h}<div class="nutrition-row"><span>{h.created_at} · {h.reason} · {fmt(h.delta/1000)}</span><button class="btn" disabled={busy||Boolean(h.reversed_by)} onclick={()=>action(()=>api(`/operations/${h.operation_id}/reverse`,'POST'))}>Poništi operaciju</button></div>{:else}<p class="quiet">Nema zaprimanja ni promjena zaliha.</p>{/each}</article>
 {:else if view==='recipes'}
 <div class="nutrition-fields"><label>Pretraži recepte<input type="search" bind:value={search}/></label><label>Prehrambena oznaka<input bind:value={recipeFilter} placeholder="Prazno za sve"/></label></div>
 <details class="panel nutrition-details" open={Boolean(recipeEdit)}><summary>{recipeEdit?'Uredi recept':'Novi recept'}</summary><CatalogEditor mode="recipe" {foods} recipe={recipeEdit} onchange={async()=>{recipeEdit=null;await load()}}/>{#if recipeEdit}<button class="btn" onclick={()=>recipeEdit=null}>Završi uređivanje</button>{/if}</details>
 <div class="nutrition-grid">{#each shownRecipes as r}<article class="panel"><h3>{r.name}</h3><p>{r.portions} porcija · {r.minutes} min · {r.method}</p><p>{fmt(r.perPortion.kcal,0)} kcal · {fmt(r.perPortion.protein)} g proteina / porcija · {fmt(r.costPerPortion,2)} EUR</p><p class="quiet">{r.nutritionComplete?'Nutritivni podaci dostupni':'Nutritivni podaci nepotpuni'} · cijena prema zabilježenim nabavama</p><details><summary>Sastojci, izvori cijena i priprema</summary>{#each r.priceSources??[] as source}<p class="quiet">Nabavna cijena: {source.name} · {source.date}</p>{/each}{#each r.ingredients as i}<p>{sourceName(i.foodId)} · {i.quantity} {foods.find(f=>f.id===i.foodId)?.unit}</p>{/each}<ol>{#each r.steps as s}<li>{s}</li>{/each}</ol></details><div class="nutrition-actions"><button class="btn" onclick={()=>recipeEdit=r}>Uredi</button><button class="btn" disabled={busy} onclick={()=>action(()=>api(`/recipes/${r.id}/duplicate`,'POST'))}>Dupliciraj</button><a class="btn nutrition-link" href="#nutrition-prep" onclick={()=>setPrepRecipe(r)}>Pripremi</a><a class="btn nutrition-link" href="#nutrition-planner" onclick={()=>openPlanForm(undefined,false,r)}>Planiraj</a></div>
 <form class="nutrition-form" onsubmit={(e)=>previewScale(e,r)} oninput={()=>delete scale[r.id]} onchange={()=>delete scale[r.id]}><label>Željene porcije<input name="portions" inputmode="decimal" value={r.portions}/></label><label class="nutrition-check"><input type="checkbox" name="byInventory"/>Najveći broj porcija prema zalihama</label><button class="btn" disabled={busy}>Pregled skaliranja</button></form>{#if scale[r.id]}<p>{scale[r.id].portions} porcija · faktor {scale[r.id].factor} · {scale[r.id].feasible?'izvedivo':'nedostaju sastojci'}</p>{#each scale[r.id].missing as m}<p>{m.name}: nedostaje {m.quantity}</p>{/each}{/if}</article>{:else}<article class="panel">Nema recepata za ovaj filtar.</article>{/each}</div>
 {:else if view==='prep'}
 <article class="panel">
   <h3 id="nutrition-prep-heading" tabindex="-1">Priprema unaprijed</h3>
   <p class="quiet">Datum kuhanja · {date}. Pregled provjerava zalihe za ovaj dan.</p>
   {#if scheduleId}
     <div class="nutrition-notice nutrition-actions">
       <span>Preuzeto iz rasporeda · {schedule.find(item=>item.id===scheduleId)?.planned_date??'datum nije dostupan'}</span>
       <button class="btn" disabled={busy} onclick={()=>{scheduleId=null;prepPreview=null}}>Odvoji od rasporeda</button>
     </div>
   {/if}
   <form class="nutrition-form" onsubmit={previewPrep}>
     <fieldset class="nutrition-prep-fields" disabled={busy&&Boolean(prepPreview)}>
       <div class="nutrition-fields">
         <label>Recept<select required bind:value={prepRecipe} disabled={Boolean(scheduleId)}
           onchange={()=>{scheduleSelection++;prepRecipeVersion=null;prepOptionalPositions=[];prepPreview=null;preparedDate=''}}>
           <option value="">Odaberi</option>
           {#each prepChoices as recipe (recipe.id)}<option value={recipe.id}>{recipe.name}</option>{/each}
         </select></label>
         <label>Porcije<input required inputmode="decimal" bind:value={prepQuantity} readonly={Boolean(scheduleId)}/></label>
         <label>Gotova masa · g<input inputmode="decimal" bind:value={prepMass} placeholder="Izmjerena, opcionalno"/></label>
         <label>Lokacija<select bind:value={prepLocation}>{#each Object.entries(locationLabels) as [key,label]}
           <option value={key}>{label}</option>
         {/each}</select></label>
         <label>Rok gotovog jela<input type="date" required min={date} bind:value={prepExpiry}/></label>
       </div>
       {#each selectedPrepRecipe?.ingredients??[] as ingredient,position}
         {#if ingredient.optional}
           <label class="nutrition-check"><input type="checkbox" value={position} bind:group={prepOptionalPositions}/>Uključi opcionalni sastojak · {sourceName(ingredient.foodId)}</label>
         {/if}
       {/each}
       <p class="quiet">Isključeni opcionalni sastojci izostaju iz potrošnje i kalorija. Najmanja količina je 0,001 inventarne jedinice.</p>
       <button class="btn nutrition-primary" disabled={busy}>Provjeri pripremu</button>
     </fieldset>
   </form>
   {#if prepPreview}
     <div class="nutrition-notice nutrition-cooking-preview">
       <h4>Pregled kuhanja</h4>
       <p><strong>{prepPreview.portions} porcija</strong> · {prepPreview.feasible?'sastojci su dostupni':'pregled nije spreman za potvrdu'}</p>
       {#each prepPreview.issues as issue}<p>{issue.message}</p>{/each}
       {#each prepPreview.warnings as warning}<p>{warning}</p>{/each}
       {#if prepPreview.ingredientAvailability}
         <dl class="nutrition-cooking-needs">
           {#each prepPreview.ingredientAvailability as ingredient (ingredient.foodId)}
             <div>
               <dt>{ingredient.name}</dt>
               <dd>Potrebno {ingredient.required} {ingredient.unit} · raspoloživo {ingredient.available} {ingredient.unit}
                 {#if Number(ingredient.missing)>0} · <strong>nedostaje {ingredient.missing} {ingredient.unit}</strong>{/if}
               </dd>
             </div>
           {/each}
         </dl>
       {:else}
         {#each prepPreview.ingredients as ingredient}<p>{ingredient.name} · potrebno {ingredient.quantity} {ingredient.unit}</p>{/each}
         {#each prepPreview.missing as item}<p>{item.name} · nedostaje {item.quantity} {item.unit}</p>{/each}
       {/if}
       <p>{fmt(prepPreview.nutrients.kcal,0)} kcal · proteini {fmt(prepPreview.nutrients.protein)} g · UH {fmt(prepPreview.nutrients.carbs)} g · masti {fmt(prepPreview.nutrients.fat)} g</p>
       <p>Trošak utrošenih zaliha {fmt(prepPreview.cost,2)} EUR · masa po porciji {fmt(prepPreview.massPerPortion)} g</p>
       <button class="btn nutrition-primary" disabled={busy||!prepPreview.feasible||prepPreview.fingerprint!==JSON.stringify(prepBody)}
         onclick={commitPrep}>Potvrdi kuhanje i potrošnju sastojaka</button>
     </div>
   {/if}
   {#if preparedDate===date}
     <a class="btn nutrition-link nutrition-result-link" href="#nutrition-portions">Otvori gotove porcije</a>
   {/if}
 </article>
 <article class="panel">
   <h3>Raspored pripreme</h3>
   <p class="quiet">Zakazivanje rezervira mjesto u rasporedu. Sastojci se troše tek potvrdom kuhanja.</p>
   <form class="nutrition-form" onsubmit={savePrepSchedule}>
     <div class="nutrition-fields">
       <label>Recept za zakazivanje<select required bind:value={scheduledRecipe} onchange={()=>{
         scheduledQuantity=recipes.find(recipe=>recipe.versionId===scheduledRecipe)?.portions??'1';
       }}>
         <option value="">Odaberi</option>
         {#each recipes as recipe (recipe.versionId)}<option value={recipe.versionId}>{recipe.name}</option>{/each}
       </select></label>
       <label>Porcije za zakazivanje<input required inputmode="decimal" bind:value={scheduledQuantity}/></label>
       <label>Planirani datum pripreme<input type="date" required min={receiptToday()} bind:value={plannedPrepDate}/></label>
     </div>
     <button class="btn" disabled={busy}>Zakaži pripremu</button>
   </form>
   {#each schedule as item (item.id)}
     <div class="nutrition-row">
       <span>{item.planned_date} · {item.name} · {fmt(item.portions/1000,3)} porcija</span>
       <div class="nutrition-actions">
         <button class="btn" disabled={busy||scheduleId===item.id} onclick={()=>loadScheduledPrep(item)}>Odaberi za kuhanje</button>
         <button class="btn" disabled={busy} onclick={()=>action(()=>api(`/prep/schedule/${item.id}`,'DELETE'),
           'Zakazana priprema je otkazana.',{apply:()=>{scheduleSelection++;if(scheduleId===item.id){scheduleId=null;prepPreview=null}}})}>Otkaži plan</button>
       </div>
     </div>
   {:else}
     <p class="quiet">Nema zakazanih priprema.</p>
   {/each}
 </article>
 {:else if view==='portions'}
 <div class="nutrition-grid">
   {#each portionCards as portion (portion.id)}
     {@const available=availablePortions.get(portion.id)}
     {@const physical=preparedLots.find(lot=>lot.id===portion.id)}
     <article class="panel">
       <h3>{portion.name}</h3>
       <strong class="nutrition-value">{fmt(available?.quantity??(overview?0:null),3)} <small>raspoloživih porcija</small></strong>
       <p>{locationLabels[portion.location]} · rok {portion.expires_on??'nije zadan'}</p>
       <p class="quiet">Fizički na stanju sada {fmt(physical?.quantity??0,3)} · priprema {portion.receivedOn??'datum nije dostupan'}</p>
       {#if available}
         <a class="btn nutrition-link" href="#nutrition-diary" onclick={()=>openLinkedMeal({portionId:portion.id})}>Zabilježi konzumaciju</a>
       {:else if overview}
         <p class="quiet">{portion.expires_on&&portion.expires_on<date?'Rok je istekao za odabrani datum.':portion.receivedOn&&portion.receivedOn>date?'Porcija nije bila pripremljena na odabrani dan.':'Porcija nije raspoloživa za odabrani datum.'}</p>
       {/if}
     </article>
   {:else}
     {#if !loading}<article class="panel"><p class="quiet">Nema gotovih porcija. Potvrđeno kuhanje stvara porcije za kasniju evidenciju.</p><a class="btn nutrition-link" href="#nutrition-prep">Otvori pripremu</a></article>{/if}
   {/each}
 </div>
 {:else if view==='planner'}
 <article class="panel nutrition-planner-controls">
   <div class="nutrition-actions">
     <button class="btn nutrition-primary" aria-expanded={planFormOpen} aria-controls="nutrition-plan-form" disabled={busy}
       onclick={()=>planFormOpen?resetPlanForm():openPlanForm()}>Planiraj obrok</button>
     <a class="btn nutrition-link" href="#nutrition-shopping" onclick={startPlanShopping}>Izradi popis za kupovinu</a>
   </div>
   {#if allDays.length}
     <div class="nutrition-week-picker" role="group" aria-label="Odaberi dan u tjednu">
       {#each allDays as day (day)}
         <button class="btn" aria-pressed={day===date} aria-label={planDayLabel(day,true)}
           onclick={()=>selectPlanDay(day)}>{planDayLabel(day)}</button>
       {/each}
     </div>
   {/if}
   <div id="nutrition-plan-form" hidden={!planFormOpen}>
     <form class="nutrition-form" onsubmit={savePlan}>
       <h3>{planEdit?'Uredi ili premjesti planirani obrok':'Dodaj planirani obrok'}</h3>
       <div class="nutrition-fields">
         <label>Datum<input type="date" required bind:this={planDateInput} bind:value={planDate}/></label>
         <label>Obrok<select bind:value={planMeal}>{#each Object.entries(mealLabels) as [key,label]}<option value={key}>{label}</option>{/each}</select></label>
         <label>Recept<select required bind:value={planRecipe}>
           <option value="">Odaberi</option>
           {#each recipeChoices(planRecipeVersion) as recipe (recipe.id)}<option value={recipe.id}>{recipe.name}</option>{/each}
         </select></label>
         <label>Porcije<input required inputmode="decimal" bind:value={planPortions}/></label>
       </div>
       <div class="nutrition-actions">
         <button class="btn nutrition-primary" disabled={busy}>{planEdit?'Spremi izmjenu plana':'Dodaj u plan'}</button>
         <button type="button" class="btn" onclick={resetPlanForm}>Odustani</button>
       </div>
     </form>
   </div>
 </article>
 <p class="quiet">Status obroka uređuje plan. Za stvarni unos upotrijebi Evidentiraj obrok i potvrdi ga u dnevniku.</p>
 <div class="nutrition-week">
   {#each allDays as day (day)}
     <article class="panel nutrition-plan-day" class:nutrition-selected-day={day===date} data-date={day}>
       <h3>{planDayLabel(day,true)}</h3>
       <p class="quiet">Planirano {fmt(planSummary?.days.find(item=>item.date===day)?.nutrients.kcal,0)} kcal</p>
       {#each plans.filter(entry=>entry.entry_date===day) as entry (entry.id)}
         <div class="nutrition-plan-item">
           <b>{mealLabels[entry.meal]} · {entry.name}</b>
           <p>{entry.portions} porcija · {fmt(entry.nutrients.kcal,0)} kcal · {fmt(entry.nutrients.protein)} g proteina</p>
           <label>Status plana<select value={entry.status} disabled={busy}
             onchange={(event)=>setPlanStatus(entry,event.currentTarget.value)}>
             <option value="planned">Planirano</option>
             <option value="prepared">Pripremljeno</option>
             <option value="consumed">Konzumirano</option>
             <option value="skipped">Preskočeno</option>
           </select></label>
           <div class="nutrition-actions">
             {#if day<=receiptToday()}
               <a class="btn nutrition-link" href="#nutrition-diary" onclick={()=>openLinkedMeal(entry)}>Evidentiraj obrok</a>
             {/if}
             <button class="btn" disabled={busy} onclick={()=>openPlanForm(entry)}>Uredi / premjesti</button>
             <button class="btn" disabled={busy} onclick={()=>openPlanForm(entry,true)}>Kopiraj na sljedeći dan</button>
             <button class="btn" disabled={busy} onclick={()=>action(()=>api(`/plan/entries/${entry.id}`,'DELETE'))}>Ukloni plan</button>
           </div>
         </div>
       {:else}
         <p class="quiet">Nema planiranih obroka.</p>
       {/each}
     </article>
   {/each}
 </div>
 <article class="panel">
   <h3>Planirani tjedni zbroj</h3>
   <p>{fmt(planSummary?.nutrients.kcal,0)} kcal · {fmt(planSummary?.nutrients.protein)} g proteina · procjena troška {fmt(planSummary?.estimatedCost,2)} EUR</p>
   <p class="quiet">Zbroj uključuje planirane obroke. Ako nedostaje deklaracija ili nabavna cijena, odgovarajuća vrijednost ostaje nepotpuna.</p>
 </article>
 <details class="panel nutrition-details"><summary>Sportska prehrana · tvoja pravila</summary><p class="quiet">Sljedeći trening: {energy?.nextRun?.title??'nije dostupan'}{energy?.nextRun?.date?' · '+energy.nextRun.date:''}. Ovdje sam određuješ prilagodbu; ne izračunava se iz aktivnih kalorija.</p><form class="nutrition-form" onsubmit={(e)=>{e.preventDefault();void adaptive()}}><label>Planirano trajanje · min<input required inputmode="numeric" bind:value={trainingMinutes}/></label><label>Tvoj dodatni kalorijski cilj · kcal<input required inputmode="decimal" bind:value={extraCalories}/></label><label>Tvoj dodatni cilj UH · g<input required inputmode="decimal" bind:value={extraCarbs}/></label><p>Prilagodba se sprema od {date}. Trajanje {trainingMinutes||'nije zadano'} min služi kao tvoj kontekst.</p><button class="btn" disabled={busy}>Potvrdi i spremi prilagođene ciljeve</button></form></details>
 {:else if view==='shopping'}
 {#each lists as list (list.id)}<article class="panel"><h3>{list.name}</h3><details><summary>Ručno dodaj namirnicu</summary><form class="nutrition-form" onsubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget as HTMLFormElement);void action(()=>api(`/shopping/lists/${list.id}/items`,'POST',{foodId:String(f.get('foodId')),quantity:String(f.get('quantity')),packageSize:String(f.get('packageSize'))||null}))}}><label>Namirnica<select name="foodId" required><option value="">Odaberi</option>{#each foods as f}<option value={f.id}>{f.name} · {f.unit}</option>{/each}</select></label><label>Količina<input name="quantity" required inputmode="decimal"/></label><label>Veličina pakiranja<input name="packageSize" inputmode="decimal"/></label><button class="btn" disabled={busy}>Dodaj na listu</button></form></details>{#each list.items as item (item.id)}<details class="nutrition-notice"><summary>{item.name} · {item.quantity} {item.unit} · {item.received?'zaprimljeno':item.checked?'kupljeno':'za kupnju'}</summary>
 {#if !item.received}<form class="nutrition-form" onsubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget as HTMLFormElement);void action(()=>api(`/shopping/items/${item.id}`,'PATCH',{quantity:String(f.get('quantity')),packageSize:String(f.get('packageSize'))||null,checked:f.get('checked')==='on',expectedVersion:item.version}))}}><label>Potrebna količina<input name="quantity" value={item.quantity} required inputmode="decimal"/></label><label>Veličina pakiranja<input name="packageSize" value={item.packageSize??''} inputmode="decimal"/></label>{#if item.packageSize}<p>Pakiranja: {Math.ceil(Number(item.quantity)/Number(item.packageSize))}</p>{/if}<label class="nutrition-check"><input type="checkbox" name="checked" checked={item.checked}/>Kupljeno (još ne mijenja inventar)</label><button class="btn" disabled={busy}>Spremi stavku</button></form>
 <details><summary>Zaprimi kupljeno u inventar</summary><form class="nutrition-form" onsubmit={(e)=>purchase(e,item)}><label>Datum stvarnog primitka<input type="date" name="receivedOn" value={receiptToday()} required/></label><label>Stvarno primljena količina · {item.unit==='piece'?'kom':item.unit}<input name="quantity" value={item.quantity} required inputmode="decimal"/></label><label>Lokacija<select name="location">{#each Object.entries(locationLabels) as [k,l]}<option value={k}>{l}</option>{/each}</select></label><label>Rok<input type="date" name="expiresOn"/></label><label>Ukupna cijena · EUR<input name="cost" inputmode="decimal"/></label><button class="btn" disabled={busy}>Potvrdi prijem u inventar</button></form></details>{/if}</details>{/each}</article>{:else}<article class="panel">Nema spremljenih lista. Izračunaj manjkove iz plana ili izradi praznu listu za ručni unos.</article>{/each}
 <article class="panel">
   <h3 id="nutrition-shopping-builder" tabindex="-1">Manjkovi za odabrano razdoblje</h3>
   <form class="nutrition-form" onsubmit={previewShopping}>
     <div class="nutrition-fields">
       <label>Početak razdoblja<input type="date" required bind:value={shoppingStart} oninput={invalidateShopping}/></label>
       <label>Kraj razdoblja<input type="date" required min={shoppingStart} bind:value={shoppingEnd} oninput={invalidateShopping}/></label>
     </div>
     <button class="btn" disabled={busy||!shoppingRangeValid}>Izračunaj manjkove</button>
   </form>
   {#if shoppingPreview}
     {#if !shoppingPreview.items.length}
       <p>{isSelectedWeek&&plans.length===0?'Tjedni plan je prazan. Nema izračunatih stavki za kupnju.':'Za odabrani plan nema izračunatih manjkova.'}</p>
       <p class="quiet">Možeš izraditi praznu listu i ručno dodati namirnice.</p>
     {/if}
     {#each shoppingPreview.items as item}
       <p>{item.name}: nedostaje {item.quantity} {item.unit} · {fmt(item.cost,2)} EUR · cijena {item.priceDate??'nepoznata'}</p>
     {/each}
     <button class="btn" disabled={busy} onclick={saveShopping}>{shoppingPreview.items.length?'Spremi novu listu':'Izradi praznu listu'}</button>
   {/if}
 </article>
 {/if}
 {/if}
 <dialog class="panel nutrition-dialog" bind:this={receiptDialog}
   onclose={()=>{if(!receiptDialog.open)receiptAddingFood=false}} oncancel={(e)=>{if(busy||savingReceiptFood)e.preventDefault()}} aria-labelledby="nutrition-receipt-title">
   <article>
     {#if receiptAddingFood}
       <h3 id="nutrition-receipt-title">Nova namirnica</h3>
       <CatalogEditor mode="food" {foods} initialName={receiptQuery.trim()} showLookup bind:saving={savingReceiptFood}
         onexisting={returnToReceipt} onchange={returnToReceipt} onrefresh={load}/>
       <button class="btn" disabled={savingReceiptFood} onclick={()=>returnToReceipt()}>Natrag na primitak</button>
     {:else}
       <h3 id="nutrition-receipt-title">Prijem namirnica</h3>
       <form class="nutrition-form" onsubmit={saveReceipt}>
         <fieldset disabled={busy} class="nutrition-receipt-fields">
           <label>Pronađi namirnicu<input bind:this={receiptSearch} type="search" maxlength="150"
             bind:value={receiptQuery} oninput={()=>{receiptFood=''}} placeholder="Npr. zobene pahuljice"/></label>
           <div class="nutrition-actions">
             <label>Namirnica<select required bind:value={receiptFood}>
               <option value="">Odaberi</option>
               {#each matchingReceiptFoods as food (food.id)}
                 <option value={food.id}>{food.name} · {food.unit==='piece'?'kom':food.unit}</option>
               {/each}
             </select></label>
             <button class="btn" type="button" onclick={()=>receiptAddingFood=true}>Nova namirnica</button>
           </div>
           {#if !matchingReceiptFoods.length}<p class="quiet">Nema podudaranja u katalogu. Možeš dodati novu namirnicu.</p>{/if}
           <div class="nutrition-fields">
             <label>Količina za prijem{receiptUnit?' · '+receiptUnit:''}<input bind:this={receiptAmount} required
               disabled={!receiptItem} inputmode="decimal" bind:value={receiptQuantity}/></label>
             <label>Lokacija<select bind:value={receiptLocation}>{#each Object.entries(locationLabels) as [key,label]}
               <option value={key}>{label}</option>
             {/each}</select></label>
             <label>Datum stvarnog primitka<input type="date" required bind:value={receiptDate}/></label>
             <label>Rok<input type="date" bind:value={receiptExpiry}/></label>
             <label>Nabavna cijena ukupno · EUR<input inputmode="decimal" bind:value={receiptCost} placeholder="Nepoznato"/></label>
           </div>
         </fieldset>
         {#if receiptError}<p class="error" role="alert">{receiptError}</p>{/if}
         <div class="nutrition-actions">
           <button class="btn nutrition-primary" disabled={busy||!receiptItem}>Potvrdi prijem</button>
           <button class="btn" type="button" disabled={busy} onclick={()=>receiptDialog.close()}>Odustani</button>
         </div>
       </form>
     {/if}
   </article>
 </dialog>
 <dialog class="panel nutrition-dialog" bind:this={mealDialog} onclose={mealClosed}
   oncancel={(event)=>{if(busy)event.preventDefault()}} aria-labelledby="nutrition-meal-dialog-title">
   <h3 id="nutrition-meal-dialog-title">Dodaj obrok</h3>
   <p class="quiet">Datum unosa · {date}</p>
   <form class="nutrition-form" novalidate onsubmit={log}>
   <div class="nutrition-fields">
     <label>Vrsta
       <select bind:value={logKind} onchange={()=>{logSource='';logRecipeVersion=null;logConsume=false;logSourceError=''}}>
         <option value="food">Namirnica</option>
         <option value="recipe">Recept · samo evidencija</option>
         <option value="portion">Gotova porcija · potrošnja</option>
       </select>
     </label>
     <div>
       <label>Odaberi
         <select required bind:this={logSourceField} bind:value={logSource}
           aria-invalid={logSourceError?'true':undefined}
           aria-describedby={logSourceError?'meal-source-error':undefined}
           onchange={()=>{logSourceError=''}}>
           <option value="">Odaberi</option>
           {#each options as o}<option value={o.id}>{o.name}</option>{/each}
         </select>
       </label>
       {#if logSourceError}<p class="error meal-source-error" id="meal-source-error" role="alert">{logSourceError}</p>{/if}
     </div>
     <label>Količina · {options.find(o=>o.id===logSource)?.unit??'jedinica'}
       <input required inputmode="decimal" bind:value={logQuantity}/>
     </label>
     <label>Obrok
       <select bind:value={logMeal}>{#each Object.entries(mealLabels) as [k,l]}<option value={k}>{l}</option>{/each}</select>
     </label>
   </div>
   {#if logKind==='food'}
     <label class="nutrition-check"><input type="checkbox" bind:checked={logConsume}/>Potroši iz inventara prema FEFO redoslijedu</label>
   {/if} {#if selectedPortion}
   <p class="quiet">Raspoloživo {fmt(selectedPortion.quantity,3)} porcija na {date}.
   {#if portionQuantity>0 && portionQuantity<=Number(selectedPortion.quantity)}
     Nakon upisa ostat će {fmt(Number(selectedPortion.quantity)-portionQuantity,3)} porcija.
   {/if}</p>
 {/if}
 {#if logError}<p class="error" role="alert">{logError}</p>{/if}
 <div class="nutrition-actions">
   <button class="btn nutrition-primary" disabled={busy}>Potvrdi unos</button>
   <button class="btn" type="button" disabled={busy} onclick={()=>mealDialog.close()}>Odustani</button>
 </div></form>
 </dialog>
</div>
