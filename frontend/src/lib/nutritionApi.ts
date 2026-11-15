import { requestJson } from './api';
export type Nutrients = Record<'kcal'|'protein'|'carbs'|'fat'|'fiber', string|null>;
export interface CookingPreview {
 portions:string;feasible:boolean;previewToken:string;nutrients:Nutrients;cost:string|null;massPerPortion:string|null;
 ingredients:{position:number;name:string;quantity:string;unit:string}[];
 missing:{name:string;quantity:string;unit:string}[];
 issues:{code:string;message:string}[];warnings:string[];
}
export interface NutritionData {schemaVersion?:number;basis?:string;carbDefinition?:string;energyMethod?:string;originalValues?:{nutrientId:string;value:string|null;unit:string;name?:string}[]}
export interface NutritionComparison {comparableNutrients?:Nutrients;carbComparison?:string}
export const comparisonNutrients=(value:{nutrients:Nutrients}&NutritionComparison):Nutrients=>value.comparableNutrients??{...value.nutrients,carbs:null};
export const carbExplanation=(status?:string):string=>status==='exact'?'UH prema potvrđenoj EU definiciji':status==='estimated'?'UH su procjena nakon oduzimanja potvrđenih vlakana; mogu odstupati od EU deklaracije.':'Usporedba UH s ciljem nije dostupna jer definicija ili podaci nisu potvrđeni.';
export interface Food extends NutritionComparison {nutritionData?:NutritionData;id:string;name:string;state:string;unit:string;version:number;gramsPerUnit:string|null;minimumQuantity:string;nutrients:Nutrients;source:string;sourceId:string|null;retrievedAt?:string|null;allergens:string[];allergensKnown:boolean;dietaryTags:string[];micronutrients?:Record<string,{value:string;unit:string}>}
export interface Recipe extends NutritionComparison {perPortionComparable?:Nutrients;id:string;versionId:string;version:number;name:string;portions:string;minutes:number;method:string;category:string;ingredients:{foodId:string;quantity:string;optional:boolean}[];steps:string[];tags:string[];nutrients:Nutrients;perPortion:Nutrients;cost:string|null;costPerPortion:string|null;nutritionComplete:boolean;priceSources?:{foodId:string;name:string;date:string}[]}
export interface Lot {availableQuantity?:string;expiredQuantity?:string;receivedOn?:string|null;dateKnown?:boolean;id:string;food_id:string|null;batch_id:string|null;name:string;quantity:string;unit:string;location:string;expires_on:string|null;version:number}
export interface Entry {id:string;name:string;quantity:string;unit:string;meal:string;nutrients:Nutrients;operation_id:string}
export interface Diary extends NutritionComparison {date:string;entries:Entry[];nutrients:Nutrients;complete:boolean;targets:Record<string,string|null>}
export interface Profile {version:number;calories?:string|null;protein?:string|null;carbs?:string|null;fat?:string|null;restrictions?:string[];allergens?:string[];excludedFoods?:string[];methods?:string[];preferFrozen?:boolean;mealsPerDay?:number|null;prepDays?:number|null;prepPortions?:number|null;sportsRules?:{trainingLabel:string;durationMinutes:number;extraCalories:string;extraCarbs:string}[];aiDailyRequests?:number;aiDailyTokens?:number}
export interface PlanEntry {id:string;entry_date:string;meal:string;name:string;recipe_version_id:string;portions:string;status:string;version:number;nutrients:Nutrients}
export interface ShoppingItem {id:string;food_id:string;name:string;unit:string;quantity:string;required:string;packageSize:string|null;checked:boolean;received:boolean;version:number}
export interface Shopping {id:string;name:string;items:ShoppingItem[]}
export interface Energy {status:string;date:string;source:string;fetchedAt:string|null;activeCalories:number|null;restingCalories:number|null;totalCalories:number|null;localEstimate:number|null;provisional:boolean;history?:{date:string;totalCalories:number|null}[];nextRun?:{title?:string;date?:string;distanceKm?:number;durationMinSeconds?:number}|null}
export interface Overview {diary:Diary;profile:Profile;meals:PlanEntry[];portions:Lot[];alerts:Lot[];lowStock:Food[]}
const pending = new Map<string,string>();
const decimalKeys=new Set(['quantity','kcal','protein','carbs','fat','fiber','calories','portions','gramsPerUnit','minimumQuantity','cost','packageSize','cookedMass','extraCalories','extraCarbs','value']);
function normalizeDecimals(value:unknown,key=''):unknown {if(typeof value==='string'&&decimalKeys.has(key)&&/^\d+,\d+$/.test(value.trim()))return value.trim().replace(',','.');if(Array.isArray(value))return value.map(v=>normalizeDecimals(v));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeDecimals(v,k)]));return value}
export async function nutritionApi<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
  body=normalizeDecimals(body);
  const fingerprint=method+path+JSON.stringify(body),write=method==='POST';
  let key=pending.get(fingerprint);if(write&&!key){key=crypto.randomUUID();pending.set(fingerprint,key)}
  try{const result=await requestJson<{ok:true;data:T}>(`/api/nutrition${path}`,{method,signal,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});pending.delete(fingerprint);return result.data}catch(error){throw error}
}
export const fmt=(value:unknown,digits=1):string=>value===null||value===undefined||value===''?'—':Number(value).toLocaleString('hr-HR',{maximumFractionDigits:digits});
export const mealLabels:Record<string,string>={breakfast:'Doručak',lunch:'Ručak',dinner:'Večera',snack:'Užine'};
export const locationLabels:Record<string,string>={pantry:'Smočnica',fridge:'Hladnjak',freezer:'Zamrzivač'};
