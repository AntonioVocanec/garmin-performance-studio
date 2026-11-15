import { requestJson } from './api';
export interface Range {start:string;end:string}
export interface HealthCoverage {label:string;unit:string;source:string;days:number;expectedDays:number;fetchedDays:number;availableStart:string|null;availableEnd:string|null;missingDates:string[];stale:boolean}
export interface HealthHistory {ok:true;start:string;end:string;rows:Record<string,unknown>[];coverage:Record<string,HealthCoverage>}
export const shift=(day:string,offset:number):string=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
export const selectedDate=():string=>(document.getElementById('date') as HTMLInputElement).value;
export const numberText=(v:unknown,places=1):string=>v==null?'—':Number(v).toLocaleString('hr-HR',{maximumFractionDigits:places});
export async function analytics<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T>{return requestJson<T>(`/api/analytics${path}`,{signal,...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})}
export const healthHistory=(range:Range,metric:string,signal?:AbortSignal)=>analytics<HealthHistory>(`/health?${new URLSearchParams({...range,metrics:metric})}`,signal);
export interface Contribution {key:string;label:string;value:number|null;unit:string;date:string;source:string;fetchedAt:string|null;sampleDays:number;expectedDays:number;baselineDays:number;baseline:number|null;delta:number|null;note:string;partial:boolean}
export interface RecoveryContributions {date:string;summary:string;signals:Contribution[]}
export let dashboardSnapshot:Record<string,unknown>|null=null;
export function publishDashboard(payload:Record<string,unknown>):void{dashboardSnapshot=payload;window.dispatchEvent(new CustomEvent('analytics:dashboard',{detail:payload}))}
