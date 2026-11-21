// @ts-nocheck -- legacy DOM renderer; API access and validation live in typed api.ts.
import { analyzeBloodLabPdfs, correctBloodLabResult, deleteBloodLabReport, deleteLifeEvent, getActivityDetails, getBloodLabReports, getDashboard, getEcgDetail, getGarminProfile, getJournal, getSkinTemperature, saveActivityRpe, saveBloodLabReport, saveJournal, saveLifeEvent } from "../lib/api";
import {publishDashboard} from '../lib/analyticsApi';

let chartModulePromise;
const chartModule=()=>chartModulePromise??=(import("../lib/charts"));
const disposeChartsInside=container=>{void chartModule().then(module=>module.disposeChartsInside(container))};
const renderLineChart=(...args)=>{void chartModule().then(module=>module.renderLineChart(...args))};
const renderIntradayLineChart=(...args)=>{void chartModule().then(module=>module.renderIntradayLineChart(...args))};
const renderPairLineChart=(...args)=>{void chartModule().then(module=>module.renderPairLineChart(...args))};
const renderTimelineSeriesChart=(...args)=>{void chartModule().then(module=>module.renderTimelineSeriesChart(...args))};
const renderCorrelationScatter=(...args)=>{void chartModule().then(module=>module.renderCorrelationScatter(...args))};
const renderWeeklyVolume=(...args)=>{void chartModule().then(module=>module.renderWeeklyVolume(...args))};
const renderHeartRateZoneComparison=(...args)=>{void chartModule().then(module=>module.renderHeartRateZoneComparison(...args))};

export function startLegacyDashboard() {
const $=id=>document.getElementById(id), dateInput=$("date");
  const chartColors={cyan:"#69d7ef",blue:"#78bce8",sky:"#8eb0ee",violet:"#b9a2fa",plum:"#c79be8",slate:"#91aebb",teal:"#5bb6d0"};
  const zagrebToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zagreb",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  dateInput.value=zagrebToday();
  const escapeHtml=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const num=(v,d=0)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("hr-HR",{minimumFractionDigits:0,maximumFractionDigits:d});
  const baselineReference=(metric,divisor=1,precision=0,unit="")=>{
    const median=metric?.median28d==null?null:Number(metric.median28d),samples=Number(metric?.sampleDays);
    if(median==null||!Number.isFinite(median)||!Number.isFinite(samples)||samples<7)return null;
    const value=median/divisor,formatted=`${num(value,precision)}${unit}`;
    return {value,label:`Medijan · ${formatted}`,context:`medijan prethodnih 28 dana · ${num(samples)}/28 mjerenja`,color:chartColors.slate};
  };
  const changeIcon=value=>{const direction=value==null||value===0?"flat":value>0?"up":"down",path=direction==="up"?'<path d="M3 11 7 7l3 3 4-5"/><path d="M10 5h4v4"/>':direction==="down"?'<path d="m3 5 4 4 3-3 4 5"/><path d="M10 11h4V7"/>':'<path d="M3 8h10"/><path d="m10 5 3 3-3 3"/>';return `<svg class="change-icon" data-direction="${direction}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`};
  const changeMarkup=(value,label)=>`<span class="change-inline">${changeIcon(value)}<span>${escapeHtml(label)}</span></span>`;
  const duration=(s,withSeconds=false)=>{if(s==null||!Number.isFinite(Number(s)))return"—";s=Math.max(0,Math.round(Number(s)));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;if(withSeconds)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;return h?`${h} h ${String(m).padStart(2,"0")} min`:`${m} min`};
  const pace=s=>s==null||!Number.isFinite(Number(s))?"—":`${Math.floor(Math.round(s)/60)}:${String(Math.round(s)%60).padStart(2,"0")}/km`;
  const fmtDate=v=>{if(!v)return"—";const d=new Date(v.length===10?`${v}T12:00:00`:v);return Number.isNaN(d.valueOf())?String(v):d.toLocaleDateString("hr-HR",{weekday:undefined,day:"2-digit",month:"short"})};
  const fmtDateTime=v=>{if(!v)return"Vrijeme nije navedeno";const d=new Date(v);return Number.isNaN(d.valueOf())?"Vrijeme nije navedeno":d.toLocaleTimeString("hr-HR",{hour:"2-digit",minute:"2-digit"})};
  const fmtIsoDay=v=>{if(!v)return"—";const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.valueOf())?String(v):d.toLocaleDateString("hr-HR",{weekday:"short",day:"2-digit",month:"2-digit"})};
  const fmtIsoYearDay=v=>{if(!v)return"—";const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.valueOf())?String(v):d.toLocaleDateString("hr-HR",{day:"2-digit",month:"2-digit",year:"numeric"})};
  const humanType=v=>({running:"Trčanje",trail_running:"Trail trčanje",treadmill_running:"Traka",track_running:"Atletska staza",cycling:"Biciklizam",indoor_cycling:"Sobni bicikl",indoor_cardio:"Indoor cardio",walking:"Hodanje",hiking:"Planinarenje",strength_training:"Snaga"}[String(v||"").toLowerCase()]||String(v||"Aktivnost").replaceAll("_"," "));
  const componentLabels={vigorousDaysAvg:"Intenzivni dani / tjedan",vigorousMinutesAvg:"Intenzivne minute / tjedan",rhr:"Resting heart rate",bmi:"BMI komponenta"};
  const garminTrainingStatusLabels={PRODUCTIVE:"Produktivan",MAINTAINING:"Održavanje forme",RECOVERING:"Oporavak",STRAINED:"Opterećen",UNPRODUCTIVE:"Neproduktivan",DETRAINING:"Pad forme",OVERREACHING:"Preopterećenje",PEAKING:"Vrhunska forma"};
  const garminAcwrStatusLabels={OPTIMAL:"Optimalno",LOW:"Nisko",HIGH:"Povišeno",VERY_LOW:"Nisko",VERY_HIGH:"Povišeno"};
  const garminLoadFocusLabels={AEROBIC_HIGH_SHORTAGE:"Manjak visokog aerobnog opterećenja",AEROBIC_LOW_SHORTAGE:"Manjak niskog aerobnog opterećenja",ANAEROBIC_SHORTAGE:"Manjak anaerobnog opterećenja",BALANCED:"Raspodjela opterećenja uravnotežena"};
  const snapshotIcon=name=>({sleep:'<svg viewBox="0 0 24 24"><path d="M20.8 13A8.5 8.5 0 0 1 11 3.2 8.5 8.5 0 1 0 20.8 13Z"/></svg>',recovery:'<svg viewBox="0 0 24 24"><path d="M3 12h3l2.2-6 4 12 2.3-6H21"/></svg>',training:'<svg viewBox="0 0 24 24"><path d="M4 19V5m0 14h16M8 15l4-5 3 3 5-7"/><path d="M16 6h4v4"/></svg>'}[name]||"");
  const isoShift=(value,days)=>{const date=new Date(`${String(value||"").slice(0,10)}T12:00:00Z`);if(Number.isNaN(date.valueOf()))return"";date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};
  let selectedHistoryWindow="auto",activeHistoryRange=null;
  const historyWindowSummary=$("history-window-summary"),historyWindowError=$("history-window-error"),historyCustomForm=$("history-custom-range"),historyRangeStart=$("history-range-start"),historyRangeEnd=$("history-range-end");
  const historyWindowButtons=Array.from(document.querySelectorAll("[data-history-window]"));
  const presetHistoryRange=days=>({start:isoShift(dateInput.value,-(Number(days)-1)),end:dateInput.value});
  const historyRangeText=range=>{
    const format=value=>new Date(`${value}T12:00:00`).toLocaleDateString("hr-HR",{day:"2-digit",month:"2-digit",year:"numeric"});
    return `${format(range.start)} – ${format(range.end)}`;
  };
  const syncHistoryWindowControls=()=>{
    historyWindowButtons.forEach(button=>{
      const selected=button.dataset.historyWindow===selectedHistoryWindow;
      button.setAttribute("aria-pressed",String(selected));
      if(button.dataset.historyWindow==="custom")button.setAttribute("aria-expanded",String(!historyCustomForm.hidden));
    });
    if(selectedHistoryWindow==="auto")historyWindowSummary.textContent="Svaki graf koristi svoj zadani povijesni prozor.";
    else historyWindowSummary.textContent=`Trendovi filtrirani: ${historyRangeText(activeHistoryRange)} · prikazuju se samo zapisi dostupni pojedinom izvoru.`;
    historyRangeStart.max=dateInput.value;historyRangeEnd.max=dateInput.value;
  };
  const applyHistoryWindow=(mode,range=null)=>{
    selectedHistoryWindow=mode;activeHistoryRange=range;
    window.dispatchEvent(new CustomEvent('analytics:range',{detail:range}));
    historyWindowError.textContent="";
    void chartModule().then(module=>module.setChartDateRange(range?.start||null,range?.end||null));
    syncHistoryWindowControls();
  };
  const openCustomHistoryRange=()=>{
    const draft=activeHistoryRange||presetHistoryRange(28);
    historyRangeStart.value=draft.start;historyRangeEnd.value=draft.end;
    historyCustomForm.hidden=false;syncHistoryWindowControls();historyRangeStart.focus();
  };
let calendarDaysByDate=new Map(),calendarActivitiesById=new Map(),selectedCalendarDate=null;
let latestSkinTemperature=null,latestGarminProfile=null,lastDashboardPayload=null,latestJournalHistory=[];
let ecgSelectionController=null,selectedEcgId=null,ecgReadingsById=new Map(),ecgDetailsById=new Map();
  const averageInRange=(rows,key,start,end)=>{const values=(rows||[]).filter(row=>String(row?.date||"").slice(0,10)>=start&&String(row?.date||"").slice(0,10)<=end).map(row=>row?.[key]==null?NaN:Number(row[key])).filter(Number.isFinite);return{value:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,count:values.length}};
  const renderHealthOverview=payload=>{
    const n=payload.normalized||{},sleep=n.sleep||{},debt=n.sleepDebt||{},recovery=n.recovery||{},summary=n.dailySummary||{},baseline=n.personalRecoveryBaseline||{},trends=n.recoveryTrends||[],end=String(payload.date||"").slice(0,10);
    const score=sleep.score==null||sleep.score===""?null:Number(sleep.score),sleepValid=score!=null&&Number.isFinite(score),scoreLabel=!sleepValid?"Nema Sleep Score":score>=90?"Izvrsno":score>=80?"Dobro":score>=60?"Zadovoljavajuće":"Nisko",sleepTone=!sleepValid?"empty":score>=80?"good":score>=60?"watch":"low";
    const hrv=baseline.hrv||{},rhr=baseline.restingHeartRate||{},hrvDelta=hrv.delta==null?null:Number.isFinite(Number(hrv.delta))?Number(hrv.delta):null,rhrDelta=rhr.delta==null?null:Number.isFinite(Number(rhr.delta))?Number(rhr.delta):null,hrvRatio=hrv.current!=null&&Number(hrv.median28d)>0?Number(hrv.current)/Number(hrv.median28d):null,hrvClearlyBelow=hrvRatio!=null&&hrvRatio<0.9,hrvNearBase=hrvRatio!=null&&Math.abs(hrvRatio-1)<=0.1,rhrNearBase=rhrDelta!=null&&Math.abs(rhrDelta)<=3;
    const rawHrvStatus=String(recovery.hrvStatus||"").trim(),hrvStatusKey=rawHrvStatus.toLowerCase(),hrvStatusLabel=({balanced:"U ravnoteži",unbalanced:"Izvan ravnoteže",low:"Nizak",poor:"Nizak",strained:"Opterećen",unbalanced_low:"Nizak"})[hrvStatusKey]||rawHrvStatus||"Nema HRV statusa",recoveryTone=/unbalanced|low|poor|strained/.test(hrvStatusKey)?"watch":/balanced|optimal|good/.test(hrvStatusKey)?"good":"neutral";
    const dailySource=payload.sources?.dailySummaries;
    const movementAvailable=(recovery.steps??summary.steps)!=null||(
      dailySource?.ok===true&&!dailySource.partial&&(recovery.moderateMinutes7d!=null||recovery.vigorousMinutes7d!=null)
    );
    const coverage=[sleep.totalSeconds!=null||sleepValid,recovery.bodyBattery!=null||recovery.hrvLastNight!=null||recovery.restingHeartRate!=null,movementAvailable].filter(Boolean).length;
    $("health-overview-title").textContent="Tjedne usporedbe i osobni uvid";
    $("health-overview-summary").textContent=`${fmtIsoDay(end)} · zadnjih 7 dana prema prethodnih 7`;
    $("health-overview-coverage").textContent=`${coverage}/3`;
    const battery=recovery.bodyBattery==null?null:Number(recovery.bodyBattery),batteryRing=$("today-energy-ring"),batteryHistory=recovery.bodyBatteryHistory||{};
    $("today-energy").textContent=battery==null||!Number.isFinite(battery)?"—":num(battery,0);
    batteryRing.style.setProperty("--battery-angle",`${battery==null||!Number.isFinite(battery)?0:Math.max(0,Math.min(100,battery))*3.6}deg`);
    batteryRing.setAttribute("aria-label",battery==null||!Number.isFinite(battery)?"Body Battery nije dostupna":`Garmin Body Battery ${num(battery,0)} od 100`);
    $("today-energy-note").textContent=battery==null?"Garmin nije vratio Body Battery za ovaj dan.":batteryHistory.date===end&&batteryHistory.latestTime?`Zadnji uzorak · ${batteryHistory.latestTime}`:"Garmin · zadnji dostupni zapis";
    const training=n.garminTraining||{},trainingStatus=training.trainingStatus||null,trainingFeedback=String(trainingStatus?.feedback||"").split("_")[0].toUpperCase(),trainingLabel=trainingStatus?garminTrainingStatusLabels[trainingFeedback]||trainingFeedback.replaceAll("_"," "):"Nije dostupan",trainingFocus=training.loadFocus||null,focusCode=String(trainingFocus?.feedback||"").toUpperCase(),acwrCode=String(trainingStatus?.acwrStatus||"").toUpperCase();
    $("today-training-status").textContent=trainingLabel;
    $("today-training-status").dataset.tone=/PRODUCTIVE|PEAKING/.test(trainingFeedback)?"good":/STRAINED|UNPRODUCTIVE|DETRAINING|OVERREACHING/.test(trainingFeedback)?"watch":"neutral";
    $("today-training-context").textContent=trainingStatus?`Garminov akutni load ${num(trainingStatus.acuteLoad,0)} · kronični ${num(trainingStatus.chronicLoad,0)}.`:"Garmin Training Status nije dostupan za odabrani dan.";
    $("today-acwr").textContent=trainingStatus?.loadRatio==null?"—":`${num(trainingStatus.loadRatio,2)} · ${garminAcwrStatusLabels[acwrCode]||"Garmin status"}`;
    $("today-load-focus").textContent=trainingFocus?garminLoadFocusLabels[focusCode]||focusCode.replaceAll("_"," "):"Nije dostupan";
    const sleepBaseline=baseline.sleep||{},sleepMedian=sleepBaseline.median28d==null?null:Number(sleepBaseline.median28d),sleepDelta=sleepBaseline.delta==null?null:Number(sleepBaseline.delta),sleepSamples=Number(sleepBaseline.sampleDays)||0;
    $("today-sleep-duration").textContent=sleep.totalSeconds==null?"—":duration(sleep.totalSeconds);
    $("today-sleep-context").textContent=sleepValid?`Sleep Score ${num(score,0)}/100 · ${scoreLabel}`:"Sleep Score nije dostupan";
    $("today-sleep-bar").style.width=sleepValid?`${Math.max(0,Math.min(100,score))}%`:"0%";
    $("today-sleep-bar").dataset.tone=sleepTone;
    const sleepDeltaLabel=sleepDelta==null||sleepMedian==null?"Osobni medijan nije dostupan":`${sleepDelta>=0?"+":"−"}${duration(Math.abs(sleepDelta))} prema medijanu ${duration(sleepMedian)} · ${num(sleepSamples)}/28 noći`;
    $("today-sleep-context").title=sleepDeltaLabel;
    $("today-sleep-baseline").textContent=sleepDeltaLabel;
    const hrvCurrent=recovery.hrvLastNight,hrvMedian=hrv.median28d==null?null:Number(hrv.median28d);
    const displayedHrvDelta=hrvDelta??(hrvCurrent!=null&&hrvMedian!=null?Number(hrvCurrent)-hrvMedian:null);
    $("today-hrv").textContent=hrvCurrent==null?"—":`${num(hrvCurrent,0)} ms`;
    $("today-hrv-context").textContent=hrvCurrent==null?"HRV nije zabilježen":hrvMedian==null?"Osobni medijan nije dostupan":`${displayedHrvDelta>=0?"+":"−"}${num(Math.abs(displayedHrvDelta),1)} ms prema medijanu ${num(hrvMedian,1)} ms · ${num(hrv.sampleDays)}/28 noći`;
    $("today-hrv-status").textContent=hrvStatusLabel;
    $("today-hrv-status").dataset.tone=recoveryTone;
    const resting=recovery.restingHeartRate;
    $("today-rhr").textContent=resting==null?"—":`${num(resting,0)} bpm`;
    const restingContext=rhr.median28d==null
      ? "Osobni medijan nije dostupan"
      : `Medijan ${num(rhr.median28d,1)} bpm · ${num(rhr.sampleDays)}/28 dana`;
    const restingChange=rhrDelta==null?"":`${rhrDelta>0?"+":rhrDelta<0?"−":""}${num(Math.abs(rhrDelta),1)} bpm prema bazi · `;
    $("today-rhr-context").textContent=resting==null?"Puls u mirovanju nije zabilježen":restingChange+restingContext;
    let insightTitle="Signali su prikazani uz tvoju osobnu bazu",insightCopy="Uspoređuj više dana zajedno; jedna vrijednost sama ne određuje oporavak ni spremnost za trening.";
    if(debt.debtSeconds!=null&&Number(debt.debtSeconds)>0){insightTitle=`Sleep debt · ${duration(debt.debtSeconds)} u dostupnom prozoru`;insightCopy=`Prosjek sna zadnjih 7 dana: ${debt.average7dSeconds==null?"—":duration(debt.average7dSeconds)}. U izračun je uključeno ${num(debt.daysAvailable)}/${num(debt.daysExpected||14)} zabilježenih noći.`}
    else if(sleepValid&&score<60){insightTitle=`Garmin je ocijenio san s ${num(score)}/100`;insightCopy="Pogledaj trajanje sna, prethodni sleep debt i osobni trend prije zaključka o tome kako se osjećaš."}
    else if(hrvClearlyBelow||rhrDelta!=null&&rhrDelta>3){const parts=[];if(hrvClearlyBelow&&hrv.median28d!=null)parts.push(`HRV ${num(Math.abs(Number(hrv.current)-Number(hrv.median28d)))} ms ispod medijana`);if(rhrDelta!=null&&rhrDelta>3&&rhr.median28d!=null)parts.push(`Puls u mirovanju ${num(rhrDelta)} bpm iznad medijana`);insightTitle="Oporavak odstupa od dijela osobne baze";insightCopy=`${parts.join(" · ")||"Provjeri HRV status"}. Usporedi ove signale sa snom, opterećenjem i subjektivnim check-inom.`}
    else if(hrvNearBase&&rhrNearBase){insightTitle="Oporavak je blizu nedavne osobne baze";insightCopy=`HRV ${hrvDelta>=0?"iznad":"ispod"} medijana za ${num(Math.abs(hrvDelta))} ms · puls u mirovanju ${rhrDelta>=0?"iznad":"ispod"} medijana za ${num(Math.abs(rhrDelta))} bpm. To je kontekst, ne ocjena spremnosti.`}
    $("health-insight-title").textContent=insightTitle;
    $("health-insight-copy").textContent=insightCopy.split(/(?<=\.)\s+/u)[0];
    $("today-interpretation").textContent=insightTitle;
    $("today-interpretation").title=insightCopy;
    $("hero-executive-copy").textContent=insightCopy;

    const recentStart=isoShift(end,-6),previousEnd=isoShift(end,-7),previousStart=isoShift(end,-13);
    const compare=(rows,key,formatter,unit="",target="sleep-recovery")=>{
      const recent=averageInRange(rows,key,recentStart,end),previous=averageInRange(rows,key,previousStart,previousEnd);
      const delta=recent.value==null||previous.value==null?null:recent.value-previous.value;
      const change=delta==null?"Nedovoljno podataka":changeMarkup(delta,`${delta>0?"+":delta<0?"−":""}${formatter(Math.abs(delta))}${unit}`);
      const valueText=value=>value==null?"—":formatter(value)+unit;
      return `<a class="health-trend" href="#${target}"><span>${escapeHtml(formatter.label)}</span><b>${valueText(recent.value)} <small>· ${valueText(previous.value)}</small></b><small>${change}</small><em>${recent.count}/7 sada · ${previous.count}/7 prije</em></a>`;
    };
    const hoursFormatter=value=>duration(value);hoursFormatter.label="Trajanje sna";
    const numberFormatter=value=>num(value,0);numberFormatter.label="HRV";
    const rhrFormatter=value=>num(value,0);rhrFormatter.label="Puls u mirovanju";
    const batteryFormatter=value=>num(value,0);batteryFormatter.label="Body Battery";
    const sleepRows=(sleep.history||[]).map(row=>({date:row.date,value:row.totalSeconds}));
    $("health-weekly-range").textContent=`${fmtIsoDay(recentStart)}–${fmtIsoDay(end)}`;
    $("health-weekly-trends").innerHTML=[compare(sleepRows,"value",hoursFormatter),compare(trends,"hrv",numberFormatter," ms","lab-recovery-panel-baseline"),compare(trends,"restingHeartRate",rhrFormatter," bpm","lab-recovery-panel-baseline"),compare(trends,"bodyBattery",batteryFormatter,"","body-battery-day")].join("");
  };
  let skinTemperatureController=null;
  const skinDeviation=value=>value==null||!Number.isFinite(Number(value))?"—":`${Number(value)>0?"+":Number(value)<0?"−":""}${num(Math.abs(Number(value)),1)} °C`;
  const loadSkinTemperature=async(target,forceRefresh=false)=>{
    skinTemperatureController?.abort();
    latestSkinTemperature=null;
    const controller=new AbortController();skinTemperatureController=controller;
    const chart=$("skin-temperature-chart");
    $("skin-temperature-date").textContent=fmtIsoDay(target);
    $("skin-temperature-date").removeAttribute("title");
    $("skin-temperature-period").textContent="—";
    $("skin-temperature-current").textContent="—";$("skin-temperature-median").textContent="—";$("skin-temperature-coverage").textContent="—";
    $("skin-temperature-current-note").textContent="Dohvaćam Garminov zapis…";
    $("skin-temperature-calibration").textContent="Dohvaćam podatke o osobnoj Garminovoj bazi…";
    chart.innerHTML='<div class="loading">Učitavam Garminovu povijest temperature kože…</div>';
    try{
      const result=await getSkinTemperature(target,forceRefresh,controller.signal);
      if(controller.signal.aborted||dateInput.value!==target)return;
      const data=result.data||{},history=data.history||[],available=Number(data.nightsAvailable)||0,current=data.currentDeviationC;
      latestSkinTemperature=data;
      renderCorrelationEngine();
      $("skin-temperature-period").textContent=`${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`;
      $("skin-temperature-current").textContent=skinDeviation(current);
      $("skin-temperature-current-note").textContent=current==null?"Nema noćnog mjerenja za odabrani datum.":`${fmtIsoDay(target)} · noćni zapis`;
      $("skin-temperature-median").textContent=skinDeviation(data.medianDeviationC);
      $("skin-temperature-coverage").textContent=`${available}/${Number(data.nightsExpected)||28}`;
      $("skin-temperature-date").textContent=result.partial?"Dio noći nedostaje":current==null?"Nema zapisa za noć":"Garmin Connect";
      const calibrationDays=data.calibrationDays;
      $("skin-temperature-calibration").textContent=calibrationDays==null
        ?"Garmin nije vratio trajanje uspostave osobne baze."
        :data.calibrationStatus==="establishing"
          ?`Garmin još uspostavlja osobnu bazu · ${num(calibrationDays)} dana.`
          :`Osobna Garminova baza · ${num(calibrationDays)} dana.`;
      if(result.message)$("skin-temperature-date").title=result.message;
      const charts=await chartModule();
      if(controller.signal.aborted||dateInput.value!==target)return;
      charts.disposeChartsInside(chart);
      if(available>=2){
        charts.renderLineChart("skin-temperature-chart",history,"deviationC",{
          color:"#f2a98b",height:170,unit:" °C",referenceLine:{value:0},dateKey:"date",
          formatValue:value=>`${value>0?"+":value<0?"−":""}${num(Math.abs(value),1)}`,
          ariaLabel:"Garminovo noćno odstupanje temperature kože od osobne baze tijekom 28 noći",sourceLabel:"Garmin Connect",
        },"Odstupanje od osobne baze");
      }else{
        chart.innerHTML=`<div class="empty-chart">${available===1?"Zabilježena je jedna noć; za trend su potrebna barem dva mjerenja.":"Garmin nije vratio noćna mjerenja temperature kože za ovo razdoblje."}</div>`;
      }
      refreshPersonalContext();
      renderCorrelationEngine();
    }catch(error){
      if(error.name==="AbortError"||controller.signal.aborted)return;
      if(dateInput.value!==target)return;
      $("skin-temperature-date").textContent="Nedostupno";
      $("skin-temperature-current-note").textContent=error.message||"Garmin Connect nije dostupan.";
      $("skin-temperature-calibration").textContent="Provjeri lokalnu Garmin Connect sesiju i pokušaj ponovno osvježiti podatke.";
      chart.innerHTML=`<div class="empty-chart">${escapeHtml(error.message||"Garminova povijest temperature kože nije dostupna.")}</div>`;
    }
  };
  const raceTime=seconds=>{
    if(seconds==null||!Number.isFinite(Number(seconds)))return"—";
    const value=Math.max(0,Math.round(Number(seconds))),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),remaining=value%60;
    return hours?`${hours}:${String(minutes).padStart(2,"0")}:${String(remaining).padStart(2,"0")}`:`${minutes}:${String(remaining).padStart(2,"0")}`;
  };
  const economyClass=value=>({ELITE:"Elitno",SUPERIOR:"Izvrsno utrenirano",EXPERT:"Vrlo utrenirano",WELL_TRAINED:"Dobro utrenirano",TRAINED:"Utrenirano",INTERMEDIATE:"Srednje utrenirano",UNTRAINED:"Početno"}[String(value||"").toUpperCase()]||String(value||"Nema klasifikacije").replaceAll("_"," "));
  const rhythmLabel=value=>({SINUS_NORMAL:"Sinusni ritam",AFIB_POSSIBLE:"Moguća fibrilacija atrija · Garmin klasifikacija",UNCLASSIFIED:"Neodređen zapis",INCONCLUSIVE:"Neodređen zapis",NOISE:"Smetnje u zapisu",HIGH_HR:"Puls izvan klasifikacijskog raspona",LOW_HR:"Puls izvan klasifikacijskog raspona"})[String(value||"").toUpperCase()]||String(value||"Nema klasifikacije").replaceAll("_"," ");
  const renderEcgReadingList=()=>{
    const readings=[...ecgReadingsById.values()];
    $("ecg-readings").innerHTML=readings.length?readings.map(row=>{
      const id=String(row.id),selected=id===selectedEcgId,metrics=[row.heartRateAverage==null?null:`HR ${num(row.heartRateAverage)} bpm`,row.rmssdHrv==null?null:`RMSSD ${num(row.rmssdHrv)} ms`].filter(Boolean).join(" · ");
      return `<button type="button" class="ecg-reading-row" data-ecg-reading-id="${escapeHtml(id)}" aria-pressed="${selected}" aria-label="Prikaži ECG očitanje ${escapeHtml(fmtIsoDay(row.date))} · ${escapeHtml(rhythmLabel(row.rhythmClassification))}"><span class="ecg-reading-date"><b>${escapeHtml(fmtIsoDay(row.date))}</b><small>${escapeHtml(fmtDateTime(row.localTime))}</small></span><span class="ecg-reading-summary"><b>${escapeHtml(rhythmLabel(row.rhythmClassification))}</b><small>${escapeHtml(metrics||"Sažetak nije dostupan")}</small></span><span class="ecg-reading-action">${selected?"Odabrano":"Prikaži"}</span></button>`;
    }).join(""):'<div class="empty-chart">Nema Garmin ECG očitanja za dostupno razdoblje.</div>';
  };
  const renderEcgSignal=(reading,waveform,loading=false,message=null)=>{
    const id=String(reading?.id||selectedEcgId||"");
    $("ecg-rhythm").textContent=reading?rhythmLabel(reading.rhythmClassification):"Nema ECG zapisa";
    $("ecg-date").textContent=reading?`${fmtIsoDay(reading.date)} · ${fmtDateTime(reading.localTime)}`:"Garmin nije vratio ECG očitanja.";
    $("ecg-heart-rate").textContent=reading?.heartRateAverage==null?"—":`${num(reading.heartRateAverage)} bpm`;
    $("ecg-hrv").textContent=reading?.rmssdHrv==null?"—":`${num(reading.rmssdHrv)} ms`;
    const chart=$("ecg-waveform-chart");disposeChartsInside(chart);
    if(loading){$("ecg-sample-count").textContent="Učitavam signal…";chart.innerHTML='<div class="loading">Dohvaćam detalje odabranog ECG zapisa…</div>';return}
    if(waveform?.samples?.length>=2&&Number(waveform.sampleRate)>0){
      $("ecg-sample-count").textContent=`${num(waveform.durationSeconds,0)} s · ${num(waveform.sampleCount)} uzoraka`;
      void chartModule().then(charts=>{if(selectedEcgId===id)charts.renderEcgWaveform("ecg-waveform-chart",waveform.samples,waveform.sampleRate,waveform.sampleStride,waveform.durationSeconds,`Garmin ECG signal od ${fmtIsoDay(reading.date)}; sirovi zapis bez dijagnostičke interpretacije`)});
    }else{
      $("ecg-sample-count").textContent="Signal nije dostupan";
      chart.innerHTML=`<div class="empty-chart">${escapeHtml(message||"Za ovo očitanje Garmin nije vratio detaljni signal.")}</div>`;
    }
  };
  const selectEcgReading=async id=>{
    id=String(id||"");const reading=ecgReadingsById.get(id);if(!reading)return;
    ecgSelectionController?.abort();const controller=new AbortController();ecgSelectionController=controller;selectedEcgId=id;renderEcgReadingList();
    const cached=ecgDetailsById.get(id);if(cached){renderEcgSignal(cached.reading||reading,cached.waveform);return}
    renderEcgSignal(reading,null,true);
    try{
      const result=await getEcgDetail(id,false,controller.signal);
      if(controller.signal.aborted||selectedEcgId!==id)return;
      ecgDetailsById.set(id,result.data||{});renderEcgSignal(result.data?.reading||reading,result.data?.waveform||null);
    }catch(error){
      if(error.name==="AbortError"||controller.signal.aborted||selectedEcgId!==id)return;
      renderEcgSignal(reading,null,false,error.message||"Nije moguće učitati signal ovog očitanja.");
    }
  };
  const renderGarminProfile=data=>{
    const gear=data.gear||{},items=Array.isArray(gear.items)?gear.items:[],active=items.filter(item=>String(item.status).toLowerCase()==="active"),retired=items.filter(item=>String(item.status).toLowerCase()!=="active"),overLimit=active.filter(item=>Number(item.usagePercent)>=100).length;
    const chips=[`<span class="gear-summary-chip">${num(gear.activeCount??active.length)} aktivnih komada</span>`,`<span class="gear-summary-chip">${num(gear.retiredCount??retired.length)} arhivirano</span>`];
    if(overLimit)chips.push(`<span class="gear-summary-chip alert">${num(overLimit)} na ili iznad praga</span>`);
    $("gear-inventory-summary").innerHTML=`<div>${chips.join("")}</div><span class="badge">Garmin Connect</span>`;
    const gearCard=(item,isRetired=false)=>{
      const pct=Number(item.usagePercent),used=item.totalDistanceKm,max=item.maximumDistanceKm,remaining=item.remainingDistanceKm,durationUsed=item.usedDurationSeconds,durationMax=item.maximumDurationSeconds;
      const hasDistance=used!=null&&max!=null,hasDuration=durationUsed!=null&&durationMax!=null,over=Number.isFinite(pct)&&pct>=100;
      const usageText=hasDistance?`${num(used,1)} / ${num(max,0)} km`:hasDuration?`${duration(durationUsed)} / ${duration(durationMax)}`:used!=null?`${num(used,1)} km ukupno`:"Garmin nije zabilježio potrošnju";
      const remainingText=hasDistance?over?`Prag premašen za ${num(Math.max(0,used-max),1)} km`:`Preostalo do praga ${num(remaining,1)} km`:hasDuration?`Preostalo ${duration(item.remainingDurationSeconds)}`:`${num(item.totalActivities)} povezanih aktivnosti`;
      const tags=[item.isDefault?`Zadano · ${(item.defaultSports||[]).map(humanType).join(", ")||"aktivnost"}`:"",item.firstUseDate?`U uporabi od ${fmtDate(item.firstUseDate)}`:"",item.totalActivities!=null?`${num(item.totalActivities)} aktivnosti`:""].filter(Boolean);
      const typeLabel=({SHOES:"Obuća",BIKE:"Bicikl",RACKET:"Reket",OTHER:"Oprema"})[String(item.type||"").toUpperCase()]||String(item.type||"Oprema").replaceAll("_"," ");
      return `<article class="gear-card"><div class="gear-card-top"><div><span class="badge">${escapeHtml(typeLabel)}${isRetired?" · arhivirano":""}</span><h4>${escapeHtml(item.name||"Oprema")}</h4>${item.customName?`<div class="gear-card-sub">${escapeHtml(item.customName)}</div>`:""}</div>${item.usagePercent!=null?`<span class="badge">${num(item.usagePercent,0)}%</span>`:""}</div>${tags.length?`<div class="gear-card-tags">${tags.map(tag=>`<span>${escapeHtml(tag)}</span>`).join("")}</div>`:""}<div class="gear-wear-meta"><span>${hasDistance?"Udaljenost prema Garminovu pragu":"Korištenje"}</span><b>${escapeHtml(usageText)}</b></div>${item.usagePercent!=null?`<div class="gear-usage-track"><i class="${over?"over":""}" style="width:${Math.min(100,Math.max(0,pct))}%"></i></div>`:""}<div class="gear-card-note">${escapeHtml(remainingText)}${item.notes?` · ${escapeHtml(item.notes)}`:""}</div></article>`;
    };
    $("gear-active-list").innerHTML=active.length?active.map(item=>gearCard(item)).join(""):'<div class="empty-chart">Nema aktivne opreme u Garmin Connectu.</div>';
    $("gear-retired-details").hidden=!retired.length;
    $("gear-retired-count").textContent=num(retired.length);
    $("gear-retired-list").innerHTML=retired.map(item=>gearCard(item,true)).join("");

    const race=data.racePredictions||{},predictions=race.predictions||[];
    $("race-predictions-date").textContent=race.date?`Ažurirano ${fmtDate(race.date)}`:"Garmin Connect";
    $("race-predictions-grid").innerHTML=predictions.length?predictions.map(item=>`<div class="race-prediction"><span>${escapeHtml(item.label)}</span><b>${raceTime(item.timeSeconds)}</b><small>Garminova procjena</small></div>`).join(""):'<div class="empty-chart">Garmin Race Predictor nije vratio procjene.</div>';

    const economy=data.runningEconomy||{};
    $("running-economy-score").textContent=economy.score==null?"—":num(economy.score,0);
    $("running-economy-classification").textContent=economyClass(economy.classification);
    $("running-economy-date").textContent=economy.date?fmtDate(economy.date):"Garmin Connect";
    $("running-economy-change").textContent=economy.change90d==null?"—":`${Number(economy.change90d)>0?"+":Number(economy.change90d)<0?"−":""}${num(Math.abs(Number(economy.change90d)),0)} boda`;
    $("running-economy-coverage").textContent=num(economy.sampleDays90d);
    const economyChart=$("running-economy-chart"),economyHistory=economy.history||[];
    disposeChartsInside(economyChart);
    if(economyHistory.filter(row=>row.score!=null).length>=2){
      renderLineChart("running-economy-chart",economyHistory,"score",{color:chartColors.cyan,height:150,dateKey:"date",formatValue:value=>num(value,0),ariaLabel:"Garmin Running Economy score tijekom dostupne povijesti",sourceLabel:"Garmin Connect"},"Garmin Running Economy");
    }else economyChart.innerHTML='<div class="empty-chart">Nema dovoljno Garminovih zapisa za trend.</div>';

    const records=data.personalRecords||[];
    const recordAnnotations=records.flatMap(item=>{
      const date=chartDate(item.date);if(!date)return[];
      const result=item.distanceKm!=null?`${num(item.distanceKm,2)} km`:raceTime(item.timeSeconds);
      return [{id:`record:${item.typeId||item.label}:${date}`,date,kind:"record",title:`Osobni rekord · ${item.label||"trčanje"}`,detail:[result,item.activityName||"Garmin aktivnost"].filter(Boolean).join(" · ")}];
    });
    dashboardChartAnnotations=[...baseChartAnnotations,...recordAnnotations];updateChartAnnotations();
    $("personal-records-count").textContent=`${num(records.length)} prihvaćenih rekorda`;
    $("personal-records-grid").innerHTML=records.length?records.map(item=>`<article class="personal-record"><span>${escapeHtml(item.label)}</span><b>${item.distanceKm!=null?`${num(item.distanceKm,2)} km`:raceTime(item.timeSeconds)}</b><small>${escapeHtml(item.activityName||"Garmin aktivnost")}${item.date?` · ${escapeHtml(fmtDate(item.date))}`:""}</small></article>`).join(""):'<div class="empty-chart">Nema prihvaćenih Garminovih rekorda u trčanju.</div>';

    const body=data.bodyComposition||{},history=body.history||[],latest=body.latest;
    $("weight-latest").textContent=latest?.weightKg==null?"—":`${num(latest.weightKg,1)} kg`;
    $("weight-date").textContent=latest?.date?fmtDate(latest.date):"Garmin Connect";
    $("weight-change").textContent=body.changeKg==null?"":`${Number(body.changeKg)>0?"+":Number(body.changeKg)<0?"−":""}${num(Math.abs(Number(body.changeKg)),1)} kg od prethodnog vaganja`;
    $("weight-context").textContent=latest?`${num(body.sampleCount)} vaganja u dostupnoj povijesti${body.previous?.date?` · prethodno ${fmtDate(body.previous.date)}`:""}`:"Garmin nema spremljena vaganja u ovom razdoblju.";
    const weightChart=$("weight-chart");disposeChartsInside(weightChart);
    if(history.filter(row=>row.weightKg!=null).length>=2)renderLineChart("weight-chart",history,"weightKg",{color:"#69d7ef",unit:" kg",height:150,dateKey:"date",formatValue:value=>num(value,1),ariaLabel:"Garminova spremljena vaganja kroz dostupnu povijest",sourceLabel:"Garmin Connect"},"Tjelesna masa");
    else weightChart.innerHTML=history.length?'<div class="empty-chart">Dostupno je jedno vaganje; trend će se prikazati nakon sljedećeg.</div>':'<div class="empty-chart">Garmin nema vaganja za odabrano razdoblje.</div>';
    $("weight-history").innerHTML=history.length?history.slice(-6).reverse().map(row=>`<div class="weight-history-item"><span>${escapeHtml(fmtDate(row.date))}</span><b>${row.weightKg==null?"—":`${num(row.weightKg,1)} kg`}</b></div>`).join(""):'<div class="quiet">Nema dodatnih mjerenja.</div>';

    const ecg=data.ecg||{},readings=ecg.readings||[],latestEcg=ecg.latest;
    ecgSelectionController?.abort();ecgReadingsById=new Map(readings.filter(row=>row.id!=null).map(row=>[String(row.id),row]));ecgDetailsById.clear();selectedEcgId=null;
    $("ecg-count").textContent=`${num(readings.length)} očitanja`;
    if(latestEcg?.id){
      ecgReadingsById.set(String(latestEcg.id),latestEcg);
      ecgDetailsById.set(String(latestEcg.id),{reading:latestEcg,waveform:ecg.waveform||null});
      void selectEcgReading(latestEcg.id);
    }else renderEcgSignal(null,null,false,"Nema ECG očitanja u Garmin Connectu.");
    renderEcgReadingList();
  };
  let garminProfileController=null;
  const loadGarminProfile=async(target,forceRefresh=false)=>{
    garminProfileController?.abort();const controller=new AbortController();garminProfileController=controller;
    ecgSelectionController?.abort();ecgReadingsById=new Map();ecgDetailsById.clear();selectedEcgId=null;$("ecg-readings").innerHTML='<div class="loading">Učitavam dostupna očitanja…</div>';
    $("gear-inventory-summary").innerHTML='<div class="loading">Učitavam Garminovu opremu…</div>';
    $("gear-active-list").innerHTML="";$("race-predictions-grid").innerHTML='<div class="loading">Učitavam procjene…</div>';
    $("personal-records-grid").innerHTML='<div class="loading">Učitavam Garminove rekorde…</div>';
    $("weight-latest").textContent="—";$("ecg-rhythm").textContent="Učitavam ECG očitanja…";
    try{
      const result=await getGarminProfile(target,forceRefresh,controller.signal);
      if(controller.signal.aborted||dateInput.value!==target)return;
      latestGarminProfile=result.data;renderGarminProfile(result.data);
    }catch(error){
      if(error.name==="AbortError"||controller.signal.aborted)return;
      if(dateInput.value!==target)return;
      $("gear-inventory-summary").innerHTML=`<div class="error">${escapeHtml(error.message||"Garmin Connect nije dostupan.")}</div>`;
      $("gear-active-list").innerHTML="";$("race-predictions-grid").innerHTML='<div class="empty-chart">Garminove procjene trenutačno nisu dostupne.</div>';
      $("personal-records-grid").innerHTML='<div class="empty-chart">Osobni rekordi trenutačno nisu dostupni.</div>';
      $("running-economy-chart").innerHTML='<div class="empty-chart">Running Economy trenutačno nije dostupan.</div>';
      $("weight-latest").textContent="—";$("weight-context").textContent="Garminova vaganja trenutačno nisu dostupna.";
      $("ecg-rhythm").textContent="ECG trenutačno nije dostupan";$("ecg-date").textContent=error.message||"Provjeri lokalnu Garmin Connect sesiju.";
      $("ecg-waveform-chart").innerHTML='<div class="empty-chart">Nije moguće učitati Garminova ECG očitanja.</div>';
    }
  };
  const snapshotCard=(target,kind,title,body)=>`<a class="snapshot-card ${kind}" href="#${target}"><span class="snapshot-heading"><span class="snapshot-icon" aria-hidden="true">${snapshotIcon(kind)}</span><span class="snapshot-title">${title}</span><span class="snapshot-link">Detalji <span aria-hidden="true">↗</span></span></span>${body}</a>`;
  const renderDailySnapshot=payload=>{
    const n=payload.normalized||{},debt=n.sleepDebt||{},training=n.training||{},activitySource=payload.sources?.activities;
    const debtValue=debt.debtSeconds==null?"—":debt.debtSeconds===0?"Bez manjka":duration(debt.debtSeconds);
    const debtCoverage=debt.daysAvailable==null?"Pokrivenost nije dostupna":`${num(debt.daysAvailable)}/${num(debt.daysExpected||14)} noći`;
    const sleepBody=`<span class="snapshot-values"><span class="snapshot-value"><strong class="violet">${escapeHtml(debtValue)}</strong><span>${debtCoverage}</span></span></span>`;
    const observedCount=Number(training.runCount7d)||0;
    const activityUnavailable=activitySource?.ok===false,emptyPartial=activitySource?.partial&&observedCount===0;
    const trainingLoad=activityUnavailable||emptyPartial?null:training.trainingLoad7d;
    const runDistance=activityUnavailable||emptyPartial?null:training.runDistance7dKm;
    const trainingBody=`<span class="snapshot-values"><span class="snapshot-value"><strong>${trainingLoad==null?"—":num(trainingLoad,0)}</strong><span>Opterećenje aktivnosti · 7 dana</span></span><span class="snapshot-value"><strong class="cyan">${runDistance==null?"—":`${num(runDistance,1)} km`}</strong><span>${activityUnavailable?"Povijest aktivnosti nije dostupna":activitySource?.partial?`Najmanje ${num(observedCount)} zabilježenih trčanja · 7 dana`:`${num(observedCount)} trčanja · 7 dana`}</span></span></span>`;
    $("overview").innerHTML=[snapshotCard("sleep-recovery","sleep","Sleep Debt",sleepBody),snapshotCard("training-load","training","Trening · 7 dana",trainingBody)].join("");
  };
  const sourceNames={profile:"Garmin profil",dailySummaries:"Dnevni sažeci",sleep:"San · danas",sleepHistory:"Povijest sna",bodyBattery:"Body Battery",heartRate:"Puls",hrv:"HRV",stress:"Stres",steps:"Koraci",hydration:"Hidratacija",spo2:"SpO₂",activities:"Aktivnosti",fitnessAge:"Dob kondicije",heartRateZones:"Pulsne zone",wellnessActivity:"Zdravstveni sažeci",activityDetail:"Detalji zadnje aktivnosti",activityWorkout:"Strukturirani Garmin trening",garminTraining:"Garminove napredne metrike",runnaCalendar:"Runna kalendar",runnaArchive:"Lokalna arhiva plana"};
  const renderSourceAvailability=sources=>{
    const status=$("api-status"),heroMeta=status?.parentElement;
    if(!status||!heroMeta)return;
    let warning=$("source-warning");
    if(!warning){warning=document.createElement("a");warning.id="source-warning";warning.className="source-warning";warning.href="#data-sources";warning.setAttribute("aria-label","Otvori status Garminovih izvora");status.insertAdjacentElement("afterend",warning);}
    const affected=Object.entries(sources||{}).filter(([,source])=>source.configured!==false&&(!source.ok||source.partial));
    warning.hidden=affected.length===0;
    warning.textContent=!affected.length?"":sources?.activities?.ok===false?"Povijest aktivnosti nije dostupna":sources?.activities?.partial?"Povijest aktivnosti je djelomična":`Djelomični podaci · ${num(affected.length)} izvora`;
    warning.title=affected.map(([key,source])=>`${sourceNames[key]||key}: ${source.partial?"djelomično":source.message||"nije dostupno"}`).join("\n");
  };
  const renderSchedule=s=>{
    if(!s?.configured){
      $("schedule").innerHTML='<div><div class="schedule-kicker">Poveži Runna kalendar</div><div class="next-title">Prikaži planirano trčanje ovdje</div><div class="next-desc">Runna nudi privatni iCalendar feed. Zalijepi njegov URL u lokalni <b>.env</b>; taj URL se ne šalje u preglednik.</div><ol class="setup-steps"><li>Runna → Profile → Connected Apps &amp; Devices → Calendars</li><li>Connect Calendar → Other Calendar → kopiraj iCalendar URL</li><li>Dodaj URL u <b>.env</b> i ponovno pokreni dashboard</li></ol><span class="code-pill">RUNNA_ICAL_URL="https://…"</span></div><div class="quiet">Garmin health i activity podaci i dalje rade normalno.</div>';
      return;
    }
    if(!s.ok){
      $("schedule").innerHTML='<div><div class="schedule-kicker">Runna feed povezan</div><div class="next-title">Kalendar trenutačno nije dostupan</div><div class="next-desc">'+escapeHtml(s.message||"Provjeri iCalendar feed URL u .env.")+'</div></div><div class="quiet">Provjeri da feed nije istekao i da je povezan u Runna aplikaciji.</div>';
      return;
    }
    const durationText=e=>{
      const range=e?.durationRangeSeconds;
      if(Array.isArray(range)&&range.length===2&&range.every(x=>Number.isFinite(Number(x))))return duration(range[0])+'–'+duration(range[1]);
      return e?.durationSeconds?duration(e.durationSeconds):"";
    };
    const distanceText=e=>{
      if(e?.distanceKm!=null){
        const total=num(e.distanceKm,1)+" km";
        if(e.distanceStatus==="total_inferred_from_interval_title"&&e.intervalDistanceKm!=null)return total+" ukupno · interval "+num(e.intervalDistanceKm,1)+" km";
        return total;
      }
      if(e?.distanceStatus==="interval_only"&&e.intervalDistanceKm!=null)return "Interval "+num(e.intervalDistanceKm,1)+" km · ukupno nije navedeno";
      if(e?.distanceStatus==="ambiguous")return "Ukupna udaljenost nije sigurna";
      return "";
    };
    const runTypeText=e=>{
      const source=`${e?.title||""} ${e?.description||""}`.toLocaleLowerCase("hr-HR");
      if(/\b(race|utrka|race pace|5k race|10k race)\b/.test(source))return "Utrka";
      if(/\b(interval|intervals|fartlek|track|repetition|repeats)\b/.test(source))return "Intervalni trening";
      if(/\b(tempo|threshold|thresholds)\b/.test(source))return "Tempo trening";
      if(/\b(long run|long|dugo)\b/.test(source))return "Dugo trčanje";
      if(/\b(recovery|regenerativ|recovery jog)\b/.test(source))return "Regeneracijsko trčanje";
      if(/\b(easy|lagano|steady)\b/.test(source))return "Lagano trčanje";
      return "Planirano trčanje";
    };
    const paceText=e=>{
      const values=[...String(e?.description||"").matchAll(/\b(\d{1,2}:\d{2})\s*\/\s*km\b/gi)].map(m=>m[1]);
      const unique=[...new Set(values)].slice(0,4);
      return unique.length?"Tempo upute: "+unique.map(x=>x+"/km").join(" · "):"";
    };
    const safeRunnaUrl=e=>{
      try{const u=new URL(e?.runnaUrl);return u.protocol==="https:"&&u.hostname==="club.runna.com"?u.href:""}catch{return""}
    };
    const planStat=(label,p)=>{
      if(p?.runCount==null)return "";
      const count=Number(p.runCount)||0,coverage=Number(p.distanceCoverage)||0;
      const km=p.knownDistanceKm==null?"":num(p.knownDistanceKm,1)+" km";
      const coverageNote=count&&coverage<count?" · udaljenost za "+coverage+"/"+count:"";
      return escapeHtml(label+": "+count+(count===1?" trčanje":" trčanja")+(km?" / "+km:"")+coverageNote);
    };
    const details=e=>{
      const desc=String(e?.description||"").trim();
      if(!desc)return "";
      return '<details class="run-info"><summary>Plan treninga i upute</summary><div>'+escapeHtml(desc)+'</div></details>';
    };
    const row=(e,index)=>{
      const meta=[distanceText(e),durationText(e),e.allDay?"Termin nije zadan":fmtDateTime(e.start),paceText(e)].filter(Boolean).join(" · ");
      return '<div class="schedule-row" data-zebra="'+(index%2===0?"odd":"even")+'"><div class="schedule-day">'+escapeHtml(fmtIsoDay(e.date))+'</div><div class="schedule-entry"><div class="schedule-name">'+escapeHtml(e.title)+'</div><div class="schedule-meta">'+escapeHtml(meta||"Detalji nisu navedeni")+'</div>'+details(e)+'</div></div>';
    };
    const next=s.nextRun;
    const upcoming=(s.upcomingRuns||[]).slice(1);
    const nextRow=upcoming.length?row(upcoming[0],0):"";
    const laterRows=upcoming.slice(1).map((event,index)=>row(event,index+1)).join("");
    const rows=nextRow+(laterRows?'<details class="run-info schedule-more"><summary>Ostali planirani treninzi</summary>'+laterRows+'</details>':"");
    const planStats=[planStat("Sljedećih 7 dana",s.plan7d),planStat("sljedećih 14 dana",s.plan14d)].filter(Boolean).join(" · ");
    const stats=planStats?'<div class="schedule-summary">'+planStats+'</div>':"";
    if(next){
      const nextDuration=durationText(next),nextDistance=distanceText(next),nextPace=paceText(next),href=safeRunnaUrl(next);
      const facts=[nextDistance,nextDuration?((Array.isArray(next.durationRangeSeconds)&&next.durationRangeSeconds.length===2)?"Procjena "+nextDuration:nextDuration):"",nextPace].filter(Boolean);
      const desc=String(next.description||"").trim();
      const nextSummary=`${runTypeText(next)} prema Runna planu.`;
      const nextDetails=desc?'<details class="run-info"><summary>Izvorne Runna upute</summary><div>'+escapeHtml(desc)+'</div></details>':"";
      const link=href?'<a class="runna-link" href="'+escapeHtml(href)+'" target="_blank" rel="noopener noreferrer">Otvori trening u Runni ↗</a>':"";
      $("schedule").innerHTML='<div class="next-run"><div class="schedule-kicker">Sljedeće planirano trčanje</div><div class="next-title">'+escapeHtml(next.title)+'</div><div class="next-date">'+escapeHtml([fmtIsoDay(next.date),next.allDay?"Termin nije zadan":fmtDateTime(next.start),...facts].filter(Boolean).join(" · "))+'</div>'+'<div class="next-desc">'+escapeHtml(nextSummary)+'</div>'+nextDetails+(link?'<div class="next-actions">'+link+'</div>':"")+'</div><div class="schedule-list">'+stats+(rows||'<div class="quiet">Nema drugih nadolazećih trčanja u feedu.</div>')+'</div>';
      return;
    }
    $("schedule").innerHTML='<div><div class="schedule-kicker">Runna feed povezan</div><div class="next-title">Nema nadolazećeg trčanja</div><div class="next-date">Provjereno '+escapeHtml(new Date().toLocaleString("hr-HR"))+'</div></div><div class="schedule-list">'+stats+'<div class="quiet">U feedu zasad nema budućih događaja označenih kao trčanje. Ostale nadolazeće Runna sesije: '+num((s.upcomingEvents||[]).length)+'</div></div>';
  };
  const renderPlanActual=(summary,activitySource)=>{
    if(!summary){
      $("plan-archive-note").textContent="Runna arhiva nije dostupna.";
      $("plan-actual-weeks").innerHTML='<tr><td colspan="5" class="quiet">Nije moguće učitati lokalnu Runna arhivu.</td></tr>';
      return;
    }
    const past=summary.past30d||{},next=summary.next14d||{};
    const expectedDays=Number(past.expectedDays)||30;
    const archiveDate=summary.archiveStartDate?Date.parse(`${String(summary.archiveStartDate).slice(0,10)}T12:00:00Z`):NaN;
    const targetDate=Date.parse(`${dateInput.value}T12:00:00Z`);
    const windowStart=new Date(targetDate);windowStart.setUTCDate(windowStart.getUTCDate()-expectedDays+1);
    const coverageStart=Number.isFinite(archiveDate)?Math.max(archiveDate,windowStart.getTime()):NaN;
    const fallbackCovered=Number.isFinite(coverageStart)&&Number.isFinite(targetDate)?Math.max(0,Math.min(expectedDays,Math.floor((targetDate-coverageStart)/86400000)+1)):0;
    const coveredDays=past.coveredDays==null?fallbackCovered:Number(past.coveredDays)||0;
    const pastCoverageComplete=past.coverageComplete===true||(past.coverageComplete==null&&fallbackCovered>=expectedDays);
    const archiveDateLabel=summary.archiveStartDate?fmtIsoDay(summary.archiveStartDate):"još nema spremljenih planova";
    $("plan-archive-note").textContent=`Runna arhiva od ${archiveDateLabel} · povijesno pokriće ${num(coveredDays)}/${num(expectedDays)} dana`;

    const unavailable=pastCoverageComplete?"—":"Nedostupno";
    $("planned30-count").textContent=pastCoverageComplete?num(past.plannedRunCount):unavailable;
    $("matched30-count").textContent=activitySource?.ok===false?"Nedostupno":activitySource?.partial?"Nepotpuno":pastCoverageComplete?num(past.matchedRunCount):unavailable;
    $("match-rate").textContent=activitySource?.ok===false?"Nedostupno":activitySource?.partial?"Nije pouzdano":!pastCoverageComplete||past.matchRatePct==null?unavailable:num(past.matchRatePct,0)+"%";
    $("actual30-distance").textContent=activitySource?.ok===false?"Nedostupno":past.actualDistanceKm==null?(Number(past.actualRunCount)?"Udaljenost —":activitySource?.partial?"Nepotpuna povijest":"Nema trčanja"):`${activitySource?.partial?"≥ ":""}${num(past.actualDistanceKm,1)} km`;
    $("plan30-coverage-note").textContent=activitySource?.ok===false
      ?"Runna plan je dostupan, ali Garminova povijest aktivnosti trenutačno nije dostupna za izračun izvedbe."
      :activitySource?.partial
      ?`Runna plan je dostupan; Garminova povijest je djelomična pa se ukupna izvedba i postotak uparivanja ne mogu pouzdano potvrditi. Dostupno je najmanje ${num(past.actualRunCount)} trčanja${past.actualDistanceKm==null?"":` · ${num(past.actualDistanceKm,1)} km`}.`
      :pastCoverageComplete
      ?`Povijesni plan pokriva ${num(expectedDays)}/${num(expectedDays)} dana. Planirano ${num(past.plannedRunCount)} trčanja${past.plannedDistanceKm==null?"":` · ${num(past.plannedDistanceKm,1)} km`}; Garmin bilježi ${num(past.actualRunCount)} trčanja i ${past.actualDistanceKm==null?"—":`${num(past.actualDistanceKm,1)} km`}.${activitySource?.partial?" Povijest aktivnosti je djelomična; izvedba je samo zabilježeni minimum.":""}`
      :`Planirano, upareno i postotak nisu izračunljivi: Runna arhiva pokriva ${num(coveredDays)}/${num(expectedDays)} dana od ${archiveDateLabel}. Garminova odrađena kilometraža prikazana je zasebno.`;

    const nextCount=Number(next.plannedRunCount)||0,knownDistance=Number(next.knownDistanceCount)||0;
    $("planned14-count").textContent=nextCount?num(nextCount):"Nema treninga";
    $("planned14-distance").textContent=next.plannedDistanceKm==null?(nextCount?"Udaljenost nije navedena":"—"):num(next.plannedDistanceKm,1)+" km";
    $("planned14-coverage").textContent=nextCount?num(knownDistance)+"/"+num(nextCount):"—";
    $("plan-archive-count").textContent=num(summary.archivedPlanCount);
    $("plan-archive-start").textContent=summary.archiveStartDate
      ?`${num(summary.archivedPlanCount)} spremljenih planiranih treninga · od ${archiveDateLabel}`
      :"Brojat će se Runna treninzi nakon prvog uspješnog spremanja.";
    $("plan-match-note").textContent=!pastCoverageComplete
      ?`Povijesno uparivanje zasad nije reprezentativno: dostupno ${num(coveredDays)}/${num(expectedDays)} dana Runna arhive.`
      :past.plannedRunCount
        ?`Upareno ${num(past.matchedRunCount)} od ${num(past.plannedRunCount)} planova. Neupareno trčanje nije automatski proglašeno propuštenim.`
        :"U proteklih 30 dana nema arhiviranih Runna planova za usporedbu.";

    const weeks=summary.weeks||[],asOf=dateInput.value;
    $("plan-actual-asof").textContent="Status do "+fmtIsoDay(asOf);
    $("plan-actual-weeks").innerHTML=weeks.length?weeks.map(w=>{
      const plannedCount=Number(w.plannedRunCount)||0,actualCount=Number(w.actualRunCount)||0;
      const futureWeek=String(w.start)>asOf;
      const planKnown=w.planCoverageComplete===true||(w.planCoverageComplete==null&&summary.archiveStartDate&&String(summary.archiveStartDate)<=String(w.start));
      const dueCount=Number(w.duePlannedRunCount??(futureWeek?0:plannedCount))||0;
      const todayCount=Number(w.todayPlannedRunCount)||0;
      const upcomingCount=Number(w.upcomingPlanCount??(futureWeek?plannedCount:0))||0;
      const matchedDue=Number(w.matchedDueRunCount??w.matchedRunCount)||0;
      const matchedToday=Number(w.matchedTodayRunCount)||0;
      const planText=!planKnown?"Nije u arhivi":plannedCount?num(plannedCount):"Nema plana";
      const plannedKm=!planKnown?"—":w.plannedDistanceKm==null?(plannedCount?"Nije navedeno":"—"):num(w.plannedDistanceKm,1)+" km";
      let statusText;
      if(!planKnown)statusText="Nije usporedivo · Runna plan nije arhiviran";
      else if(futureWeek)statusText=plannedCount?`Nadolazi · ${num(plannedCount)} planirano`:"Nema planiranih treninga";
      else if(activitySource?.ok===false&&!futureWeek)statusText="Izvedba nije dostupna · Garminova povijest nedostaje";
      else if(!plannedCount)statusText="Nema planiranog Runna treninga";
      else{
        const parts=[];
        if(dueCount)parts.push(`Upareno ${num(matchedDue)}/${num(dueCount)} dospjelih`);
        if(todayCount)parts.push(`Danas ${num(matchedToday)}/${num(todayCount)}`);
        if(upcomingCount)parts.push(`Nadolazi ${num(upcomingCount)}`);
        statusText=activitySource?.partial?`Djelomična Garminova povijest · u dostupnim zapisima ${num(matchedDue)}/${num(dueCount)} dospjelih`:parts.join(" · ")||"Plan je zabilježen";
      }
      let actualText;
      if(futureWeek)actualText="Još nije dospjelo";
      else if(activitySource?.ok===false)actualText="Garminova povijest nije dostupna";
      else if(actualCount)actualText=`${activitySource?.partial?"Najmanje ":""}${num(actualCount)} trč. · ${w.actualDistanceKm==null?"udaljenost nije dostupna":`${num(w.actualDistanceKm,1)} km`}`;
      else actualText=activitySource?.partial?"Nema trčanja u dostupnom uzorku":"Nema zabilježenih trčanja";
      const rowClass=!planKnown?"plan-week-unknown":futureWeek?"plan-week-future":"";
      return `<tr class="${rowClass}"><td data-label="Tjedan">${escapeHtml(fmtIsoDay(w.start))} — ${escapeHtml(fmtIsoDay(w.end))}</td><td data-label="Runna plan">${escapeHtml(planText)}</td><td data-label="Planirana udaljenost">${escapeHtml(plannedKm)}</td><td data-label="Status plana">${escapeHtml(statusText)}</td><td data-label="Garmin izvedba">${escapeHtml(actualText)}</td></tr>`;
    }).join(""):'<tr><td colspan="5" class="quiet">Još nema tjednog pregleda Runna plana.</td></tr>';
  };
  const renderCalendarDayDetail=day=>{
    const host=$("calendar-day-detail");
    if(!day){host.innerHTML='<div class="calendar-day-empty">Odaberi dan da vidiš zabilježena trčanja i njihove sažetke.</div>';return}
    const sessions=Array.isArray(day.sessions)?day.sessions:[],count=day.count==null?null:Number(day.count)||0,isFuture=day.count==null&&day.distanceKm==null,km=day.distanceKm==null?null:Number(day.distanceKm),dateLabel=fmtIsoDay(day.date);
    const partialHistory=lastDashboardPayload?.sources?.activities?.partial===true;
    const daySummary=isFuture?"Budući dan":count?`${partialHistory?"Najmanje ":""}${num(count)} ${count===1?"trčanje":"trčanja"} · ${km==null?"udaljenost nije zabilježena":`${num(km,1)} km`}`:partialHistory?"Nema zapisa · povijest djelomična":"Odmor · nema zabilježenog trčanja";
    const rows=sessions.map(activity=>{
      const id=activity.id==null?"":String(activity.id),distance=Number(activity.distanceMeters),meta=[distance>0?`${num(distance/1000,2)} km`:"udaljenost nije zabilježena",activity.durationSeconds!=null?duration(activity.durationSeconds,true):null,activity.paceSecondsPerKm!=null?pace(activity.paceSecondsPerKm):null,activity.avgHeartRate!=null?`${num(activity.avgHeartRate)} bpm`:null].filter(Boolean).join(" · ");
      const title=activity.name||humanType(activity.type);
      return `<button type="button" class="calendar-run-item" data-calendar-activity-id="${escapeHtml(id)}"${id?"":" disabled"} aria-label="Otvori detalje aktivnosti ${escapeHtml(title)}"><span class="calendar-run-icon" aria-hidden="true">↗</span><span class="calendar-run-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(meta||"Garminov sažetak aktivnosti")}</small></span><span class="calendar-run-action">Detalji</span></button>`;
    }).join("");
    host.innerHTML=`<div class="calendar-day-head"><div><span class="calendar-day-kicker">Odabrani dan</span><h4>${escapeHtml(dateLabel)}</h4></div><span class="badge">${escapeHtml(daySummary)}</span></div>${rows?`<div class="calendar-run-list">${rows}</div>`:`<p class="calendar-day-empty">${isFuture?"Za budući datum još nema Garmin zapisa.":partialHistory?"U dostupnoj, djelomičnoj povijesti nema zapisa za ovaj dan.":"Nema Garminovih trčanja zabilježenih za ovaj dan."}</p>`}`;
  };
  const renderTrainingPatterns=(t,activitySource,payloadDate)=>{
    const pattern=t.trainingPatterns||{},days=pattern.dailyRunCalendar||[],calendar=$("training-calendar");
    const note=$("training-pattern-note");
    if(activitySource?.ok===false){
      note.textContent="Garmin povijest aktivnosti nije dostupna";
      calendar.innerHTML='<div class="quiet calendar-unavailable">Kalendar čeka Garmin zapise.</div>';
      calendarDaysByDate=new Map();calendarActivitiesById=new Map();selectedCalendarDate=null;renderCalendarDayDetail(null);
      ["pattern-distance-28","pattern-run-days","pattern-run-count","pattern-longest-run","run-monotony","run-strain","all-monotony","all-strain"].forEach(id=>$(id).textContent="—");
      $("run-pattern-context").textContent="Load nije dostupan.";$("all-pattern-context").textContent="Load nije dostupan.";
      return;
    }
    note.textContent=activitySource?.partial?"Djelomična Garmin povijest · prazni dani mogu biti bez zapisa":"Garmin aktivnosti · zadnjih 13 tjedana";
    const maxKm=Math.max(0,...days.map(day=>Number(day.distanceKm)||0));
    calendarDaysByDate=new Map(days.map(day=>[String(day.date).slice(0,10),day]));calendarActivitiesById=new Map();
    calendar.innerHTML=Array.from({length:13},(_,week)=>{
      const column=days.slice(week*7,week*7+7),first=column[0];
      if(!first)return '<div class="calendar-week"></div>';
      const firstDate=new Date(`${first.date}T12:00:00`),previousWeek=days[(week-1)*7];
      const previousMonth=previousWeek?new Date(`${previousWeek.date}T12:00:00`).getMonth():-1;
      const monthLabel=week===0||firstDate.getMonth()!==previousMonth?firstDate.toLocaleDateString("hr-HR",{month:"short"}):"";
      return '<div class="calendar-week"><span class="calendar-month">'+escapeHtml(monthLabel)+'</span>'+column.map((day,weekday)=>{
        const km=day.distanceKm==null?null:Number(day.distanceKm)||0,count=day.count==null?null:Number(day.count)||0;
        const sessions=Array.isArray(day.sessions)?day.sessions:[];sessions.forEach(activity=>{if(activity?.id!=null)calendarActivitiesById.set(String(activity.id),activity)});
        const level=km==null?0:km>0&&maxKm?Math.min(4,Math.max(1,Math.ceil(km/maxKm*4))):count>0?1:0;
        const isFuture=day.count==null&&day.distanceKm==null,dateLabel=fmtIsoDay(day.date),text=isFuture?`${dateLabel} · budući dan`:count?`${dateLabel} · ${activitySource?.partial?"najmanje ":""}${num(count)} ${count===1?"trčanje":"trčanja"} · ${km==null?"udaljenost nije zabilježena":`${num(km,1)} km`}`:activitySource?.partial?`${dateLabel} · nema zapisa u djelomičnoj povijesti`:`${dateLabel} · odmor`;
        const isSelected=String(day.date).slice(0,10)===selectedCalendarDate,index=week*7+weekday;
        return `<button type="button" class="calendar-day" data-date="${escapeHtml(day.date)}" data-level="${level}" data-week="${week}" data-weekday="${weekday}" data-calendar-index="${index}" aria-pressed="${isSelected}" aria-label="${escapeHtml(text)}${isFuture?"":". Odaberi dan za pregled trčanja."}" title="${escapeHtml(text)}"${isFuture?" disabled":""} tabindex="${isSelected?0:-1}"></button>`;
      }).join("")+'</div>';
    }).join("");
    selectedCalendarDate=calendarDaysByDate.has(selectedCalendarDate)?selectedCalendarDate:(calendarDaysByDate.has(payloadDate)?payloadDate:days.filter(day=>day.count>0).at(-1)?.date||null);
    calendar.querySelectorAll(".calendar-day").forEach(button=>{const selected=button.dataset.date===selectedCalendarDate;button.setAttribute("aria-pressed",String(selected));button.tabIndex=selected?0:-1});
    renderCalendarDayDetail(calendarDaysByDate.get(selectedCalendarDate));
    const recent=pattern.last28Days||{};
    $("pattern-distance-28").textContent=recent.distanceKm==null?"—":`${num(recent.distanceKm,1)} km`;
    $("pattern-run-days").textContent=recent.runDays==null?"—":`${num(recent.runDays)} / 28`;
    $("pattern-run-count").textContent=recent.runCount==null?"—":num(recent.runCount);
    const longest=$("pattern-longest-run");longest.textContent=recent.longestRunKm==null?"—":`${num(recent.longestRunKm,1)} km`;longest.title=recent.longestRunDate?fmtIsoDay(recent.longestRunDate):"";
    const load=pattern.loadPattern||{};
    const renderLoad=(sport,prefix)=>{
      const current=sport?.last7||{},previous=sport?.previous7||{};
      const noObservedActivity=activitySource?.partial&&Number(current.activityDays)===0;
      $(prefix+"-monotony").textContent=noObservedActivity||current.monotony==null?"—":num(current.monotony,2);
      $(prefix+"-strain").textContent=noObservedActivity||current.strain==null?"—":num(current.strain,1);
      let context;
      if(noObservedActivity)context="Povijest djelomična; nema zapisa za potvrdu nultog opterećenja.";
      else if(activitySource?.partial)context=`Samo zabilježene aktivnosti · povijest djelomična.${current.activityDays==null?"":` ${num(current.activityDays)} aktivnih dana.`}`;
      else if(!current.complete)context=`Nedostaje Garmin load za ${num((current.windowDays||7)-(current.coveredDays||0))} od ${num(current.windowDays||7)} dana.`;
      else if(current.monotony==null)context="Tjedni load je bez varijacije ili bez opterećenja; monotonija nije definirana.";
      else if(previous.monotony!=null)context=`Prethodni tjedan ${num(previous.monotony,2)} · ${num(current.activityDays)} aktivnih dana.`;
      else context=`${num(current.activityDays)} aktivnih dana · ${num(current.totalLoad,0)} load bodova.`;
      $(prefix+"-pattern-context").textContent=context;
    };
    renderLoad(load.running,"run");renderLoad(load.allActivities,"all");
  };
  const renderTrainingBalance=(balance,activitySource)=>{
    const current=balance?.current||{},previous=balance?.previous||{},currentRows=current.sports||[],previousRows=previous.sports||[];
    if(activitySource?.ok===false){
      $("training-balance-rows").innerHTML='<tr><td colspan="3" class="quiet">Garminova povijest aktivnosti trenutačno nije dostupna.</td></tr>';
      $("training-balance-coverage").textContent="Nedostupno";$("training-balance-note").textContent=activitySource.message||"Pokušaj ponovno nakon osvježavanja podataka.";return;
    }
    const byKey=new Map([...currentRows,...previousRows].map(row=>[row.key,row]));
    const order=[...byKey.keys()].sort((a,b)=>{
      const av=currentRows.find(row=>row.key===a),bv=currentRows.find(row=>row.key===b);
      return Number(bv?.durationSeconds||0)-Number(av?.durationSeconds||0)||String(byKey.get(a)?.label||a).localeCompare(String(byKey.get(b)?.label||b),"hr");
    });
    const rowsByWindow={current:new Map(currentRows.map(row=>[row.key,row])),previous:new Map(previousRows.map(row=>[row.key,row]))};
    const metricText=(row,key,coverageKey)=>{
      if(!row||row[key]==null)return "—";
      const value=key==="durationSeconds"?duration(row[key]):key==="distanceKm"?`${num(row[key],1)} km`:num(row[key],0);
      return Number(row[coverageKey])<Number(row.activityCount)?`${value} · ${num(row[coverageKey])}/${num(row.activityCount)} zapisa`:value;
    };
    const cell=(row)=>!row||activitySource?.partial&&Number(row.activityCount)===0?'<span class="sport-balance-empty">Nedovoljno zapisa</span>':`<strong>${activitySource?.partial?"≥ ":""}${num(row.activityCount)} ${Number(row.activityCount)===1?"aktivnost":"aktivnosti"}</strong><small>${escapeHtml(metricText(row,"durationSeconds","durationCoverage"))} · ${escapeHtml(metricText(row,"distanceKm","distanceCoverage"))}</small><small>Garmin load ${escapeHtml(metricText(row,"trainingLoad","loadCoverage"))}</small>`;
    $("training-balance-rows").innerHTML=order.length?order.map(key=>`<tr><td>${escapeHtml(byKey.get(key)?.label||key)}</td><td>${cell(rowsByWindow.current.get(key))}</td><td>${cell(rowsByWindow.previous.get(key))}</td></tr>`).join(""):'<tr><td colspan="3" class="quiet">Nema zabilježenih aktivnosti u ova dva tjedna.</td></tr>';
    $("training-balance-rows").innerHTML=order.length?order.map(key=>`<tr><td>${escapeHtml(byKey.get(key)?.label||key)}</td><td data-label="Zadnjih 7 dana">${cell(rowsByWindow.current.get(key))}</td><td data-label="Prethodnih 7 dana">${cell(rowsByWindow.previous.get(key))}</td></tr>`).join(""):activitySource?.partial?'<tr><td colspan="3" class="quiet">Nema zapisa u dostupnom uzorku; povijest je djelomična.</td></tr>':'<tr><td colspan="3" class="quiet">Nema zabilježenih aktivnosti u ova dva tjedna.</td></tr>';
    const count=Number(current.activityCount)||0,durationCoverage=Number(current.durationCoverage)||0,distanceCoverage=Number(current.distanceCoverage)||0,loadCoverage=Number(current.loadCoverage)||0;
    $("training-balance-coverage").textContent=activitySource?.partial?`Djelomična povijest${count?` · najmanje ${num(count)} aktivnosti`:""}`:count?`${durationCoverage}/${count} trajanje · ${distanceCoverage}/${count} udaljenost · ${loadCoverage}/${count} load`:"Nema aktivnosti";
    $("training-balance-note").textContent=`Trenutačni prozor ${fmtIsoDay(current.start)}–${fmtIsoDay(current.end)}; usporedba ${fmtIsoDay(previous.start)}–${fmtIsoDay(previous.end)}.${activitySource?.partial?" Garminov izvor je djelomičan pa prazni dani možda nemaju zapis.":""} Kilometraža je prikazana samo za aktivnosti s poznatom udaljenošću.`;
  };
  let weeklyVolumeState={training:null,activitySource:null,selectedSport:"running"};
  const renderWeeklyVolumeSection=(training,activitySource)=>{
    weeklyVolumeState.training=training||{};weeklyVolumeState.activitySource=activitySource;
    const points=Array.isArray(training?.weeklyVolume)?training.weeklyVolume:[],sourceComplete=activitySource?.ok===true&&!activitySource?.partial;
    const chart=$("volume-chart"),panel=chart?.closest(".weekly-volume-panel");if(!chart||!panel)return;
    let selector=panel.querySelector(".volume-sport-switch");
    if(!selector){selector=document.createElement("div");selector.className="volume-sport-switch";selector.setAttribute("role","group");selector.setAttribute("aria-label","Odaberi sport za tjednu udaljenost");chart.insertAdjacentElement("beforebegin",selector);selector.addEventListener("click",event=>{const button=event.target.closest("button[data-volume-sport]");if(!button||!selector.contains(button))return;weeklyVolumeState.selectedSport=button.dataset.volumeSport;renderWeeklyVolumeSection(weeklyVolumeState.training,weeklyVolumeState.activitySource)});}
    const sportRows=point=>Array.isArray(point?.sports)?point.sports:[];
    const bySport=new Map();
    for(const point of points)for(const row of sportRows(point))if(Number(row.distanceCoverage)>0&&row.distanceKm!=null){if(!bySport.has(row.key))bySport.set(row.key,{key:row.key,label:row.label||row.key});}
    if(!bySport.size&&points.some(point=>point.distanceKm!=null))bySport.set("running",{key:"running",label:"Trčanje"});
    const preferred=["running","cycling","swimming","walking","hiking","skiing","rowing"];
    const sports=[...bySport.values()].sort((a,b)=>{const ai=preferred.indexOf(a.key),bi=preferred.indexOf(b.key);return (ai<0?99:ai)-(bi<0?99:bi)||a.label.localeCompare(b.label,"hr")});
    const empty=message=>{selector.hidden=true;selector.replaceChildren();disposeChartsInside(chart);chart.innerHTML=`<div class="empty-chart">${escapeHtml(message)}</div>`;$("weekly-volume-distance").textContent="—";$("weekly-volume-change").textContent="—";$("weekly-volume-count").textContent="—";$("weekly-volume-secondary").textContent="—";$("weekly-volume-note").hidden=true;};
    if(activitySource?.ok===false){empty("Garminova povijest aktivnosti trenutačno nije dostupna.");return;}
    if(!sports.length){empty(activitySource?.partial?"Nema dovoljno potpunih podataka o udaljenosti za prikaz sportova.":"Nema zabilježene udaljenosti za prikaz u ovom razdoblju.");return;}
    if(!sports.some(row=>row.key===weeklyVolumeState.selectedSport))weeklyVolumeState.selectedSport=sports.some(row=>row.key==="running")?"running":sports[0].key;
    const selected=sports.find(row=>row.key===weeklyVolumeState.selectedSport)||sports[0];
    selector.hidden=sports.length<2;
    selector.innerHTML=sports.map(row=>`<button type="button" data-volume-sport="${escapeHtml(row.key)}" aria-pressed="${row.key===selected.key}">${escapeHtml(row.label)}</button>`).join("");
    const chartPoints=points.map(point=>{
      const row=sportRows(point).find(item=>item.key===selected.key)||(selected.key==="running"&&!Array.isArray(point.sports)?{distanceKm:point.distanceKm,distanceCoverage:point.distanceKm==null?0:point.count,activityCount:point.count}:null);
      const count=row?Number(row.activityCount)||0:sourceComplete?0:null;
      const distanceCoverage=row?Number(row.distanceCoverage)||0:sourceComplete?0:null;
      const distanceKm=row&&distanceCoverage>0?Number(row.distanceKm):row&&count===0&&sourceComplete?0:!row&&sourceComplete?0:null;
      return {...point,distanceKm,count,distanceCoverage,activityCount:count};
    });
    const chartTitle=panel.querySelector("#weekly-volume-title"),unit=panel.querySelector("#weekly-volume-unit");
    chartTitle.textContent=`Tjedna udaljenost · ${selected.label}`;unit.textContent="km / tjedan";
    renderWeeklyVolume("volume-chart",chartPoints,selected.label);
    const currentRows=training?.trainingBalance?.current?.sports||[],previousRows=training?.trainingBalance?.previous?.sports||[],current=currentRows.find(row=>row.key===selected.key),previous=previousRows.find(row=>row.key===selected.key);
    const completeDistance=row=>{if(!row)return sourceComplete?0:null;const count=Number(row.activityCount)||0;if(count===0&&sourceComplete)return 0;if(count===0&&activitySource?.partial)return null;return row.distanceKm!=null&&Number(row.distanceCoverage)===count?Number(row.distanceKm):null;};
    const completeDuration=row=>{if(!row)return sourceComplete?0:null;const count=Number(row.activityCount)||0;if(count===0&&sourceComplete)return 0;if(count===0&&activitySource?.partial)return null;return row.durationSeconds!=null&&Number(row.durationCoverage)===count?Number(row.durationSeconds):null;};
    const currentDistance=completeDistance(current),previousDistance=completeDistance(previous),currentCount=current?(activitySource?.partial&&Number(current.activityCount)===0?null:Number(current.activityCount)||0):sourceComplete?0:null;
    $("weekly-volume-distance").textContent=currentDistance==null?"—":`${num(currentDistance,1)} km`;
    if(currentDistance!=null&&previousDistance!=null){const delta=currentDistance-previousDistance,pct=previousDistance>0?` · ${delta>0?"+":""}${num(delta/previousDistance*100,0)}%`:currentDistance>0?" · novo ovaj tjedan":"";$("weekly-volume-change").textContent=`${delta>0?"+":""}${num(delta,1)} km${pct}`;}else $("weekly-volume-change").textContent="—";
    $("weekly-volume-count").textContent=currentCount==null?"—":`${num(currentCount)} ${selected.key==="running"?(currentCount===1?"trčanje":"trčanja"):currentCount===1?"aktivnost":"aktivnosti"}`;
    const secondary=selected.key==="running"?training?.runAveragePaceSecondsPerKm:completeDuration(current);
    $("weekly-volume-secondary").textContent=selected.key==="running"?pace(secondary):secondary==null?"—":duration(secondary);
    $("weekly-volume-distance-label").textContent=`${activitySource?.partial?"Zabilježena udaljenost":"Udaljenost"} · zadnjih 7 dana`;
    $("weekly-volume-change-label").textContent=`Promjena prema prethodnom tjednu${activitySource?.partial?" · djelomična povijest":""}`;
    $("weekly-volume-count-label").textContent=`${activitySource?.partial?"Zabilježene aktivnosti":"Aktivnosti"} · zadnjih 7 dana`;
    $("weekly-volume-secondary-label").textContent=selected.key==="running"?"Prosječni tempo · zadnjih 7 dana":"Trajanje aktivnosti · zadnjih 7 dana";
    const note=$("weekly-volume-note");note.hidden=false;note.textContent=`Udaljenost se zbraja samo iz Garmin aktivnosti s poznatom vrijednošću.${activitySource?.partial?" Izvor je djelomičan pa tjedni zbrojevi mogu biti nepotpuni.":""} Sauna i aktivnosti bez udaljenosti nisu prikazane kao kilometraža.`;
  };
  const renderWeeklyReview=(n,payload)=>{
    const training=n.training||{},activitySource=payload.sources?.activities,activityUnavailable=activitySource?.ok===false,partialHistory=activitySource?.partial===true,confirmedEmpty=activitySource?.ok===true&&!partialHistory&&activitySource.count===0,balance=training.trainingBalance||{},current=balance.current||{},previous=balance.previous||{},running=(current.sports||[]).find(row=>row.key==="running"),priorRunning=(previous.sports||[]).find(row=>row.key==="running"),sleepDebt=n.sleepDebt||{},targetSeconds=Number(payload.settings?.sleepTargetMinutes||n.sleep?.sleepTargetMinutes||480)*60,context=n.weeklyContext||{},rpe=context.rpe||{},events=context.lifeEvents||[],schedule=n.runnaSchedule||{},next=schedule.nextRun;
    $("weekly-review-range").textContent=`${fmtIsoDay(current.start||payload.date)} – ${fmtIsoDay(current.end||payload.date)} · usporedba s prethodnih 7 dana`;
    const runCount=running?.activityCount,runKm=running?.distanceKm,priorKm=priorRunning?.distanceKm;
    $("weekly-run-summary").textContent=activityUnavailable?"Povijest nije dostupna":confirmedEmpty?"0 trčanja":partialHistory&&Number(runCount)===0?"Nema zapisa u dostupnom uzorku":runCount==null?"Nema dovoljno zapisa":`${partialHistory?"Najmanje ":""}${num(runCount)} ${runCount===1?"trčanje":"trčanja"}${runKm==null?"":` · ${num(runKm,1)} km`}`;
    $("weekly-run-change").textContent=activityUnavailable?"Nije dostupna Garminova povijest":partialHistory?"Usporedba nije pouzdana · djelomična povijest":runKm==null||priorKm==null?"Nije dostupna potpuna usporedba":priorKm>0?`${runKm>=priorKm?"+":""}${num((runKm/priorKm-1)*100,0)}% kilometraže · prije ${num(priorKm,1)} km`:priorRunning?`Prethodno razdoblje: ${num(priorKm,1)} km`:"Kilometraža prethodnog tjedna nije dostupna";
    $("weekly-activity-summary").textContent=activityUnavailable?"Povijest nije dostupna":confirmedEmpty?"0 aktivnosti":partialHistory&&Number(current.activityCount)===0?"Nema zapisa u dostupnom uzorku":current.activityCount==null?"—":`${partialHistory?"Najmanje ":""}${num(current.activityCount)} aktivnosti`;
    $("weekly-activity-duration").textContent=activityUnavailable?"Povijest nije dostupna":confirmedEmpty?"0 min ukupno":partialHistory&&Number(current.activityCount)===0?"Ukupno trajanje nije moguće potvrditi":current.durationSeconds==null?"Trajanje nije dostupno":`${duration(current.durationSeconds)} ukupno${partialHistory?" · djelomična povijest":Number(current.durationCoverage)<Number(current.activityCount)?` · ${num(current.durationCoverage)}/${num(current.activityCount)} zapisa`:""}`;
    const averageSleep=sleepDebt.average7dSeconds,weeklyDebt=sleepDebt.debtSeconds;
    $("weekly-sleep-average").textContent=averageSleep==null?"—":duration(averageSleep);
    $("weekly-sleep-debt").textContent=weeklyDebt==null?"—":duration(weeklyDebt);
    $("weekly-rpe-average").textContent=rpe.average==null?"—":`${num(rpe.average,1)} / 10`;
    $("weekly-rpe-coverage").textContent=activityUnavailable?"Povijest aktivnosti nije dostupna":partialHistory?"Povijest djelomična; obuhvat osobnih ocjena nije potpun":`${num(rpe.recordedCount||0)} od ${num(rpe.coverageCount||0)} Garmin aktivnosti ima osobnu ocjenu`;
    const labels={sauna:"Sauna",illness:"Bolest",travel:"Putovanje",alcohol:"Alkohol",caffeine:"Kofein",stress:"Stres",physical_load:"Fizičko opterećenje",recovery:"Oporavak",other:"Ostalo"},grouped={};
    for(const item of events){const key=item.category||"other";grouped[key]??={count:0,maxImpact:0};grouped[key].count+=1;grouped[key].maxImpact=Math.max(grouped[key].maxImpact,Number(item.impact)||0)}
    $("weekly-event-count").textContent=`${num(events.length)} ${events.length===1?"događaj":"događaja"}`;
    $("weekly-events").innerHTML=Object.entries(grouped).length?Object.entries(grouped).map(([key,value])=>`<span class="weekly-event-chip">${escapeHtml(labels[key]||key)}${value.count>1?` <b>×${num(value.count)}</b>`:""} · do ${num(value.maxImpact)}/5</span>`).join(""):'<span class="quiet">Nema zabilježenih događaja u ovom prozoru.</span>';
    $("weekly-next-run-title").textContent=next?.title||"Nema budućeg treninga u Runna feedu";
    $("weekly-next-run-date").textContent=next?`${schedule.referenceDate&&schedule.referenceDate!==payload.date?"Aktualni feed · ":""}${fmtIsoDay(next.date)}${next.distanceKm==null?"":` · ${num(next.distanceKm,1)} km`}${next.start?` · ${fmtDateTime(next.start)}`:""}`:"Plan nije dostupan ili nema nadolazećih treninga.";
    const guidance=[];
    if(weeklyDebt!=null&&weeklyDebt>0)guidance.push(`Sleep debt iznosi ${duration(weeklyDebt)}; prosjek sna je ${averageSleep==null?"nedostupan":duration(averageSleep)}${averageSleep!=null&&averageSleep<targetSeconds?", ispod postavljenog cilja":""}.`);
    if(runKm!=null&&priorKm!=null&&priorKm>0&&runKm!==priorKm)guidance.push(`Trkačka kilometraža ${runKm>priorKm?"porasla":"pala"} je ${num(Math.abs((runKm/priorKm-1)*100),0)}% prema prethodnom tjednu.`);
    if(rpe.average!=null)guidance.push(`Osobni prosječni RPE ${num(rpe.average,1)}/10 temelji se na ${num(rpe.recordedCount)} od ${num(rpe.coverageCount)} evidentiranih aktivnosti.`);
    if(next)guidance.push(`Sljedeći Runna trening ostaje ${next.title}; plan se ne mijenja automatski.`);
    $("weekly-guidance").textContent=guidance.length?guidance.join(" "):"Nema dovoljno unesenih podataka za tjednu napomenu. Runna plan ostaje izvor sljedećeg treninga.";
  };
  const renderMonthlyReview=(n,payload)=>{
    const target=String(payload.date||"").slice(0,10),recentStart=isoShift(target,-27),previousStart=isoShift(target,-55),previousEnd=isoShift(target,-28),recentEnd=target;
    const dateLabel=value=>new Date(`${value}T12:00:00`).toLocaleDateString("hr-HR",{day:"2-digit",month:"short",year:"numeric"});
    $("monthly-review-range").textContent=`Prethodno ${dateLabel(previousStart)}–${dateLabel(previousEnd)} · zadnje ${dateLabel(recentStart)}–${dateLabel(recentEnd)}`;
    const period=(rows,key,start,end,aggregate)=>{
      const byDate=new Map((rows||[]).filter(row=>row?.date>=start&&row?.date<=end&&row?.[key]!=null&&Number.isFinite(Number(row[key]))).map(row=>[String(row.date).slice(0,10),Number(row[key])]));
      const values=[...byDate.values()];
      return {value:values.length>=14?aggregate(values):null,count:values.length};
    };
    const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
    const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
    const sleepRows=n.sleep?.history||[],trends=n.recoveryTrends||[];
    const metrics=[
      {label:"Prosječno trajanje sna",unit:"",key:"totalSeconds",rows:sleepRows,aggregate:mean,format:value=>duration(value),delta:value=>`${value>0?"+":value<0?"−":""}${duration(Math.abs(value))}`},
      {label:"HRV · medijan",unit:" ms",key:"hrv",rows:trends,aggregate:median,format:value=>`${num(value)} ms`,delta:value=>`${value>0?"+":value<0?"−":""}${num(Math.abs(value))} ms`},
      {label:"Puls u mirovanju · medijan",unit:" bpm",key:"restingHeartRate",rows:trends,aggregate:median,format:value=>`${num(value)} bpm`,delta:value=>`${value>0?"+":value<0?"−":""}${num(Math.abs(value))} bpm`},
    ];
    const highlights=[];
    const cards=metrics.map(metric=>{
      const recent=period(metric.rows,metric.key,recentStart,recentEnd,metric.aggregate),previous=period(metric.rows,metric.key,previousStart,previousEnd,metric.aggregate),comparable=recent.value!=null&&previous.value!=null,change=comparable?recent.value-previous.value:null;
      if(comparable)highlights.push(`${metric.label.replace(" · medijan","")} ${change===0?"bez promjene":metric.delta(change)}`);
      return `<article class="monthly-review-card"><span>${metric.label}</span><b>${recent.value==null?"Nedovoljno podataka":metric.format(recent.value)}</b><small>Zadnje: ${recent.count}/28 dana${previous.value==null?` · prethodno ${previous.count}/28`:`<br>Prethodno: ${metric.format(previous.value)} · ${previous.count}/28 dana`}</small><small class="monthly-period-delta">${comparable?`Promjena: ${change===0?"bez promjene":metric.delta(change)}`:"Usporedba nije dostupna · potrebno je 14 mjerenja po razdoblju"}</small></article>`;
    });
    const activitySource=payload.sources?.activities,activityUnavailable=activitySource?.ok===false,activityComparison=n.training?.activityComparison28d||{},recentActivityWindow=activityComparison.recent||{},previousActivityWindow=activityComparison.previous||{},sourceComplete=activitySource?.ok===true&&!activitySource?.partial;
    const recentSports=recentActivityWindow.sports||[],previousSports=previousActivityWindow.sports||[],sportMap=new Map([...recentSports,...previousSports].map(row=>[row.key,row]));
    const sportOrder=(activityUnavailable?[]:[...sportMap.keys()]).sort((a,b)=>{
      const currentA=recentSports.find(row=>row.key===a),currentB=recentSports.find(row=>row.key===b);
      return Number(currentB?.durationSeconds||0)-Number(currentA?.durationSeconds||0)||String(sportMap.get(a)?.label||a).localeCompare(String(sportMap.get(b)?.label||b),"hr");
    });
    const countFor=row=>{
      if(!row)return sourceComplete?0:null;
      const count=Number(row.activityCount)||0;
      return activitySource?.partial&&count===0?null:count;
    };
    const completeMetric=(row,metric,coverage)=>{
      const count=Number(row?.activityCount)||0;
      if(count===0&&sourceComplete)return 0;
      if(activitySource?.partial&&count===0)return null;
      if(!row||Number(row[coverage])<count||row[metric]==null)return null;
      return Number(row[metric]);
    };
    const signed=(value,format)=>value===0?"bez promjene":`${value>0?"+":"−"}${format(Math.abs(value))}`;
    const formatCount=value=>`${num(value)} ${value===1?"aktivnost":"aktivnosti"}`;
    const periodText=(row,count,key)=>{
      if(count==null)return "Zapisi nisu potpuni";
      if(count===0)return "0 aktivnosti";
      const parts=[formatCount(count)],seconds=completeMetric(row,"durationSeconds","durationCoverage");
      if(seconds!=null)parts.push(duration(seconds));
      else if(row?.durationCoverage)parts.push(`${num(row.durationCoverage)}/${num(count)} trajanje`);
      if(key!=="sauna"){
        const km=completeMetric(row,"distanceKm","distanceCoverage");
        if(km!=null&&km>0)parts.push(`${num(km,1)} km`);
        else if(row?.distanceCoverage)parts.push(`${num(row.distanceCoverage)}/${num(count)} udaljenost`);
      }
      return `${activitySource?.partial?"Najmanje ":""}${parts.join(" · ")}${activitySource?.partial?" · djelomična povijest":""}`;
    };
    const sportCards=sportOrder.map(key=>{
      const recent=recentSports.find(row=>row.key===key),previous=previousSports.find(row=>row.key===key),label=sportMap.get(key)?.label||key;
      const recentCount=countFor(recent),previousCount=countFor(previous),changes=[];
      if(sourceComplete&&recentCount!=null&&previousCount!=null){
        const countDelta=recentCount-previousCount;
        changes.push(`aktivnosti ${signed(countDelta,value=>num(value))}`);
        const recentDuration=completeMetric(recent,"durationSeconds","durationCoverage"),previousDuration=completeMetric(previous,"durationSeconds","durationCoverage");
        if(recentDuration!=null&&previousDuration!=null)changes.push(`trajanje ${signed(recentDuration-previousDuration,value=>duration(value))}`);
        if(key!=="sauna"){
          const recentKm=completeMetric(recent,"distanceKm","distanceCoverage"),previousKm=completeMetric(previous,"distanceKm","distanceCoverage");
          if(recentKm!=null&&previousKm!=null&&(recentKm>0||previousKm>0))changes.push(`udaljenost ${signed(recentKm-previousKm,value=>`${num(value,1)} km`)}`);
        }
      }
      if(recentCount!=null&&previousCount!=null&&changes.length&&changes[0]!=="aktivnosti bez promjene")highlights.push(`${label}: ${changes[0]}`);
      const primary=recentCount==null?"Nedovoljno podataka":formatCount(recentCount);
      const comparisonText=changes.length?changes.join(" · "):activitySource?.partial?"Usporedba nije pouzdana · djelomična povijest":"Usporedba nije dostupna";
      return `<article class="monthly-review-card monthly-activity-card" data-sport="${escapeHtml(key)}"><span>${escapeHtml(label)}</span><b>${primary}</b><small>Zadnje 28 dana: ${escapeHtml(periodText(recent,recentCount,key))}</small><small>Prethodno: ${escapeHtml(periodText(previous,previousCount,key))}</small><small class="monthly-period-delta">Promjena: ${escapeHtml(comparisonText)}</small></article>`;
    });
    if(activityUnavailable){
      sportCards.push(`<article class="monthly-review-card monthly-activity-card"><span>Garmin aktivnosti</span><b>Nedostupno</b><small>${escapeHtml(activitySource.message||"Povijest aktivnosti trenutačno nije dostupna.")}</small></article>`);
    }else if(!sportOrder.length&&activitySource?.partial){
      sportCards.push('<article class="monthly-review-card monthly-activity-card"><span>Garmin aktivnosti</span><b>Nepotpuna povijest</b><small>Ne mogu potvrditi da u uspoređivanim razdobljima nije bilo aktivnosti.</small></article>');
    }else if(!sportOrder.length){
      sportCards.push('<article class="monthly-review-card monthly-activity-card"><span>Garmin aktivnosti</span><b>Nema aktivnosti</b><small>Nema zabilježenih aktivnosti u oba 28-dnevna razdoblja.</small></article>');
    }
    cards.push(...sportCards);
    $("monthly-review-grid").innerHTML=cards.join("");
    $("monthly-review-highlights").textContent=highlights.length?`Promjene prema prethodnom 28-dnevnom razdoblju: ${highlights.join(" · ")}. Pokrivenost je navedena uz svaku metriku; ovo je opis povijesti, ne procjena spremnosti.`:`Nema usporedivih promjena za istaknuti. Zdravstvene metrike traže najmanje 14 mjerenja po razdoblju; usporedba aktivnosti ovisi o pokriću Garminove povijesti.${activitySource?.partial?" Povijest aktivnosti je djelomična, pa izostanak zapisa ne znači da aktivnosti nije bilo.":""}`;
  };
  const renderGoalRing=(id,value,target,unit,color)=>{
    const current=value==null||!Number.isFinite(Number(value))?null:Math.max(0,Number(value));
    const goal=target==null||!Number.isFinite(Number(target))||Number(target)<=0?null:Number(target);
    const circumference=2*Math.PI*44,ratio=current!=null&&goal!=null?current/goal:null;
    const offset=circumference*(1-Math.min(1,ratio||0));
    const center=current==null?"—":num(current,0);
    const completion=ratio==null?"Cilj nije dostupan":`${num(ratio*100,0)}% cilja`;
    const goalText=goal==null?"Garmin cilj nije dostupan":`Cilj ${num(goal,0)} ${unit}`;
    const targetText=current==null?"Vrijednost nije dostupna":`${num(current,0)} / ${goal==null?"—":num(goal,0)} ${unit}`;
    const element=$(id);element.setAttribute("role","img");element.setAttribute("aria-label",`${targetText}; ${completion}`);
    element.innerHTML=`<div class="goal-ring-layout"><div class="goal-ring-visual"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="goal-ring-track" cx="60" cy="60" r="44"></circle><circle class="goal-ring-progress" cx="60" cy="60" r="44" stroke="${color}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle></svg><div class="goal-ring-center"><b>${center}</b><span>${unit}</span></div></div><div class="goal-ring-copy"><b class="goal-ring-percent">${completion}</b><span>${goalText}</span></div></div>`;
  };
  const calorieBreakdown=(summary,selectedDate)=>{
    const asFinite=value=>value==null||value===""||!Number.isFinite(Number(value))?null:Number(value);
    const active=asFinite(summary.activeCalories),isToday=selectedDate===zagrebToday();
    const resting=isToday?asFinite(summary.previousDayRestingCalories):asFinite(summary.restingCalories);
    return {active,resting,total:active==null||resting==null?null:active+resting,isToday};
  };
  const renderActivityGoals=(recovery,summary,selectedDate)=>{
    renderGoalRing("steps-goal-ring",recovery.steps,recovery.stepGoal,"koraka","#61d5be");
    const moderate=summary.moderateMinutes7d,vigorous=summary.vigorousMinutes7d;
    const intensity=moderate==null&&vigorous==null?null:(Number(moderate)||0)+2*(Number(vigorous)||0);
    renderGoalRing("exercise-goal-ring",intensity,summary.intensityGoalMinutes,"min","#b49afa");
    const calories=calorieBreakdown(summary,selectedDate);
    $("activity-calories-date").textContent=calories.isToday?"Danas":fmtIsoDay(selectedDate);
    $("activity-calories").textContent=calories.active==null?"—":num(calories.active,0)+" kcal";
    if(calories.isToday){
      const activeText=calories.active==null?"Aktivne kalorije danas nisu dostupne.":`Aktivno danas do zadnje sinkronizacije: ${num(calories.active,0)} kcal.`;
      const restingText=calories.resting==null?"Procjena kalorija u mirovanju za puni dan nije dostupna jer nedostaje jučerašnji zapis.":`Procjena kalorija u mirovanju za puni dan: ≈${num(calories.resting,0)} kcal prema jučerašnjem zapisu.`;
      const totalText=calories.total==null?"":` Procijenjeno ukupno danas: ≈${num(calories.total,0)} kcal.`;
      $("activity-calories-context").textContent=`${activeText} ${restingText}${totalText} Cilj aktivnih kalorija nije zadan u Garminovu sažetku.`;
    }else{
      const activeText=calories.active==null?"Aktivne kalorije nisu dostupne.":`${num(calories.active,0)} kcal aktivno`;
      const restingText=calories.resting==null?"kalorije u mirovanju nisu dostupne.":`${num(calories.resting,0)} kcal u mirovanju`;
      const totalText=calories.total==null?"":` = ${num(calories.total,0)} kcal ukupno.`;
      $("activity-calories-context").textContent=`Zapis za ${fmtIsoDay(selectedDate)}: ${activeText} + ${restingText}${totalText}`;
    }
  };
  const renderRunningTrends=(t,activitySource)=>{
    const trend=t.runningTrends90v365||{},recent=trend.recent90d||{},annual=trend.year365d||{};
    const note=$("run-trend-note"),fields=["run-trend-distance","run-trend-frequency","run-trend-pace","run-trend-distance-context","run-trend-frequency-context","run-trend-pace-context"];
    if(activitySource?.ok===false||activitySource?.partial){
      note.textContent=activitySource?.partial?"Garmin povijest je djelomična; trend nije prikazan.":"Garmin povijest trčanja nije dostupna.";
      fields.forEach(id=>$(id).textContent="—");return;
    }
    if(!trend.enoughHistory){
      note.textContent=`Za usporedbu je potrebno najmanje 180 dana aktivnosti; dostupno ${num(trend.historyDays||0)} dana.`;
      fields.forEach(id=>$(id).textContent="—");return;
    }
    note.textContent="Usporedba Garmin trčanja: zadnjih 90 dana prema prosjeku cijelog 365-dnevnog razdoblja. Promjena opisuje volumen i tempo, ne kvalitetu treninga.";
    const change=(value,base)=>base>0?(value/base-1)*100:null;
    const deltaText=value=>changeMarkup(value,value==null?"Promjena —":`Promjena ${value>0?"+":value<0?"−":""}${num(Math.abs(value),0)}%`);
    $("run-trend-distance").textContent=`${num(recent.kmPerWeek,1)} km`;
    $("run-trend-distance-context").innerHTML=`365d ${escapeHtml(num(annual.kmPerWeek,1))} km/tj · ${deltaText(change(recent.kmPerWeek,annual.kmPerWeek))}`;
    $("run-trend-frequency").textContent=`${num(recent.sessionsPerWeek,1)}`;
    $("run-trend-frequency-context").innerHTML=`trčanja/tj · 365d ${escapeHtml(num(annual.sessionsPerWeek,1))} · ${deltaText(change(recent.sessionsPerWeek,annual.sessionsPerWeek))}`;
    $("run-trend-pace").textContent=pace(recent.avgPaceSecondsPerKm);
    const paceDelta=recent.avgPaceSecondsPerKm==null||annual.avgPaceSecondsPerKm==null?null:recent.avgPaceSecondsPerKm-annual.avgPaceSecondsPerKm;
    const paceDeltaLabel=paceDelta==null?"Promjena —":`Promjena ${paceDelta>0?"+":paceDelta<0?"−":""}${pace(Math.abs(paceDelta))}`;
    $("run-trend-pace-context").innerHTML=`365d ${escapeHtml(pace(annual.avgPaceSecondsPerKm))} · ${changeMarkup(paceDelta,paceDeltaLabel)}`;
  };
  const renderGarminTraining=(data,source)=>{
    const metrics=data||{},status=metrics.trainingStatus||null,focus=metrics.loadFocus||null,tolerance=metrics.runningTolerance||null,endurance=metrics.enduranceScore||null,vo2=metrics.vo2Max||null;
    const statusLabels=garminTrainingStatusLabels;
    const statusCode=String(status?.feedback||"").split("_")[0].toUpperCase();
    $("garmin-training-status").textContent=status?statusLabels[statusCode]||statusCode.replaceAll("_"," ")||"Status dostupan":"—";
    $("garmin-training-sport").textContent=status?`${String(status.sport||"").toUpperCase()==="RUNNING"?"Trčanje":humanType(status.sport)} · Garminov status`:source?.message||"Garmin Connect status nije dostupan za ovaj datum.";
    $("garmin-training-status-date").textContent=status?`Garmin · ${fmtIsoDay(status.date||metrics.date)}`:"Garmin · nedostupno";
    const acwrLabels=garminAcwrStatusLabels,acwrCode=String(status?.acwrStatus||"").toUpperCase();
    $("garmin-acute-load").textContent=status?.acuteLoad==null?"—":num(status.acuteLoad,0);
    $("garmin-chronic-load").textContent=status?.chronicLoad==null?"—":num(status.chronicLoad,0);
    $("garmin-acwr").textContent=status?.loadRatio==null?"—":`${num(status.loadRatio,2)}${acwrCode?` · ${acwrLabels[acwrCode]||acwrCode.replaceAll("_"," ")}`:""}`;
    $("garmin-chronic-range").textContent=status?.chronicLoadMin==null||status?.chronicLoadMax==null?"—":`${num(status.chronicLoadMin,0)}–${num(status.chronicLoadMax,0)}`;
    $("garmin-training-status-note").textContent=status?`Garminov omjer akutnog i kroničnog opterećenja: ${status.loadRatio==null?"nije dostupan":num(status.loadRatio,2)} · ${garminAcwrStatusLabels[String(status.acwrStatus||"").toUpperCase()]||"status nije dostupan"}. Kronični optimalni raspon: ${status.chronicLoadMin==null||status.chronicLoadMax==null?"nije dostupan":`${num(status.chronicLoadMin,0)}–${num(status.chronicLoadMax,0)}`}.`:source?.message||"Nema Garmin Training Status podataka za odabrani datum.";

    const vo2Chart=$("garmin-vo2max-chart"),vo2History=Array.isArray(vo2?.history)?vo2.history:[],vo2Values=vo2History.filter(point=>point.value!=null&&Number.isFinite(Number(point.value)));
    disposeChartsInside(vo2Chart);
    $("garmin-vo2max-value").textContent=vo2?.value==null?"—":num(vo2.value,1);
    $("garmin-vo2max-date").textContent=vo2?`Garmin · ${num(vo2.windowDays||90)} dana`:"Garmin · nedostupno";
    const vo2Change=vo2?.change==null?null:Number(vo2.change);
    $("garmin-vo2max-change").textContent=vo2Change==null?"—":`${vo2Change>0?"+":vo2Change<0?"−":""}${num(Math.abs(vo2Change),1)}`;
    $("garmin-vo2max-coverage").textContent=vo2?`${num(vo2.dataDays)}/${num(vo2.windowDays||90)}`:"—";
    $("garmin-vo2max-range").textContent=vo2?.startDate&&vo2?.endDate?`${fmtIsoDay(vo2.startDate)} – ${fmtIsoDay(vo2.endDate)}`:"—";
    if(vo2Values.length>=2){
      renderLineChart("garmin-vo2max-chart",vo2History,"value",{color:"#69d7ef",height:190,unit:" ml/kg/min",dateKey:"date",formatValue:value=>num(value,1),zoom:true,connectNulls:true,ariaLabel:"Garminova dnevna procjena VO₂ max za trčanje tijekom zadnjih 90 dana",sourceLabel:"Garmin Connect"},"VO₂ max · trčanje");
      $("garmin-vo2max-note").textContent="Garminova trkačka procjena. Linija povezuje samo zabilježena mjerenja; dani bez podatka nemaju vlastitu procjenu.";
    }else{
      vo2Chart.innerHTML=`<div class="empty-chart">${vo2Values.length===1?"Dostupan je jedan Garminov zapis; trend će se prikazati kada bude dostupna još jedna vrijednost.":escapeHtml(source?.message||"Garmin Connect nije vratio povijesni VO₂ max za trčanje.")}</div>`;
      $("garmin-vo2max-note").textContent="VO₂ max je Garminova procjena trkačke aerobne sposobnosti; ne predstavlja laboratorijski izmjeren rezultat.";
    }

    const focusLabels={AEROBIC_HIGH_SHORTAGE:"Nedostaje visok aerobni load",AEROBIC_LOW_SHORTAGE:"Nedostaje niski aerobni load",ANAEROBIC_SHORTAGE:"Nedostaje anaerobni load",BALANCED:"Raspodjela je uravnotežena"};
    const focusCode=String(focus?.feedback||"").toUpperCase();
    $("garmin-load-focus-feedback").textContent=focus?focusLabels[focusCode]||focusCode.replaceAll("_"," ")||"Garmin · 4 tjedna":"Garmin · nedostupno";
    const focusStatusLabels={below:"Ispod cilja",within:"U ciljnom rasponu",above:"Iznad cilja"};
    const focusStatusTone={below:"below",within:"within",above:"above"};
    const bands=focus?.bands||{};
    const focusRows=["aerobicLow","aerobicHigh","anaerobic"].map(key=>{
      const band=bands[key];if(!band||band.load==null)return `<div class="load-focus-band unavailable"><div class="load-focus-band-head"><b>${escapeHtml(band?.label||key)}</b><span>Podatak nije dostupan</span></div></div>`;
      const scale=Math.max(Number(band.load)||0,Number(band.targetMax)||0,1)*1.12,start=Math.max(0,Math.min(100,(Number(band.targetMin)||0)/scale*100)),width=Math.max(0,Math.min(100-start,((Number(band.targetMax)||0)-(Number(band.targetMin)||0))/scale*100)),marker=Math.max(0,Math.min(100,(Number(band.load)||0)/scale*100)),state=focusStatusTone[band.status]||"unavailable",target=band.targetMin==null||band.targetMax==null?"Ciljni raspon nije dostupan":`Cilj ${num(band.targetMin,0)}–${num(band.targetMax,0)}`;
      return `<div class="load-focus-band" data-state="${state}"><div class="load-focus-band-head"><b>${escapeHtml(band.label||key)}</b><strong>${num(band.load,0)}</strong></div><div class="load-focus-track" role="img" aria-label="${escapeHtml(band.label||key)}: ${escapeHtml(focusStatusLabels[band.status]||"status nije dostupan")}"><i class="load-focus-target" style="left:${start}%;width:${width}%"></i><b class="load-focus-marker" style="left:${marker}%"></b></div><div class="load-focus-band-foot"><span>${target}</span><em>${focusStatusLabels[band.status]||"Status nije dostupan"}</em></div></div>`;
    });
    $("garmin-load-focus-bands").innerHTML=focusRows.join("");

    const impactChart=$("running-tolerance-chart"),toleranceHistory=Array.isArray(tolerance?.history)?tolerance.history:[];
    if(tolerance){
      const used=Number(tolerance.usedPercent),ratio=Number.isFinite(used)?used:null,over=tolerance.status==="above";
      $("running-tolerance-feedback").textContent=String(tolerance.feedback||"").toUpperCase()==="MEDIUM_LOAD"?"Srednje opterećenje":String(tolerance.feedback||"").replaceAll("_"," ")||"Garmin · 28 dana";
      $("running-tolerance-feedback").dataset.state=over?"above":"within";
      $("running-tolerance-load").textContent=`${num(tolerance.acuteImpactLoadKm,1)} km`;
      $("running-tolerance-usage").textContent=ratio==null?"—":`${num(ratio,0)}% tolerancije`;
      $("running-tolerance-limit").textContent=tolerance.acuteToleranceKm==null?"—":`${num(tolerance.acuteToleranceKm,1)} km`;
      $("running-tolerance-distance").textContent=tolerance.acuteDistanceKm==null?"—":`${num(tolerance.acuteDistanceKm,1)} km`;
      $("running-tolerance-status").textContent=ratio==null?"—":over?"Iznad tolerancije":"Unutar tolerancije";
      $("running-tolerance-fill").style.width=`${Math.max(0,Math.min(100,ratio||0))}%`;
      $("running-tolerance-fill").parentElement.dataset.state=over?"above":ratio!=null&&ratio>=80?"near":"within";
      if(toleranceHistory.length>1)renderPairLineChart("running-tolerance-chart",toleranceHistory,"acuteImpactLoadKm","acuteToleranceKm",chartColors.violet,chartColors.cyan,"Akutni impact load · km","Tolerancija · km","Running Tolerance · Garmin · 28 dana",{sourceLabel:"Garmin Connect",unit:"km"});
      else impactChart.innerHTML='<div class="empty-chart">Nema dovoljno Garminovih zapisa za trend.</div>';
    }else{
      $("running-tolerance-feedback").textContent="Garmin · nedostupno";$("running-tolerance-load").textContent="—";$("running-tolerance-usage").textContent="—";$("running-tolerance-limit").textContent="—";$("running-tolerance-distance").textContent="—";$("running-tolerance-status").textContent="Nema podataka";$("running-tolerance-fill").style.width="0%";impactChart.innerHTML=`<div class="empty-chart">${escapeHtml(source?.message||"Running Tolerance nije dostupan za odabrani datum.")}</div>`;
    }

    const enduranceChart=$("endurance-score-chart"),enduranceHistory=Array.isArray(endurance?.history)?endurance.history:[];
    const scoreValues=enduranceHistory.map(point=>point.score==null?NaN:Number(point.score)).filter(Number.isFinite),firstScore=scoreValues[0],lastScore=scoreValues.at(-1),scoreDelta=scoreValues.length>1?lastScore-firstScore:null;
    $("endurance-score-date").textContent=endurance?`Garmin · ${fmtIsoDay(endurance.date||metrics.date)}`:"Garmin · nedostupno";
    $("endurance-score-value").textContent=endurance?.score==null?"—":num(endurance.score,0);
    $("endurance-score-class").textContent=endurance?.classification?.label||source?.message||"Garminova procjena izdržljivosti";
    $("endurance-score-average").textContent=endurance?.periodAverage==null?"—":num(endurance.periodAverage,0);
    $("endurance-score-maximum").textContent=endurance?.periodMax==null?"—":num(endurance.periodMax,0);
    $("endurance-score-change").textContent=scoreDelta==null?"—":`${scoreDelta>0?"+":""}${num(scoreDelta,0)}`;
    if(enduranceHistory.length>1)renderLineChart("endurance-score-chart",enduranceHistory,"score",{color:"#b9a2fa",height:130,formatValue:x=>num(x,0),dateKey:"date",ariaLabel:"Garmin Endurance Score tijekom zadnjih 28 dana",sourceLabel:"Garmin Connect"},"Endurance Score");
    else enduranceChart.innerHTML='<div class="empty-chart">Nema dovoljno Garminovih zapisa za trend.</div>';
  };
  const renderZoneComparison=(training,activitySource)=>{
    const comparison=training.heartRateZoneComparison28d||{},recent=comparison.recent||{},previous=comparison.previous||{},chart=$("hr-zone-comparison-chart"),recentZones=recent.zones||[],previousZones=previous.zones||[],recentReady=Number(recent.totalSeconds)>0,previousReady=Number(previous.totalSeconds)>0;
    disposeChartsInside(chart);
    if(activitySource?.ok===false){$("hr-zone-comparison-coverage").textContent="Nedostupno";chart.innerHTML='<div class="empty-chart">Garminova povijest aktivnosti nije dostupna.</div>';$("hr-zone-comparison-note").textContent=activitySource.message||"Osvježi podatke da bi se zone aktivnosti mogle usporediti.";return;}
    $("hr-zone-comparison-coverage").textContent=`${num(recent.coveredRuns)}/${num(recent.runCount)} · ${num(previous.coveredRuns)}/${num(previous.runCount)} trčanja`;
    if(recentReady||previousReady){
      renderHeartRateZoneComparison("hr-zone-comparison-chart",recentZones,previousZones);
      const currentCoverage=`zadnja 4 tjedna ${num(recent.coveredRuns)}/${num(recent.runCount)}`,priorCoverage=`prethodna 4 tjedna ${num(previous.coveredRuns)}/${num(previous.runCount)}`;
      $("hr-zone-comparison-note").textContent=`Udio se računa samo iz trčanja s dostupnim Garminovim zonama pulsa: ${currentCoverage} · ${priorCoverage}.${activitySource?.partial?" Garminova povijest aktivnosti je djelomična.":""}`;
    }else{
      chart.innerHTML='<div class="empty-chart">Nema Garminovih podataka o zonama pulsa za usporedbu ovih razdoblja.</div>';
      $("hr-zone-comparison-note").textContent=activitySource?.partial?"Povijest aktivnosti je djelomična; neki zapisi možda nedostaju.":"Vrijeme u zonama prikazuje se kad ga Garmin vrati u sažecima trčanja.";
    }
  };
  let performanceTimelineMode="load",performanceTimelineInputs=null;
  const renderPerformanceTimeline=()=>{
    if(!performanceTimelineInputs)return;
    const {training,activitySource}=performanceTimelineInputs,mode=performanceTimelineMode;
    document.querySelectorAll("[data-performance-timeline]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.performanceTimeline===mode)));
    if(activitySource?.ok===false||activitySource?.partial){disposeChartsInside($("performance-timeline-chart"));$("performance-timeline-chart").innerHTML=`<div class="empty-chart">${activitySource?.ok===false?"Garminova povijest aktivnosti nije dostupna.":"Povijest aktivnosti je djelomična; vremenska crta bi mogla prikazati nedostajuće dane kao nulto opterećenje."}</div>`;$("performance-timeline-context").textContent=activitySource?.ok===false?activitySource.message||"Opterećenje i trendovi aktivnosti prikazat će se nakon uspješnog dohvaćanja povijesti.":"Vremenska crta je privremeno skrivena dok povijest aktivnosti nije potpuna.";return;}
    let points=[],series=[],unit="",description="",sourceLabel="Garmin aktivnosti",dateKey="date",endDateKey;
    if(mode==="load"){
      points=training.dailyLoadTrend||[];unit="load";
      series=[
        {key:"run7d",label:"Trčanje · 7d",color:"#69d7ef",formatValue:value=>num(value,1)},
        {key:"run42d",label:"Trčanje · 42d",color:"#b9a2fa",formatValue:value=>num(value,1)},
        {key:"allActivity7d",label:"Sve · 7d",color:chartColors.sky,formatValue:value=>num(value,1),initiallySelected:false},
        {key:"allActivity42d",label:"Sve · 42d",color:chartColors.plum,formatValue:value=>num(value,1),initiallySelected:false},
      ];
      description=`Garminov eksponencijalni load kroz 7 i 42 dana · “Sve” uključuje sve sportove · ${num(training.loadHistoryDays)} dana povijesti.${activitySource?.partial?" Povijest aktivnosti je djelomična.":""}`;
      sourceLabel="Garmin activity load";
    }else{
      points=(training.performanceTrends52w||[]).map(point=>({...point,date:point.start}));
      endDateKey="end";
      if(mode==="distance"){
        unit="km";
        series=[{key:"distanceKm",label:"Kilometraža / tjedan",color:"#69d7ef",formatValue:value=>num(value,1)}];
        description=`Ukupna udaljenost po kalendarskom tjednu · 52 tjedna.${activitySource?.partial?" Povijest aktivnosti je djelomična; prazna razdoblja mogu značiti nedostupne zapise.":""}`;
      }else{
        unit="/km";
        series=[{key:"avgPaceSecondsPerKm",label:"Prosječni tempo",color:"#b9a2fa",formatValue:value=>pace(value).replace("/km","")}];
        description=`Tjedni prosječni tempo trčanja · niža vrijednost znači brži tempo.${activitySource?.partial?" Povijest aktivnosti je djelomična.":""}`;
      }
    }
    $("performance-timeline-context").textContent=description;
    renderTimelineSeriesChart("performance-timeline-chart",points,series,{height:245,dateKey,endDateKey,unit,zoom:true,ariaLabel:`Garminova vremenska crta: ${mode==="load"?"trenažno opterećenje":mode==="distance"?"tjedna kilometraža":"prosječni tempo"}`,sourceLabel},mode==="load"?"Garmin activity load":mode==="distance"?"Tjedna kilometraža":"Prosječni tempo");
  };
  document.querySelectorAll("[data-performance-timeline]").forEach(button=>button.addEventListener("click",()=>{performanceTimelineMode=button.dataset.performanceTimeline;renderPerformanceTimeline()}));
  const renderPerformance=(t,range,activitySource)=>{
    renderZoneComparison(t,activitySource);
    const noObservedActivity=activitySource?.partial&&Number(t.activityCount365d)===0;
    $("load-base-28").textContent=activitySource?.ok===false||noObservedActivity||t.trainingLoadPrevious28dWeeklyAverage==null?"—":num(t.trainingLoadPrevious28dWeeklyAverage,0);
    $("load-ratio-28").textContent=activitySource?.ok===false||noObservedActivity||t.trainingLoadVsPrevious28dRatio==null?"—":num(t.trainingLoadVsPrevious28dRatio,2);
    const trends=t.performanceTrends52w||[];
    $("performance-history").textContent=activitySource?.ok===false?"Garminova povijest aktivnosti nije dostupna":activitySource?.partial&&Number(t.activityCount365d)===0?"Djelomična povijest; broj aktivnosti nije moguće potvrditi":`${activitySource?.partial?"Najmanje ":""}${t.activityCount365d==null?"—":num(t.activityCount365d)} aktivnosti · podaci od ${fmtIsoDay(range?.activityStart||trends[0]?.start||"")} do ${fmtIsoDay(range?.end||trends.at(-1)?.end||"")}${activitySource?.partial?" · djelomična povijest":""}`;
    performanceTimelineInputs={training:t,range,activitySource};renderPerformanceTimeline();
    $("load-history-note").textContent="Lokalni Garmin activity load iz dostupnih aktivnosti · "+num(t.loadHistoryDays)+" dana. Linije su eksponencijalni prosjeci kroz 7 i 42 dana; nisu Garminov Training Status.";
    $("all-load-7").textContent=activitySource?.ok===false||noObservedActivity||t.allActivityLoad7d==null?"—":num(t.allActivityLoad7d,0);
    $("other-load-7").textContent=activitySource?.ok===false||noObservedActivity||t.otherSportLoad7d==null?"—":num(t.otherSportLoad7d,0);
    $("other-count-7").textContent=activitySource?.ok===false?"—":activitySource?.partial&&Number(t.otherSportCount7d)===0?"—":num(t.otherSportCount7d);
    $("all-load-base").textContent=activitySource?.ok===false||noObservedActivity||t.allActivityLoadPrevious21dWeeklyAverage==null?"—":num(t.allActivityLoadPrevious21dWeeklyAverage,0);
    if(activitySource?.ok===false){$("load-history-note").textContent=activitySource.message||"Garminova povijest aktivnosti nije dostupna; load trend nije izračunljiv.";}else if(activitySource?.partial){$("load-history-note").textContent="Povijest aktivnosti je djelomična; prikazane vrijednosti opisuju samo dostupne zapise.";}

    const comparison=t.performanceComparison28d||{},recent=comparison.recent||{},previous=comparison.previous||{};
    const endDate=range?.end?new Date(`${range.end}T12:00:00`):null;
    const shift=(value,days)=>{const shifted=new Date(value);shifted.setDate(shifted.getDate()+days);return shifted;};
    const dateFormat=new Intl.DateTimeFormat("hr-HR",{day:"2-digit",month:"2-digit"});
    let currentRangeText="Razdoblje od 28 dana",previousRangeText="Razdoblje od 28 dana";
    if(endDate&&!Number.isNaN(endDate.valueOf())){
      const currentStart=shift(endDate,-27),previousEnd=shift(currentStart,-1),previousStart=shift(previousEnd,-27);
      currentRangeText=`${dateFormat.format(currentStart)} – ${dateFormat.format(endDate)}`;
      previousRangeText=`${dateFormat.format(previousStart)} – ${dateFormat.format(previousEnd)}`;
      $("performance-current-range-date").textContent=currentRangeText;
      $("performance-current-range-count").textContent=activitySource?.ok===false?"Povijest nedostupna":activitySource?.partial&&Number(recent.runCount)===0?"Djelomična povijest · nema zapisa":activitySource?.partial?`Zabilježeno najmanje ${num(recent.runCount)} trčanja`:`Broj trčanja: ${num(recent.runCount)}`;
      $("performance-previous-range-date").textContent=previousRangeText;
      $("performance-previous-range-count").textContent=activitySource?.ok===false?"Povijest nedostupna":activitySource?.partial&&Number(previous.runCount)===0?"Djelomična povijest · nema zapisa":activitySource?.partial?`Zabilježeno najmanje ${num(previous.runCount)} trčanja`:`Broj trčanja: ${num(previous.runCount)}`;
    }else{
      $("performance-current-range-date").textContent=currentRangeText;
      $("performance-current-range-count").textContent=activitySource?.ok===false?"Povijest nedostupna":activitySource?.partial&&Number(recent.runCount)===0?"Djelomična povijest · nema zapisa":activitySource?.partial?`Zabilježeno najmanje ${num(recent.runCount)} trčanja`:`Broj trčanja: ${num(recent.runCount)}`;
      $("performance-previous-range-date").textContent=previousRangeText;
      $("performance-previous-range-count").textContent=activitySource?.ok===false?"Povijest nedostupna":activitySource?.partial&&Number(previous.runCount)===0?"Djelomična povijest · nema zapisa":activitySource?.partial?`Zabilježeno najmanje ${num(previous.runCount)} trčanja`:`Broj trčanja: ${num(previous.runCount)}`;
    }
    const rows=[
      {label:"Kilometraža",key:"distanceKm",format:value=>num(value,1)+" km"},
      {label:"Broj trčanja",key:"runCount",format:value=>num(value)},
      {label:"Prosječni tempo",key:"avgPaceSecondsPerKm",format:value=>pace(value)},
      {label:"Prosječni puls",key:"avgHeartRate",format:value=>num(value)+" bpm"},
      {label:"Kadenca",key:"avgCadence",format:value=>num(value)+" spm"},
      {label:"Snaga",key:"avgPower",format:value=>num(value)+" W"},
      {label:"Duljina koraka",key:"avgStrideLength",format:value=>num(value,2)+" m"},
      {label:"Ground contact",key:"avgGroundContactTime",format:value=>num(value)+" ms"},
      {label:"Vertical oscillation",key:"avgVerticalOscillation",format:value=>num(value,1)+" cm"},
      {label:"Vertical ratio",key:"avgVerticalRatio",format:value=>num(value,1)+"%"},
    ];
    const currentCellLabel="Posljednja 4 tjedna",previousCellLabel="Prethodna 4 tjedna";
    const renderCell=(period,row,periodLabel)=>{
      const value=period[row.key];
      if(activitySource?.ok===false)return `<td data-label="${escapeHtml(periodLabel)}"><span class="performance-missing">—</span><small class="performance-missing-note">Garminova povijest nije dostupna</small></td>`;
      if(activitySource?.partial&&Number(period.runCount)===0)return `<td data-label="${escapeHtml(periodLabel)}"><span class="performance-missing">—</span><small class="performance-missing-note">Nema zapisa u dostupnoj, djelomičnoj povijesti</small></td>`;
      if(value!=null)return `<td data-label="${escapeHtml(periodLabel)}"><span class="performance-value">${escapeHtml(row.format(value))}</span></td>`;
      const runs=Number(period.runCount)||0,recorded=period.sampleCounts?.[row.key];
      const metric=row.key==="avgHeartRate"?"pulsa":row.key==="avgPaceSecondsPerKm"?"tempa":"ove metrike";
      const context=activitySource?.ok===false?"Garminova povijest nije dostupna":runs===0?(activitySource?.partial?"Nema trčanja u dostupnim podacima":"Nema trčanja u ovom razdoblju"):recorded==null?"Broj dostupnih zapisa nije poznat":recorded===0?`Nema zapisa ${metric} · 0/${runs} trčanja`:`Zabilježeno u ${num(recorded)}/${num(runs)} trčanja`;
      return `<td data-label="${escapeHtml(periodLabel)}"><span class="performance-missing">—</span><small class="performance-missing-note">${escapeHtml(context)}</small></td>`;
    };
    $("performance-dynamics").innerHTML=rows.map(row=>`<tr><td>${escapeHtml(row.label)}</td>${renderCell(recent,row,currentCellLabel)}${renderCell(previous,row,previousCellLabel)}</tr>`).join("");
    const recentSamples=recent.sampleCounts?.avgHeartRate??0,previousSamples=previous.sampleCounts?.avgHeartRate??0;
    const explanation=activitySource?.ok===false?["Garminova povijest aktivnosti nije dostupna; usporedne vrijednosti privremeno su skrivene."]:[
      "Uspoređuju se Garminova trčanja iz posljednja 4 tjedna i 4 tjedna prije njih. Broj trčanja uz svaki naslov pokazuje koliko je aktivnosti uključeno.",
      `Prosječni puls zabilježen je u ${num(recentSamples)}/${num(recent.runCount)} i ${num(previousSamples)}/${num(previous.runCount)} trčanja; prosjek je ponderiran trajanjem.`,
      "— znači da nema izračunate vrijednosti; oznaka ispod objašnjava je li zapis izostao ili u razdoblju nije bilo trčanja.",
      "Različite udaljenosti, intenzitet i podloga utječu na usporedbu.",
    ];
    if(activitySource?.partial)explanation.unshift("Garminova povijest je djelomična.");
    $("performance-dynamics-note").textContent=explanation.join(" ");
  };
  const renderBaseline=(normalized,recovery,sleep)=>{
    const baseline=normalized.personalRecoveryBaseline||{},hrv=baseline.hrv||{},rhr=baseline.restingHeartRate||{},sleepMetric=baseline.sleep||{};
    const valueText=(metric,unit,formatter=num)=>metric.current==null||metric.median28d==null?"—":formatter(metric.current)+unit+" / "+formatter(metric.median28d)+unit;
    const sampleText=(metric,formatter=num)=>{
      const delta=metric.delta,formatted=delta==null?"Promjena —":`Promjena ${delta>0?"+":delta<0?"−":""}${formatter(Math.abs(delta))}`;
      return `${changeMarkup(delta,formatted)} · ${num(metric.sampleDays)}/28 dana`;
    };
    $("baseline-hrv").textContent=valueText(hrv," ms");$("baseline-hrv-delta").innerHTML=sampleText(hrv);
    $("baseline-rhr").textContent=valueText(rhr," bpm");$("baseline-rhr-delta").innerHTML=sampleText(rhr);
    $("baseline-sleep").textContent=valueText(sleepMetric,"",duration);$("baseline-sleep-delta").innerHTML=sampleText(sleepMetric,value=>duration(value));
    $("baseline-window").textContent=baseline.windowStart?fmtIsoDay(baseline.windowStart)+" — "+fmtIsoDay(baseline.windowEnd):"—";
    const skin=latestSkinTemperature?.date===lastDashboardPayload?.date?latestSkinTemperature:null;
    const skinContext=$("overview-skin-context");
    if(skinContext) skinContext.textContent=skin?.currentDeviationC==null
      ? "Temperatura kože · nema noćnog zapisa za odabrani datum"
      : `Temperatura kože · ${(skin.currentDeviationC>0?"+":"")+num(skin.currentDeviationC,1)+" °C"} od Garminove baze`;

  };
  const refreshPersonalContext=()=>{
    if(!lastDashboardPayload)return;
    renderBaseline(lastDashboardPayload.normalized||{},lastDashboardPayload.normalized?.recovery||{},lastDashboardPayload.normalized?.sleep||{});
  };
  let activityController=null,visibleActivities=[],selectedActivityId=null,selectedTraceMetric="heartRate";
  const activityDetailCache=new Map();
  const activityMetric=(label,value)=>`<div class="activity-stat"><b>${value}</b><span>${label}</span></div>`;
  const activityTraceMetrics=[
    {key:"heartRate",label:"Puls",unit:"bpm",color:chartColors.sky,title:"Puls tijekom aktivnosti",format:value=>num(value,0)},
    {key:"paceSecondsPerKm",label:"Tempo",unit:"/km",color:"#b9a2fa",title:"Tempo tijekom trčanja",format:value=>pace(value).replace("/km","")},
    {key:"powerWatts",label:"Snaga",unit:"W",color:chartColors.cyan,title:"Snaga tijekom aktivnosti",format:value=>num(value,0)},
  ];
  const renderActivityCard=(activity={},detail={},message=null,loading=false)=>{
    const isSauna=Boolean(activity.isSauna)||/sauna/i.test(String(activity.name||"")+" "+String(activity.type||"")),isRun=!isSauna&&Boolean(activity.isRun),distance=[detail.distanceMeters,activity.distanceMeters].map(Number).find(value=>Number.isFinite(value)&&value>0),durationSeconds=[detail.durationSeconds,activity.durationSeconds].map(Number).find(value=>Number.isFinite(value)&&value>0),averageHeartRate=detail.averageHeartRate??activity.avgHeartRate,maxHeartRate=detail.maxHeartRate??activity.maxHeartRate,calories=detail.calories??activity.calories,trainingLoad=detail.trainingLoad??activity.trainingLoad,ascent=detail.elevationGain??activity.elevationGain,paceSeconds=activity.paceSecondsPerKm??(distance&&durationSeconds?durationSeconds*1000/distance:null),effect=detail.aerobicTrainingEffect??activity.trainingEffect;
    const kind=isSauna?`<span class="activity-kind sauna">🧖 SAUNA</span>`:isRun?`<span class="activity-kind run">🏃 TRČANJE</span>`:`<span class="activity-kind">${escapeHtml(humanType(activity.type))}</span>`;
    const aerobicEffect=detail.aerobicTrainingEffect??activity.trainingEffect;
    const extras=[trainingLoad!=null?`Load ${num(trainingLoad,0)}`:"",aerobicEffect!=null?`Aerobic TE ${num(aerobicEffect,1)}`:"",detail.anaerobicTrainingEffect!=null?`Anaerobic TE ${num(detail.anaerobicTrainingEffect,1)}`:""].filter(Boolean);
    $("activity-name").textContent=activity.name||humanType(activity.type)||"Aktivnost";
    $("activity-type").innerHTML=kind+(extras.length?` · ${extras.map(escapeHtml).join(" · ")}`:"");
    $("activity-date").textContent=fmtIsoDay(String(activity.date||"").slice(0,10));
    const localRpe=detail.localRpe||null;
    $("activity-rpe").value=localRpe?.rpe??"";$("activity-rpe-note").value=localRpe?.note??"";
    $("activity-rpe-save").disabled=!activity.id;
    $("activity-rpe-status").textContent=activity.id?(localRpe?.updatedAt?`Spremljeno · ${fmtDateTime(localRpe.updatedAt)}`:"Procjena se sprema lokalno uz ovu aktivnost."):
      "Odaberi aktivnost za unos procjene.";
    const gear=detail.gear||{},gearItems=gear.items||[];
    $("activity-gear-items").innerHTML=loading?'<div class="quiet">Dohvaćam Garmin opremu…</div>':!gear.available?`<div class="quiet">${escapeHtml(gear.message||message||"Garminova oprema nije dostupna za ovu aktivnost.")}</div>`:gearItems.length?gearItems.map(item=>{
      const metrics=[item.totalDistanceKm!=null?`${num(item.totalDistanceKm,1)} km ukupno`:"",item.totalActivities!=null?`${num(item.totalActivities)} aktivnosti`:"",item.maximumDistanceKm!=null?`prag ${num(item.maximumDistanceKm,0)} km`:"",item.remainingDistanceKm!=null?`preostalo ${num(item.remainingDistanceKm,0)} km`:"",item.usagePercent!=null?`${num(item.usagePercent,0)}% praga`:""].filter(Boolean);
      return`<div class="gear-item"><div><b>${escapeHtml(item.name||"Oprema")}</b><span>${escapeHtml(item.type||item.status||"Garmin oprema")}</span></div><div class="gear-item-metrics">${metrics.length?metrics.map(value=>`<span>${escapeHtml(value)}</span>`).join(""):'<span>Garmin nije vratio statistiku korištenja.</span>'}</div>${item.usagePercent!=null?`<div class="progress gear-progress"><i style="width:${Math.max(0,Math.min(100,Number(item.usagePercent)||0))}%"></i></div>`:""}</div>`;
    }).join(""):'<div class="quiet">Za ovu aktivnost Garmin nije povezao opremu.</div>';
    const metrics=[];
    if(distance!=null&&(isRun||!isSauna))metrics.push(activityMetric("Udaljenost",`${num(distance/1000,2)} km`));
    if(durationSeconds!=null)metrics.push(activityMetric("Trajanje",duration(durationSeconds,true)));
    if(isRun&&paceSeconds!=null)metrics.push(activityMetric("Prosječni tempo",pace(paceSeconds)));
    if(!isRun&&!isSauna&&distance!=null&&durationSeconds!=null)metrics.push(activityMetric("Prosječna brzina",`${num(distance/durationSeconds*3.6,1)} km/h`));
    if(averageHeartRate!=null)metrics.push(activityMetric("Prosječni puls",`${num(averageHeartRate)} bpm`));
    if(maxHeartRate!=null)metrics.push(activityMetric("Maksimalni puls",`${num(maxHeartRate)} bpm`));
    if(calories!=null)metrics.push(activityMetric("Kalorije",`${num(calories,0)} kcal`));
    if(trainingLoad!=null)metrics.push(activityMetric("Training load",num(trainingLoad,0)));
    if(isRun){
      if(detail.averageCadence??activity.averageCadence)metrics.push(activityMetric("Kadenca",`${num(detail.averageCadence??activity.averageCadence)} spm`));
      if(detail.strideLength??activity.strideLength)metrics.push(activityMetric("Duljina koraka",`${num(detail.strideLength??activity.strideLength,2)} m`));
      if(detail.groundContactTime??activity.groundContactTime)metrics.push(activityMetric("Ground contact",`${num(detail.groundContactTime??activity.groundContactTime)} ms`));
      if(detail.averagePower??activity.averagePower)metrics.push(activityMetric("Prosječna snaga",`${num(detail.averagePower??activity.averagePower)} W`));
      if(detail.verticalOscillation??activity.verticalOscillation)metrics.push(activityMetric("Vertical oscillation",`${num(detail.verticalOscillation??activity.verticalOscillation,1)} cm`));
      if(detail.verticalRatio??activity.verticalRatio)metrics.push(activityMetric("Vertical ratio",`${num(detail.verticalRatio??activity.verticalRatio,1)}%`));
    }
    if(!isSauna&&ascent!=null&&Number(ascent)>0)metrics.push(activityMetric("Uspon",`${num(ascent)} m`));
    if(!isSauna&&detail.avgRespirationRate!=null)metrics.push(activityMetric("Disanje",`${num(detail.avgRespirationRate,1)} /min`));
    $("activity-grid").innerHTML=metrics.join("")||'<div class="quiet">Garmin nije vratio metrike za ovu aktivnost.</div>';
    const stamina=[detail.beginPotentialStamina,detail.endPotentialStamina,detail.minAvailableStamina].some(value=>value!=null);
    $("activity-stamina").textContent=isRun&&stamina?`Potential stamina · start ${num(detail.beginPotentialStamina)}% · kraj ${num(detail.endPotentialStamina)}% · minimum ${num(detail.minAvailableStamina)}%${detail.directWorkoutRpe!=null?` · RPE ${num(detail.directWorkoutRpe)}`:""}`:"";
    const workouts=Array.isArray(detail.workouts)?detail.workouts:[];
    const workoutHtml=workouts.map(workout=>`<div class="note"><b>${escapeHtml(workout.name||"Strukturirani trening")}</b>${(workout.steps||[]).map((step,index)=>`<div class="kv"><span>${num(step.index??index+1)} · ${escapeHtml(step.name||step.intensity||"Korak")}</span><b>${escapeHtml(step.durationType||"")} ${step.durationValue==null?"":num(step.durationValue,1)} · ${escapeHtml(step.targetType||"")}${step.targetValue==null?"":` ${num(step.targetValue,1)}`}${step.targetLow!=null||step.targetHigh!=null?` (${num(step.targetLow)}–${num(step.targetHigh)})`:""}</b></div>${step.notes?`<div class="quiet">${escapeHtml(step.notes)}</div>`:""}`).join("")}</div>`).join("");
    const splits=Array.isArray(detail.splits)?detail.splits:[];
    const splitTable=splits.length?`<div class="table-wrap"><table><thead><tr><th>Dio</th><th>Udaljenost</th><th>Vrijeme</th><th>Tempo</th><th>Puls</th></tr></thead><tbody>${splits.map((split,index)=>`<tr><td>${num(split.split??index+1)}</td><td>${split.distanceMeters==null?"—":`${num(Number(split.distanceMeters)/1000,2)} km`}</td><td>${duration(split.durationSeconds,true)}</td><td>${split.paceSecondsPerKm==null?"—":pace(split.paceSecondsPerKm)}</td><td>${split.averageHeartRate==null?"—":`${num(split.averageHeartRate)} bpm`}</td></tr>`).join("")}</tbody></table></div>`:"";
    $("activity-steps").innerHTML=splitTable+workoutHtml||`<div class="note">Garmin nije vratio splitove ni strukturirane korake za ovu aktivnost.</div>`;
    $("activity-steps").closest("details").hidden=isSauna||(!splits.length&&!workouts.length);
    const trace=Array.isArray(detail.trace)?detail.trace:[],traceMetrics=activityTraceMetrics.filter(metric=>(isRun||metric.key!=="paceSecondsPerKm")&&trace.filter(point=>point[metric.key]!=null&&point.elapsedSeconds!=null).length>=2),traceControl=$("activity-trace-metrics");
    if(!traceMetrics.some(metric=>metric.key===selectedTraceMetric))selectedTraceMetric=traceMetrics.find(metric=>metric.key==="heartRate")?.key||traceMetrics[0]?.key||"heartRate";
    traceControl.hidden=traceMetrics.length<2;
    traceControl.innerHTML=traceMetrics.length>1?traceMetrics.map(metric=>`<button type="button" data-activity-trace-metric="${metric.key}" aria-pressed="${metric.key===selectedTraceMetric}">${metric.label}</button>`).join(""):"";
    traceControl.querySelectorAll("[data-activity-trace-metric]").forEach(button=>button.addEventListener("click",()=>{selectedTraceMetric=button.dataset.activityTraceMetric;renderActivityCard(activity,detail,message,loading)}));
    const selectedMetric=traceMetrics.find(metric=>metric.key===selectedTraceMetric);
    $("activity-chart-title").textContent=selectedMetric?.title||"Tijek aktivnosti";
    $("activity-chart-unit").textContent=selectedMetric?.unit||"proteklo vrijeme";
    if(loading){disposeChartsInside($("activity-hr-chart"));$("activity-hr-chart").innerHTML=`<div class="empty-chart">Učitavam detalje i vremenske uzorke aktivnosti…</div>`;$("activity-chart-note").textContent="Dohvaćam Garminove detaljne podatke."}
    else if(selectedMetric){const metricCount=trace.filter(point=>point[selectedMetric.key]!=null&&point.elapsedSeconds!=null).length,activityId=String(activity.id??selectedActivityId);void chartModule().then(module=>{if(selectedActivityId===activityId)module.renderActivityMetric("activity-hr-chart",trace,selectedMetric.key,selectedMetric.color,selectedMetric.unit,selectedMetric.format,`${selectedMetric.title} · ${activity.name||humanType(activity.type)}`)});$("activity-chart-note").textContent=`${num(metricCount)} uzoraka · proteklo vrijeme · dostupni Garminovi zapisi.`}
    else{disposeChartsInside($("activity-hr-chart"));$("activity-hr-chart").innerHTML=`<div class="empty-chart">${escapeHtml(message||"Garmin nije vratio dovoljno vremenskih uzoraka za graf ove aktivnosti.")}</div>`;$("activity-chart-note").textContent=averageHeartRate!=null?`Sažetak sadrži prosječni puls (${num(averageHeartRate)} bpm), ali nema vremenskih uzoraka za graf.`:"Nema dostupnih vremenskih uzoraka za graf."}
  };
  const renderActivityList=(activities,selectedId,activitySource=lastDashboardPayload?.sources?.activities)=>{
    const host=$("activity-list");
    if(activitySource?.ok===false){host.innerHTML=`<div class="quiet activity-source-message">Garminova povijest aktivnosti nije dostupna.${activitySource.message?` ${escapeHtml(activitySource.message)}`:""}</div>`;return;}
    const activityNote=activitySource?.partial?'<div class="quiet activity-source-message">Prikazani su dostupni zapisi; Garminova povijest je djelomična.</div>':"";
    host.innerHTML=activities.length?activityNote+activities.map(activity=>{
      const isSauna=Boolean(activity.isSauna)||/sauna/i.test(String(activity.name||"")+" "+String(activity.type||"")),isRun=!isSauna&&Boolean(activity.isRun),id=String(activity.id??""),dateText=fmtIsoDay(String(activity.date||"").slice(0,10)),name=String(activity.name||humanType(activity.type)),durationText=duration(activity.durationSeconds,true),distance=Number(activity.distanceMeters),meta=[!isSauna&&distance>0?`${num(distance/1000,2)} km`:"",isRun&&activity.paceSecondsPerKm!=null?pace(activity.paceSecondsPerKm):"",durationText!=="—"?durationText:"",activity.avgHeartRate!=null?`HR ${num(activity.avgHeartRate)} bpm`:"",activity.trainingLoad!=null?`Load ${num(activity.trainingLoad,0)}`:""].filter(Boolean).join(" · "),kind=isSauna?'<span class="activity-kind sauna">🧖 SAUNA</span>':isRun?'<span class="activity-kind run">🏃 RUN</span>':`<span class="activity-kind">${escapeHtml(humanType(activity.type))}</span>`;
      return`<button type="button" class="activity-select" data-activity-id="${escapeHtml(id)}" aria-pressed="${id===String(selectedId)}" aria-label="Odaberi ${escapeHtml(name)} · ${escapeHtml(dateText)}"${id?"":" disabled"}><span class="activity-select-date">${escapeHtml(dateText)}</span><span class="activity-select-copy"><span class="activity-select-title">${kind}${escapeHtml(name)}</span><span class="activity-select-meta">${escapeHtml(meta||humanType(activity.type))}</span></span><span class="activity-select-arrow" aria-hidden="true">›</span></button>`;
    }).join(""):`${activityNote}<div class="quiet">${activitySource?.partial?"Nema aktivnosti među dostupnim zapisima; povijest je djelomična.":"Nema zabilježenih aktivnosti u dostupnoj povijesti."}</div>`;
  };
  const activityScrollBehavior=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";
  const scrollToActivityDetails=()=>{
    const target=$("activity-details");if(!target)return;
    requestAnimationFrame(()=>{
      const tabs=document.querySelector(".dashboard-tabs"),quick=document.querySelector(".quick-nav"),stickyBottom=Math.max(tabs?.getBoundingClientRect().bottom||0,quick?.getBoundingClientRect().bottom||0)+12;
      const top=Math.max(0,window.scrollY+target.getBoundingClientRect().top-stickyBottom);
      window.scrollTo({top,behavior:activityScrollBehavior()});
    });
  };
  const selectActivity=async(id,scrollIntoView=false,providedActivity=null)=>{
    id=String(id||"");const activity=providedActivity||visibleActivities.find(item=>String(item.id)===id);if(!activity||!id)return;
    const activityDisclosure=$("activity-details")?.closest("details.section-disclosure");if(activityDisclosure)activityDisclosure.open=true;
    activityController?.abort();activityController=new AbortController();selectedActivityId=id;renderActivityList(visibleActivities,id);
    const cached=activityDetailCache.get(id);
    if(cached){renderActivityCard(cached.activity,cached.detail,cached.message);if(scrollIntoView)scrollToActivityDetails();return;}
    renderActivityCard(activity,{},null,true);
    if(scrollIntoView)scrollToActivityDetails();
    try{
      const response=await getActivityDetails(id,false,activityController.signal);if(selectedActivityId!==id)return;
      response.detail={...(response.detail||{}),localRpe:response.localRpe||null};
      activityDetailCache.set(id,response);renderActivityCard(response.activity||activity,response.detail||{},response.message||null);
    }catch(error){
      if(error.name==="AbortError"||selectedActivityId!==id)return;
      renderActivityCard(activity,{},error.message||"Detalje aktivnosti nije moguće učitati.");$("activity-chart-note").textContent=error.message||"Detalje aktivnosti nije moguće učitati.";
    }
    if(scrollIntoView&&selectedActivityId===id)scrollToActivityDetails();
  };
  const renderLifeEventPatterns=(eventHistory,payload)=>{
    const host=$("life-event-pattern-results"),target=String(payload?.date||dateInput.value||"").slice(0,10);
    if(!host)return;
    const start=isoShift(target,-27),events=(eventHistory||[]).filter(item=>item?.date>=start&&item?.date<=target&&item?.category),eventDaysByCategory=new Map(),allEventDates=new Set();
    events.forEach(item=>{const eventDate=String(item.date).slice(0,10);allEventDates.add(eventDate);const dates=eventDaysByCategory.get(item.category)||new Set();dates.add(eventDate);eventDaysByCategory.set(item.category,dates)});
    if(!events.length){host.innerHTML='<div class="quiet">Nema zabilježenih događaja u ovom 28-dnevnom prozoru. Oznake će se uspoređivati s Garminovim mjerenjima sljedećih jutara.</div>';return}
    const normalized=payload?.normalized||{},sleep=(normalized.sleep?.history||[]).map(row=>({date:String(row.date||"").slice(0,10),value:row.totalSeconds==null?null:Number(row.totalSeconds)})),trends=(normalized.recoveryTrends||[]).map(row=>({date:String(row.date||"").slice(0,10),hrv:row.hrv==null?null:Number(row.hrv),rhr:row.restingHeartRate==null?null:Number(row.restingHeartRate)}));
    const metrics=[
      {key:"sleep",label:"San",unit:"",rows:sleep,format:value=>duration(value),formatDelta:value=>`${value<0?"−":"+"}${duration(Math.abs(value))}`},
      {key:"hrv",label:"HRV",unit:" ms",rows:trends.map(row=>({date:row.date,value:row.hrv})),format:value=>`${num(value)} ms`,formatDelta:value=>`${value===0?"":""}${value>0?"+":value<0?"−":""}${num(Math.abs(value))} ms`},
      {key:"rhr",label:"Puls u mirovanju",unit:" bpm",rows:trends.map(row=>({date:row.date,value:row.rhr})),format:value=>`${num(value)} bpm`,formatDelta:value=>`${value>0?"+":value<0?"−":""}${num(Math.abs(value))} bpm`},
    ];
    const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
    const eventLabel={sauna:"Sauna",illness:"Bolest",travel:"Putovanje",alcohol:"Alkohol",caffeine:"Kofein",stress:"Stres",physical_load:"Fizičko opterećenje",recovery:"Oporavak",other:"Ostalo"};
    const cards=[...eventDaysByCategory.entries()].sort((a,b)=>String(eventLabel[a[0]]||a[0]).localeCompare(String(eventLabel[b[0]]||b[0]),"hr")).map(([category,dates])=>{
      const outcomes=new Set([...dates].map(day=>isoShift(day,1)).filter(day=>day&&day<=target));
      const rows=metrics.map(metric=>{
        const values=new Map(metric.rows.filter(row=>row.date>=start&&row.date<=target&&Number.isFinite(row.value)).map(row=>[row.date,row.value]));
        const exposed=[...outcomes].map(day=>values.get(day)).filter(Number.isFinite),comparison=metric.rows.filter(row=>row.date>=start&&row.date<=target&&Number.isFinite(row.value)&&!allEventDates.has(isoShift(row.date,-1))).map(row=>row.value),left=median(exposed),right=median(comparison);
        const result=exposed.length<3||comparison.length<3?`Premalo mjerenja · ${exposed.length} nakon oznake / ${comparison.length} bez zapisa`:`${metric.format(left)} · ${metric.format(right)} bez zapisa <small>${metric.formatDelta(left-right)} · ${exposed.length} / ${comparison.length} dana</small>`;
        return `<div class="life-event-pattern-metric"><span>${metric.label}</span><b>${result}</b></div>`;
      }).join("");
      return `<article class="life-event-pattern-card"><div class="life-event-pattern-head"><b>${escapeHtml(eventLabel[category]||category)}</b><span>${num(dates.size)} ${dates.size===1?"označen dan":"označena dana"}</span></div>${rows}</article>`;
    });
    host.innerHTML=cards.join("")||'<div class="quiet">Nema događaja za usporedbu.</div>';
  };
  const correlationMetricDefs=[
    {key:"sleepHours",label:"Trajanje sna",unit:"h",color:"#b9a2fa",format:value=>num(value,1)},
    {key:"hrv",label:"HRV",unit:"ms",color:chartColors.cyan,format:value=>num(value,0)},
    {key:"restingHeartRate",label:"Puls u mirovanju",unit:"bpm",color:chartColors.blue,format:value=>num(value,0)},
    {key:"stress",label:"Garmin stres",unit:"razina",color:chartColors.plum,format:value=>num(value,0)},
    {key:"bodyBattery",label:"Body Battery",unit:"bodova",color:"#69d7ef",format:value=>num(value,0)},
    {key:"steps",label:"Koraci",unit:"koraka",color:"#69d7ef",format:value=>num(value,0)},
    {key:"runLoad7d",label:"Trkački load · 7 dana",unit:"load",color:chartColors.slate,format:value=>num(value,1)},
    {key:"skinTemperature",label:"Temperatura kože",unit:"°C od baze",color:chartColors.violet,format:value=>`${value>0?"+":value<0?"−":""}${num(Math.abs(value),2)}`},
    {key:"rpe",label:"Osobni RPE",unit:"ocjena",color:"#69d7ef",format:value=>num(value,0)},
    {key:"fatigue",label:"Osobni umor",unit:"ocjena",color:"#b9a2fa",format:value=>num(value,0)},
    {key:"soreness",label:"Bolnost mišića",unit:"ocjena",color:chartColors.plum,format:value=>num(value,0)},
    {key:"mood",label:"Raspoloženje",unit:"ocjena",color:chartColors.teal,format:value=>num(value,0)},
  ];
  let selectedCorrelationX="sleepHours",selectedCorrelationY="hrv";
  const renderCorrelationEngine=()=>{
    const payload=lastDashboardPayload;if(!payload||payload.date!==dateInput.value)return;
    const n=payload.normalized||{},byDate=new Map();
    const assign=(date,key,raw)=>{const day=String(date||"").slice(0,10),value=raw==null?NaN:Number(raw);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(value))return;const row=byDate.get(day)||{date:day};row[key]=value;byDate.set(day,row)};
    (n.recoveryTrends||[]).forEach(row=>["hrv","restingHeartRate","stress","bodyBattery","steps"].forEach(key=>assign(row.date,key,row[key])));
    (n.sleep?.history||[]).forEach(row=>assign(row.date,"sleepHours",row.totalSeconds==null?null:Number(row.totalSeconds)/3600));
    (n.training?.dailyLoadTrend||[]).forEach(row=>assign(row.date,"runLoad7d",row.run7d));
    (latestSkinTemperature?.history||[]).forEach(row=>assign(row.date,"skinTemperature",row.deviationC));
    (latestJournalHistory||[]).forEach(row=>["rpe","fatigue","soreness","mood"].forEach(key=>assign(row.date,key,row[key])));
    const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const available=correlationMetricDefs.filter(metric=>rows.filter(row=>row[metric.key]!=null).length>=2);
    const xSelect=$("correlation-x"),ySelect=$("correlation-y"),signature=available.map(metric=>metric.key).join("|");
    if(xSelect.dataset.options!==signature){
      const options=available.map(metric=>`<option value="${metric.key}">${escapeHtml(metric.label)} · ${escapeHtml(metric.unit)}</option>`).join("");
      xSelect.innerHTML=options;ySelect.innerHTML=options;xSelect.dataset.options=signature;ySelect.dataset.options=signature;
    }
    if(!available.length){$("correlation-coefficient").textContent="—";$("correlation-pair-count").textContent="0";$("correlation-strength").textContent="Čeka podatke";$("correlation-note").textContent="Nema povijesnih serija s barem dva mjerenja. Metrike će se pojaviti kada njihovi izvori vrate povijest.";disposeChartsInside($("correlation-chart"));$("correlation-chart").innerHTML='<div class="empty-chart">Nema dovoljno povijesnih mjerenja.</div>';return}
    if(!available.some(metric=>metric.key===selectedCorrelationX))selectedCorrelationX=available.find(metric=>metric.key==="sleepHours")?.key||available[0].key;
    if(!available.some(metric=>metric.key===selectedCorrelationY)||selectedCorrelationY===selectedCorrelationX)selectedCorrelationY=available.find(metric=>metric.key!==selectedCorrelationX)?.key||selectedCorrelationX;
    xSelect.value=selectedCorrelationX;ySelect.value=selectedCorrelationY;
    const xMetric=available.find(metric=>metric.key===selectedCorrelationX),yMetric=available.find(metric=>metric.key===selectedCorrelationY);
    const pairs=rows.filter(row=>row[xMetric.key]!=null&&row[yMetric.key]!=null).map(row=>({date:row.date,x:Number(row[xMetric.key]),y:Number(row[yMetric.key])}));
    $("correlation-pair-count").textContent=num(pairs.length);
    const meanX=pairs.length?pairs.reduce((sum,pair)=>sum+pair.x,0)/pairs.length:0,meanY=pairs.length?pairs.reduce((sum,pair)=>sum+pair.y,0)/pairs.length:0;
    const covariance=pairs.reduce((sum,pair)=>sum+(pair.x-meanX)*(pair.y-meanY),0),varianceX=pairs.reduce((sum,pair)=>sum+(pair.x-meanX)**2,0),varianceY=pairs.reduce((sum,pair)=>sum+(pair.y-meanY)**2,0),denominator=Math.sqrt(varianceX*varianceY),coefficient=pairs.length>=7&&denominator>0?covariance/denominator:null;
    $("correlation-coefficient").textContent=coefficient==null?"—":`${coefficient>0?"+":""}${num(coefficient,2)}`;
    $("correlation-strength").textContent=pairs.length<7?"Premalo podataka":coefficient==null?"Bez varijacije":"Opisna korelacija";
    $("correlation-note").textContent=pairs.length<7?`Za Pearson r potrebno je najmanje 7 zajedničkih dana; pronađeno je ${num(pairs.length)}. Prazni dani nisu nadomješteni.`:coefficient==null?"Pearson r nije izračunat jer jedna od odabranih metrika nema varijaciju u zajedničkim zapisima.":`Pearson r = ${coefficient>0?"+":""}${num(coefficient,2)} na ${num(pairs.length)} zajedničkih dana. Povezanost je opisna i sama po sebi ne pokazuje uzrok.`;
    renderCorrelationScatter("correlation-chart",pairs,{xLabel:xMetric.label,yLabel:yMetric.label,xUnit:xMetric.unit,yUnit:yMetric.unit,xColor:xMetric.color,yColor:yMetric.color,xFormat:xMetric.format,yFormat:yMetric.format,regression:coefficient==null||varianceX===0?null:{slope:covariance/varianceX,intercept:meanY-covariance/varianceX*meanX},sourceLabel:"Garmin Connect + osobni dnevnik"});
  };
  $("correlation-x").addEventListener("change",()=>{selectedCorrelationX=$("correlation-x").value;if(selectedCorrelationX===selectedCorrelationY)selectedCorrelationY=correlationMetricDefs.find(metric=>metric.key!==selectedCorrelationX)?.key||selectedCorrelationY;renderCorrelationEngine()});
  $("correlation-y").addEventListener("change",()=>{selectedCorrelationY=$("correlation-y").value;if(selectedCorrelationY===selectedCorrelationX)selectedCorrelationX=correlationMetricDefs.find(metric=>metric.key!==selectedCorrelationY)?.key||selectedCorrelationX;renderCorrelationEngine()});
  const renderJournal=data=>{
    const entry=data?.entry||{},history=data?.history||[],events=data?.events||[];
    latestJournalHistory=history;renderCorrelationEngine();
    $("journal-date-label").textContent=fmtIsoDay(data?.date||dateInput.value);
    $("journal-rpe").value=entry.rpe??"";$("journal-fatigue").value=entry.fatigue??"";$("journal-soreness").value=entry.soreness??"";$("journal-mood").value=entry.mood??"";$("journal-notes").value=entry.notes??"";
    const status=$("journal-status");status.className="journal-status";status.textContent=entry.updatedAt?"Spremljeno lokalno · "+fmtDateTime(entry.updatedAt):"Za ovaj datum nema unosa. Prazno spremanje briše zapis.";
    renderPairLineChart("journal-fatigue-chart",history,"fatigue","soreness",chartColors.blue,chartColors.plum,"Umor","Bolnost","Dnevnička ocjena umora i bolnosti",{sourceLabel:"Dnevnik",unit:"ocjena"});
    renderLineChart("journal-mood-chart",history,"mood",{color:chartColors.teal,height:115,formatValue:x=>num(x,1),ariaLabel:"Dnevnički trend raspoloženja",sourceLabel:"Dnevnik"},"Raspoloženje");
    const recent=history.slice(-7),average=key=>{const values=recent.map(x=>x[key]==null?NaN:Number(x[key])).filter(Number.isFinite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
    $("journal-rpe-average").textContent=num(average("rpe"),1);$("journal-fatigue-average").textContent=num(average("fatigue"),1);$("journal-soreness-average").textContent=num(average("soreness"),1);$("journal-mood-average").textContent=num(average("mood"),1);
    const eventLabels={sauna:"Sauna",illness:"Bolest",travel:"Putovanje",alcohol:"Alkohol",caffeine:"Kofein",stress:"Stres",physical_load:"Fizičko opterećenje",recovery:"Oporavak",other:"Ostalo"};
    $("life-event-list").innerHTML=events.length?events.map(item=>`<div class="life-event-row"><div><b>${escapeHtml(eventLabels[item.category]||item.category)}${item.time?` · ${escapeHtml(item.time)}`:""}</b><span>Izraženost ${num(item.impact)}/5${item.note?` · ${escapeHtml(item.note)}`:""}</span></div><button type="button" class="life-event-delete" data-event-id="${escapeHtml(item.id)}" aria-label="Ukloni događaj">Ukloni</button></div>`).join(""):'<div class="quiet">Nema zabilježenih događaja za ovaj datum.</div>';
    renderLifeEventPatterns(data?.eventHistory||events,lastDashboardPayload);
  };
  let baseChartAnnotations=[],dashboardChartAnnotations=[];
  const updateChartAnnotations=()=>void chartModule().then(module=>module.setChartAnnotations(dashboardChartAnnotations));
  const chartDate=value=>{const date=String(value||"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:null};
  const makeDashboardAnnotations=payload=>{
    const n=payload.normalized||{},training=n.training||{},calendar=training.trainingPatterns?.dailyRunCalendar||[],activityMap=new Map();
    calendar.forEach(day=>(day.sessions||[]).forEach(item=>{if(item?.id!=null){const id=String(item.id);activityMap.set(id,{...item,date:item.date||day.date,isRun:true})}}));
    (n.activities||[]).forEach(item=>{if(item?.id!=null)activityMap.set(String(item.id),item)});
    const byDate=new Map();
    activityMap.forEach((item,id)=>{
      const date=chartDate(item.date);if(!date)return;
      const group=byDate.get(date)||[],distance=Number(item.distanceMeters),parts=[];
      if(Number.isFinite(distance)&&distance>0)parts.push(`${num(distance/1000,1)} km`);
      if(item.durationSeconds!=null)parts.push(duration(item.durationSeconds,true));
      if(item.avgHeartRate!=null)parts.push(`${num(item.avgHeartRate)} bpm`);
      group.push({id,item,name:String(item.name||humanType(item.type))||"Aktivnost",detail:parts.join(" · ")});byDate.set(date,group);
    });
    const activityAnnotations=Array.from(byDate,([date,items])=>({
      id:`activity:${date}:${items.map(item=>item.id).join(",")}`,date,kind:"activity",
      title:items.length===1?`${items[0].item.isSauna?"Sauna":items[0].item.isRun?"Trčanje":"Aktivnost"} · ${items[0].name}`:`${items.length} Garmin aktivnosti`,
      detail:items.map(item=>`${item.name}${item.detail?` · ${item.detail}`:""}`).join("; "),activityIds:items.map(item=>item.id),
    }));
    const eventLabels={sauna:"Sauna",illness:"Bolest",travel:"Putovanje",alcohol:"Alkohol",caffeine:"Kofein",stress:"Stres",physical_load:"Fizičko opterećenje",recovery:"Oporavak",other:"Ostalo"};
    const eventAnnotations=(n.weeklyContext?.lifeEvents||[]).flatMap(item=>{
      const date=chartDate(item.date);if(!date)return[];
      const label=eventLabels[item.category]||String(item.category||"Događaj");
      return [{id:`event:${item.id||`${date}:${item.category}:${item.time||""}`}`,date,kind:"event",title:`${label}${item.time?` · ${item.time}`:""}`,detail:[item.impact!=null?`Izraženost ${item.impact}/5`:"",item.note||""].filter(Boolean).join(" · ")}];
    });
    return [...activityAnnotations,...eventAnnotations];
  };
  const render=payload=>{lastDashboardPayload=payload;const n=payload.normalized||{},s=n.sleep||{},r=n.recovery||{},t=n.training||{},a=n.activity||{},d=n.sleepDebt||{},detail=n.activityDetail||{},hs=n.healthSnapshot||{},sources=payload.sources||{};$("range").textContent=`Zdravlje ${fmtIsoYearDay(payload.range?.start)} — ${fmtIsoYearDay(payload.date)} · aktivnosti od ${fmtIsoYearDay(payload.range?.activityStart)}`;$("last-updated").textContent=`Pregled učitan ${new Date().toLocaleTimeString("hr-HR",{hour:"2-digit",minute:"2-digit"})}`;$("api-status").innerHTML='<i class="dot"></i>Garmin povezan';$("api-status").className="status";const sourceVals=Object.values(sources).filter(x=>x.configured!==false),good=sourceVals.filter(x=>x.ok&&!x.partial).length;renderSourceAvailability(sources);$("data-quality").textContent=`${good}/${sourceVals.length} izvora`;
    baseChartAnnotations=makeDashboardAnnotations(payload);dashboardChartAnnotations=[...baseChartAnnotations];updateChartAnnotations();
    const dayCalories=calorieBreakdown(n.dailySummary||{},payload.date);
    const sleepTime=duration(s.totalSeconds),hrv=r.hrvLastNight,load=t.trainingLoad7d;renderHealthOverview(payload);renderDailySnapshot(payload);
    const scheduleDate=n.runnaSchedule?.referenceDate;$("schedule-context").textContent=payload.date===scheduleDate?"Runna · aktualni raspored":"Runna · aktualni raspored, nije povijesna snimka";renderSchedule(n.runnaSchedule);renderPlanActual(n.planVsActual,sources.activities);renderActivityGoals(r,n.dailySummary||{},payload.date,sources.dailySummaries?.fetchedAt);renderTrainingPatterns(t,sources.activities,payload.date);renderRunningTrends(t,sources.activities);renderPerformance(t,payload.range,sources.activities);renderGarminTraining(n.garminTraining,sources.garminTraining);renderBaseline(n,r,s);
    renderWeeklyVolumeSection(t,sources.activities);renderTrainingBalance(t.trainingBalance,sources.activities);renderWeeklyReview(n,payload);renderMonthlyReview(n,payload);const activityUnavailable=sources.activities?.ok===false,activityUnconfirmedZero=sources.activities?.partial&&Number(t.runCount7d)===0;$("load-7").textContent=activityUnavailable||activityUnconfirmedZero||load==null?"—":num(load,0);$("load-base").textContent=activityUnavailable||activityUnconfirmedZero||t.trainingLoadPrevious21dWeeklyAverage==null?"—":num(t.trainingLoadPrevious21dWeeklyAverage,0);$("load-ratio").textContent=activityUnavailable||activityUnconfirmedZero||t.acuteChronicRatio==null?"—":num(t.acuteChronicRatio,2);$("load-ring").style.setProperty("--ratio-angle",`${activityUnavailable||activityUnconfirmedZero?0:Math.min(1,Math.max(0,(Number(t.acuteChronicRatio)||0)/2))*360}deg`);$("aerobic-effect").textContent=a.trainingEffect==null?"—":`${num(a.trainingEffect,1)} · ${escapeHtml(a.trainingEffectLabel||"")}`;$("anaerobic-effect").textContent=a.anaerobicEffect==null?"—":num(a.anaerobicEffect,1);
    const zones=t.heartRateZones7d||[],zoneColors=["#58c7bb","#70c9a1","#aedb7c","#efc66f","#ef9185"];$("zone-bars").innerHTML=zones.some(z=>z.seconds>0)?zones.map((z,i)=>`<div class="zone-row"><span>Z${z.zone}</span><div class="zone-track"><i style="width:${Math.max(0,Math.min(100,Number(z.percentage)||0))}%;--zone-color:${zoneColors[i]}"></i></div><span class="zone-time">${duration(z.seconds)}</span></div>`).join(""):'<div class="quiet">Podaci o vremenu u zonama nisu dostupni u sažetku ovih aktivnosti.</div>';
    const debt=d.debtSeconds;
    $("sleep-debt").textContent=debt==null?"—":duration(debt);
    $("debt-source").textContent=`${num(d.daysAvailable)}/${num(d.daysExpected||14)} noći · prozor`;
    $("sleep-debt-context").textContent=debt==null?"Nedostaje osobni Sleep Need za izračun.":debt>0?"Kumulativni manjak nakon uračunatog noćnog sna i Garminovih napova.":"U dostupnom 14-dnevnom prozoru nije ostao manjak.";
    const napCoverage=Number(d.napCoverageDays)||0,napDays=Number(d.napDays)||0,napSeconds=Number(d.napSeconds)||0,napWindow=Number(d.daysExpected)||14;
    $("sleep-debt-nap-note").textContent=napCoverage===0?"Garminovi zapisi o napovima nisu dostupni za ovo razdoblje.":napDays>0?`Uračunati napovi: ${napDays} ${napDays===1?"dan":"dana"} · ${duration(napSeconds)} ukupno (${napCoverage}/${napWindow} noći s podacima).`:`Nema zabilježenih napova (${napCoverage}/${napWindow} noći s podacima).`;
    $("debt-bar").style.width=debt==null?"0%":`${Math.min(100,Number(debt)/(Number(s.sleepTargetMinutes||payload.settings?.sleepTargetMinutes||480)*60)*100)}%`;
    $("sleep-average").textContent=d.average7dSeconds==null?"—":duration(d.average7dSeconds);
    $("sleep-score-average").textContent=d.average7dScore==null?"—":num(d.average7dScore,0);
    const regularity=d.sleepRegularity14d||{},bedtimeSd=regularity.bedtimeSdMinutes,wakeSd=regularity.wakeTimeSdMinutes;
    $("bedtime-variability").textContent=bedtimeSd==null&&wakeSd==null?"—":`±${bedtimeSd==null?"—":num(bedtimeSd,0)} / ±${wakeSd==null?"—":num(wakeSd,0)} min`;
    $("bedtime-variability").title=`Odlazak na spavanje ${num(regularity.bedtimeDays)}/14 noći · buđenje ${num(regularity.wakeTimeDays)}/14 noći`;
    const debtRows=(d.history||[]).map(x=>({date:x.date,debtHours:x.debtAfterSeconds==null?null:Number(x.debtAfterSeconds)/3600}));renderLineChart("debt-history-chart",debtRows,"debtHours",{color:chartColors.slate,height:115,formatValue:x=>num(x,1),unit:" h",ariaLabel:"Kumulativni manjak sna",sourceLabel:"Garmin Sleep Need"},"Sleep debt");
    const sleepRows=(s.history||[]).map(x=>({date:x.date,hours:x.totalSeconds==null?null:Number(x.totalSeconds)/3600}));
    const sleepReference=baselineReference(n.personalRecoveryBaseline?.sleep,3600,1," h");
    renderLineChart("sleep-chart",sleepRows,"hours",{color:"#b9a2fa",height:130,unit:" h",formatValue:x=>num(x,1),referenceLine:sleepReference||undefined,ariaLabel:"Trajanje sna po noći uz osobni medijan prethodnih 28 dana kada ima dovoljno mjerenja",sourceLabel:"Garmin"},"San");
    $("sleep-night").textContent=`${fmtIsoDay(s.date)} · ${sleepTime}`;const stageValues=[s.deepSeconds,s.remSeconds,s.lightSeconds,s.awakeSeconds],stages=stageValues.map(value=>value==null?null:Number(value)),allStagesAvailable=stages.every(value=>value!=null&&Number.isFinite(value)),stageTotal=stages.reduce((x,y)=>x+(y!=null&&Number.isFinite(y)?y:0),0);$("architecture").innerHTML=stages.map(v=>`<i style="width:${allStagesAvailable&&stageTotal&&v!=null?Math.max(0,v)/stageTotal*100:0}%"></i>`).join("");["deep","rem","light","awake"].forEach((id,i)=>$(id).textContent=duration(stages[i]));
    $("hrv").textContent=hrv==null?"—":`${num(hrv)} ms`;$("hrv-status").textContent=r.hrvStatus||"—";$("rhr").textContent=r.restingHeartRate==null?"—":`${num(r.restingHeartRate)} / ${num(r.restingHeartRate7d)} bpm`;$("stress").textContent=r.stressLevel==null?"—":`${num(r.stressLevel)} · odmor ${r.restStressSeconds==null?"—":num(r.restStressSeconds/864)}%`;$("resp-spo2").textContent=`${r.sleepRespiration==null?"—":`${num(r.sleepRespiration,1)} /min`} · ${r.sleepSpO2==null?"—":`${num(r.sleepSpO2)}%`}`;$("day-resp-spo2").textContent=`${r.dailyRespiration==null?"—":`${num(r.dailyRespiration,1)} /min`} · ${r.dailySpO2==null?"—":`${num(r.dailySpO2)}%`}`;$("health-snapshot").textContent=hs.date?`${fmtIsoDay(hs.date)} ${fmtDateTime(hs.time)} · ${num(hs.heartRate)} bpm / ${num(hs.rmssdHrv)} ms / ${num(hs.spo2)}%`:"Nema zdravstvenog sažetka u zadnjih 7 dana";$("steps").textContent=r.steps==null?"—":`${num(r.steps)} / ${num(r.stepGoal)}`;$("calories").textContent=`${r.activeCalories==null?"—":num(r.activeCalories)} / ${r.totalCalories==null?"—":num(r.totalCalories)} kcal`;const hydrationSource=sources.dailySummaries,hydrationValue=r.hydrationMl,hydrationUnavailable=hydrationSource?.ok===false||sources.hydration?.ok===false,hydrationText=hydrationValue!=null?`${num(hydrationValue)} ml`:hydrationUnavailable?"Nije dostupno":hydrationSource?.partial?"Nije zabilježeno · djelomični podaci":"Nije zabilježeno";$("hydration").textContent=`${hydrationText} / ${r.hydrationGoalMl==null?"—":`${num(r.hydrationGoalMl)} ml`}`;$("intensity-minutes").textContent=`${num(r.moderateMinutes7d)} / ${num(r.vigorousMinutes7d)} min`;
    $("calories-label").textContent=dayCalories.isToday?"Aktivne / ukupno procijenjeno kcal":"Aktivne / ukupno kcal";
    $("calories").textContent=`${dayCalories.active==null?"—":num(dayCalories.active)} / ${dayCalories.total==null?"—":num(dayCalories.total)} kcal`;
    const batteryHistory=r.bodyBatteryHistory||{},batteryPoints=batteryHistory.date===payload.date?(batteryHistory.points||[]):[];
    $("body-battery-day-date").textContent=fmtIsoDay(payload.date);
    $("body-battery-start").textContent=batteryHistory.startLevel==null?"—":num(batteryHistory.startLevel,0);
    $("body-battery-latest").textContent=batteryHistory.latestLevel==null?"—":num(batteryHistory.latestLevel,0);
    $("body-battery-min").textContent=batteryHistory.minLevel==null?"—":num(batteryHistory.minLevel,0);
    $("body-battery-max").textContent=batteryHistory.maxLevel==null?"—":num(batteryHistory.maxLevel,0);
    const batteryChart=$("body-battery-day-chart");disposeChartsInside(batteryChart);
    if(batteryPoints.length>=2){
      $("body-battery-day-note").textContent=`Uzorci ${batteryHistory.startTime}–${batteryHistory.latestTime} · ${num(batteryHistory.sampleCount)} zapisa · Garmin charge ${num(r.bodyBatteryCharged)} / drain ${num(r.bodyBatteryDrained)}.`;
      renderIntradayLineChart("body-battery-day-chart",batteryPoints,"level",{color:"#69d7ef",height:155,ariaLabel:`Garmin Body Battery tijekom dana ${payload.date}`,sourceLabel:"Garmin"},"Body Battery");
    }else{
      batteryChart.innerHTML='<div class="empty-chart">'+(batteryPoints.length===1?"Dostupan je jedan uzorak; za krivulju su potrebna barem dva.":"Garminovi vremenski uzorci nisu dostupni za ovaj dan.")+'</div>';
      $("body-battery-day-note").textContent=batteryPoints.length===1?`Dostupan je 1 uzorak u ${batteryHistory.startTime}.`:`Prikazuje se samo kada Garmin vrati vremenske uzorke za odabrani dan.`;
    }
    const trend=(n.recoveryTrends||[]).slice(-56),sleepTrend=(s.history||[]).map(x=>({date:x.date,hours:x.totalSeconds==null?null:Number(x.totalSeconds)/3600})),baseline=n.personalRecoveryBaseline||{};
    const sleepTrendReference=baselineReference(baseline.sleep,3600,1," h"),hrvReference=baselineReference(baseline.hrv,1,0," ms"),rhrReference=baselineReference(baseline.restingHeartRate,1,0," bpm");
    const recoveryChart=$("recovery-chart");disposeChartsInside(recoveryChart);
    if(trend.length>1){
      recoveryChart.innerHTML='<div class="chart-labels"><span style="color:var(--violet)">— San · h</span><span style="color:var(--mint)">— HRV · ms</span><span style="color:var(--cyan)">— Body Battery</span><span style="color:var(--amber)">— Puls u mirovanju · bpm</span></div><p class="recovery-baseline-note">Isprekidana crta označava osobni medijan prethodnih 28 dana kada postoji barem 7 mjerenja; to je kontekst, ne Garminov prag.</p><div class="layout-2"><div id="recovery-sleep-chart" class="chart-wrap"></div><div id="recovery-hrv-chart" class="chart-wrap"></div><div id="recovery-battery-chart" class="chart-wrap"></div><div id="recovery-rhr-chart" class="chart-wrap"></div></div>';
      renderLineChart("recovery-sleep-chart",sleepTrend,"hours",{color:"#b9a2fa",height:145,unit:" h",formatValue:x=>num(x,1),referenceLine:sleepTrendReference||undefined,ariaLabel:"Trajanje sna i osobni medijan prethodnih 28 dana kada ima dovoljno mjerenja",sourceLabel:"Garmin"},"San");
      renderLineChart("recovery-hrv-chart",trend,"hrv",{color:chartColors.cyan,height:145,unit:" ms",formatValue:x=>num(x,0),referenceLine:hrvReference||undefined,ariaLabel:"HRV i osobni medijan prethodnih 28 dana kada ima dovoljno mjerenja",sourceLabel:"Garmin"},"HRV");
      renderLineChart("recovery-battery-chart",trend,"bodyBattery",{color:"#69d7ef",height:145,formatValue:x=>num(x,0),ariaLabel:"Body Battery tijekom oporavka",sourceLabel:"Garmin"},"Body Battery");
      renderLineChart("recovery-rhr-chart",trend,"restingHeartRate",{color:chartColors.blue,height:145,unit:" bpm",formatValue:x=>num(x,0),referenceLine:rhrReference||undefined,ariaLabel:"Puls u mirovanju i osobni medijan prethodnih 28 dana kada ima dovoljno mjerenja",sourceLabel:"Garmin"},"Puls u mirovanju");
    }else recoveryChart.innerHTML='<div class="empty-chart">Nema dovoljno HRV i sleep povijesti za trend.</div>';
    renderLineChart("stress-trend-chart",trend,"stress",{color:chartColors.plum,height:140,formatValue:x=>num(x,0),ariaLabel:"Garminov dnevni prosječni stres tijekom 56 dana",sourceLabel:"Garmin"},"Dnevni Garmin stress");
    const activities=n.activities||[],activityRows=sources.activities?.ok===false?[]:(activities.length?activities:(a.id?[a]:[])).slice(0,12);
    activityController?.abort();activityDetailCache.clear();visibleActivities=activityRows;selectedActivityId=activityRows[0]?.id==null?null:String(activityRows[0].id);
    renderActivityList(activityRows,selectedActivityId,sources.activities);renderActivityCard(activityRows[0]||{},detail,sources.activities?.ok===false?"Garminova povijest aktivnosti nije dostupna.":null);
    if(selectedActivityId)void selectActivity(selectedActivityId);
    const f=n.fitnessAge||{};$("fitness-age").textContent=f.fitnessAge==null?"—":num(f.fitnessAge,1);$("fitness-achievable").textContent=f.achievableFitnessAge==null?"—":`${num(f.achievableFitnessAge,1)} god.`;$("fitness-updated").textContent=fmtIsoDay(String((sources.fitnessAge?.date)||payload.date));$("fitness-delta").textContent=f.fitnessAge!=null&&f.chronologicalAge!=null?`${Number(f.chronologicalAge)-Number(f.fitnessAge)>0?"−":"+"}${num(Math.abs(f.chronologicalAge-f.fitnessAge),1)} god. u odnosu na kronološku`:"";const components=f.components||{};$("fitness-components").innerHTML=Object.entries(components).filter(([,v])=>!v.stale).map(([k,v])=>`<div class="kv"><span>${escapeHtml(componentLabels[k]||k)}</span><b>${v.value==null?"—":num(v.value,1)}${v.targetValue!=null?` / cilj ${num(v.targetValue,1)}`:""}</b></div>`).join("")||'<div class="note">Garmin nije vratio komponente fitness age procjene.</div>';
    const z=n.heartRateZones||{};$("running-zones-data").innerHTML=z.floors?.length?`<div class="source"><span class="source-name">Metoda</span><span class="source-state ok">${escapeHtml(z.method||"—")}</span></div><div class="source"><span class="source-name">Resting HR</span><span class="source-state">${num(z.restingHeartRate)} bpm</span></div><div class="source"><span class="source-name">Lactate threshold</span><span class="source-state">${num(z.lactateThreshold)} bpm</span></div><div class="source"><span class="source-name">Max HR used</span><span class="source-state">${num(z.maxHeartRate)} bpm</span></div>${z.floors.map((v,i)=>`<div class="source"><span class="source-name">Zona ${i+1} · od</span><span class="source-state">${num(v)} bpm</span></div>`).join("")}`:'<div class="quiet">Garmin zone postavke za trčanje nisu dostupne.</div>';
    const runna=sources.runnaCalendar;$("sources").innerHTML=Object.entries(sources).map(([k,v])=>{const state=k==="runnaCalendar"&&!v.configured?"Nije povezano":v.partial?"Djelomično":v.ok&&v.count===0?"Nema zapisa":v.ok?"Dostupno":"Nije dostupno",cls=k==="runnaCalendar"&&!v.configured||v.partial?"warn":v.ok&&v.count===0?"empty":v.ok?"ok":"bad",count=v.count?` · ${num(v.count)}`:"",updated=v.fetchedAt?` · dohvaćeno ${fmtIsoYearDay(String(v.fetchedAt).slice(0,10))} ${fmtDateTime(v.fetchedAt)}`:"";return`<div class="source" title="${escapeHtml(v.message||"")}"><span class="source-name">${escapeHtml(sourceNames[k]||k)}</span><span class="source-state ${cls}">${state}${count}${updated}${v.cacheHit?" · predmemorija":""}</span></div>`}).join("");
    renderCorrelationEngine();
  };
  let activeController=null,journalController=null;
  const loadJournal=async target=>{
    if(journalController)journalController.abort();journalController=new AbortController();
    try{
      const data=await getJournal(target,journalController.signal);
      if(dateInput.value===target)renderJournal(data);
    }catch(error){if(error.name==="AbortError")return;const status=$("journal-status");status.className="journal-status error";status.textContent=!navigator.onLine?"Nema veze s dashboardom; unos nije spremljen.":error.message}
  };
  $("journal-form").addEventListener("submit",async event=>{
    event.preventDefault();const button=$("journal-save"),target=dateInput.value;
    const numberInput=id=>$(id).value===""?null:Number($(id).value);
    const payload={date:target,rpe:numberInput("journal-rpe"),fatigue:numberInput("journal-fatigue"),soreness:numberInput("journal-soreness"),mood:numberInput("journal-mood"),notes:$("journal-notes").value};
    button.disabled=true;$("journal-status").className="journal-status";$("journal-status").textContent="Spremam lokalno…";
    if(journalController)journalController.abort();
    try{
      const data=await saveJournal(payload);
      if(dateInput.value===target)renderJournal(data);else await loadJournal(dateInput.value);
    }catch(error){$("journal-status").className="journal-status error";$("journal-status").textContent=error.message}
    finally{button.disabled=false}
  });
  $("life-event-form").addEventListener("submit",async event=>{
    event.preventDefault();const button=$("life-event-save"),target=dateInput.value;
    button.disabled=true;$("life-event-status").className="journal-status";$("life-event-status").textContent="Spremam događaj…";
    try{
      const data=await saveLifeEvent({date:target,time:$("life-event-time").value||null,category:$("life-event-category").value,impact:Number($("life-event-impact").value),note:$("life-event-note").value});
      $("life-event-time").value="";$("life-event-note").value="";renderJournal(data);$("life-event-status").textContent="Događaj je spremljen lokalno.";
    }catch(error){$("life-event-status").className="journal-status error";$("life-event-status").textContent=error.message}
    finally{button.disabled=false}
  });
  $("life-event-list").addEventListener("click",async event=>{
    const button=event.target.closest(".life-event-delete");if(!button)return;
    button.disabled=true;
    try{await deleteLifeEvent(button.dataset.eventId);await loadJournal(dateInput.value)}
    catch(error){$("life-event-status").className="journal-status error";$("life-event-status").textContent=error.message;button.disabled=false}
  });
  $("activity-rpe-form").addEventListener("submit",async event=>{
    event.preventDefault();const id=selectedActivityId,button=$("activity-rpe-save");if(!id)return;
    button.disabled=true;$("activity-rpe-status").className="journal-status";$("activity-rpe-status").textContent="Spremam procjenu…";
    try{
      const result=await saveActivityRpe(id,{rpe:$("activity-rpe").value===""?null:Number($("activity-rpe").value),note:$("activity-rpe-note").value});
      const cached=activityDetailCache.get(id);if(cached){cached.detail={...cached.detail,localRpe:result.entry};renderActivityCard(cached.activity,cached.detail,cached.message)}
      else{$("activity-rpe-status").textContent=result.entry?.updatedAt?`Spremljeno · ${fmtDateTime(result.entry.updatedAt)}`:"Procjena je uklonjena."}
    }catch(error){$("activity-rpe-status").className="journal-status error";$("activity-rpe-status").textContent=error.message}
    finally{button.disabled=false}
  });
  const load=async(forceRefresh=false)=>{
    if(activeController)activeController.abort();activeController=new AbortController();void loadSkinTemperature(dateInput.value,forceRefresh);void loadGarminProfile(dateInput.value,forceRefresh);const button=$("refresh");button.disabled=true;button.textContent="Učitavam…";$("api-status").innerHTML='<i class="dot"></i>Učitavam Garmin';$("api-status").className="status";
    try{
      const target=dateInput.value;const payload=await getDashboard(target,forceRefresh,activeController.signal);if(payload.date!==dateInput.value)return;render(payload);publishDashboard(payload);window.dispatchEvent(new Event("dashboard:content-updated"));await loadJournal(target);
    }catch(error){if(error.name==="AbortError")return;$("source-warning")?.setAttribute("hidden","");const offline=!navigator.onLine,message=offline?"Poveži se s kućnim računalom putem Tailscalea pa osvježi.":error.message;$("api-status").textContent=offline?"Izvan mreže":"Pogreška pri učitavanju";$("api-status").className="status error";$("today-interpretation").textContent="Pregled zdravlja nije dostupan";$("hero-executive-copy").textContent=message;$("health-overview-title").textContent="Pregled zdravlja nije dostupan";$("health-overview-summary").textContent=message;$("health-overview-coverage").textContent="—";$("health-insight-title").textContent="Čekam novu vezu s Garmin podacima";$("health-insight-copy").textContent="Zdravstveni signali i tjedni trendovi prikazat će se nakon osvježavanja.";$("health-weekly-trends").innerHTML="";$("overview").innerHTML=`<article class="metric error">${escapeHtml(message)}</article>`;$("schedule").innerHTML=`<div class="error">${offline?"Dashboard je izvan mreže.":"Provjeri Garmin ključ i API pristup."}</div>`}
    finally{button.disabled=false;button.textContent="Osvježi podatke"}
  };
  let bloodLabAnalysis=null,bloodLabAiConfigured=false,bloodLabAiStatus=null,bloodLabBusy=false,bloodLabFiles=[];
  const bloodLabHistory=$("blood-lab-history"),bloodLabReview=$("blood-lab-review"),bloodLabStatus=$("blood-lab-status"),bloodLabAnalyzeButton=$("blood-lab-analyze");
  const syncBloodLabControls=()=>{
    const locked=bloodLabBusy||Boolean(bloodLabAnalysis);
    $("blood-lab-file").disabled=locked;$("blood-lab-consent").disabled=locked;
    $("blood-lab-files").querySelectorAll("button").forEach(button=>{button.disabled=locked});
    bloodLabAnalyzeButton.disabled=locked||!bloodLabAiConfigured||!bloodLabFiles.length||!$("blood-lab-consent").checked;
  };
  const renderBloodLabSelection=()=>{
    $("blood-lab-files").innerHTML=bloodLabFiles.map((file,index)=>`<div class="blood-lab-file-row"><span><b>Nalaz ${index+1}</b><small>${escapeHtml(file.name)} · ${file.size<1024*1024?`${num(file.size/1024,1)} KB`:`${num(file.size/1024/1024,1)} MB`}</small></span><button type="button" data-remove-blood-file="${index}" aria-label="Ukloni nalaz ${index+1}">Ukloni</button></div>`).join("");
    syncBloodLabControls();
  };
  const parseLabNumeric=value=>{
    let text=String(value??"").trim().replace(/[\s'’]/g,"");
    if(!text||/^[<>=≤≥~≈]/.test(text))return null;
    const comma=text.lastIndexOf(","),dot=text.lastIndexOf(".");
    if(comma>=0&&dot>=0){if(comma>dot)text=text.replace(/\./g,"").replace(",",".");else text=text.replace(/,/g,"")}
    else if(comma>=0)text=text.replace(",",".");
    return /^-?\d+(?:\.\d+)?$/.test(text)&&Number.isFinite(Number(text))?Number(text):null;
  };
  const renderBloodLabResult=(item,index,editable=false,documents=[])=>{
    const confidence={high:"AI procjena · visoka sigurnost",medium:"AI procjena · srednja sigurnost",low:"AI procjena · niska sigurnost"}[item.confidence]||"AI procjena · provjeri zapis";
    const flag=String(item.labFlag||"").trim();
    const flagLower=flag.toLowerCase();
    const tone=/critical|kritično|panic|hitno/.test(flagLower)?"alert":/high|low|visok|nizak|iznad|ispod|abnormal|poviš|snižen/.test(flagLower)?"caution":"";
    const tag=flag?'<span class="blood-result-tag" data-tone="'+tone+'">'+escapeHtml(flag)+'</span>':'<span class="blood-result-tag">Bez oznake na nalazu</span>';
    const name=editable?`<input aria-label="Naziv analize ${index+1}" data-blood-index="${index}" data-blood-field="testName" value="${escapeHtml(item.testName)}">`:`<strong>${escapeHtml(item.testName)}</strong>`;
    const value=editable?`<input aria-label="Vrijednost ${escapeHtml(item.testName)}" data-blood-index="${index}" data-blood-field="valueText" value="${escapeHtml(item.valueText)}">`:`<b>${escapeHtml(item.valueText)}${item.unit?` ${escapeHtml(item.unit)}`:""}</b>`;
    const unit=editable?`<input aria-label="Jedinica ${escapeHtml(item.testName)}" data-blood-index="${index}" data-blood-field="unit" value="${escapeHtml(item.unit||"")}" placeholder="Jedinica">`:"";
    const reference=editable?`<input aria-label="Referentni raspon ${escapeHtml(item.testName)}" data-blood-index="${index}" data-blood-field="referenceRange" value="${escapeHtml(item.referenceRange||"")}" placeholder="Raspon nije očitan">`:`<span>Raspon: ${escapeHtml(item.referenceRange||"nije naveden")}</span>`;
    const source=documents.find(doc=>doc.documentNumber===item.sourceDocument),sourceDate=item.reportDate||source?.reportDate,sourceLab=item.laboratory||source?.laboratory;
    const provenance=item.sourceDocument?`<div class="blood-result-source"><b>Nalaz ${num(item.sourceDocument)}</b><span>${sourceDate?escapeHtml(fmtIsoDay(sourceDate)):"Datum nije očitan"}${sourceLab?` · ${escapeHtml(sourceLab)}`:""}</span></div>`:"";
    const staleNote=item.interpretationStale?'<div class="blood-result-stale">Vrijednost je ispravljena nakon analize. AI objašnjenje odnosi se na raniji prijepis i treba ga ponovno provjeriti.</div>':"";
    return `<article class="blood-result" data-confidence="${escapeHtml(item.confidence||"low")}">${provenance}<div class="blood-result-top">${name}${tag}</div><div class="blood-result-value">${value}${unit||reference}</div>${editable?`<label class="blood-result-reference">Referentni raspon${reference}</label>`:""}${staleNote}<p>${escapeHtml(item.interpretation||"Nema dodatnog objašnjenja.")}</p><div class="blood-result-meta"><span>${escapeHtml(confidence)}${item.needsReview?" · traži provjeru":""}</span><span>${item.pageNumber?`str. ${num(item.pageNumber)}`:"stranica nije sigurna"}</span></div></article>`;
  };
  const renderBloodLabAnalysis=(analysis,editable=false)=>{
    const documents=analysis.documents||[],multi=documents.length>1,resultCount=(analysis.results||[]).length;
    const dates=[...new Set([...documents.map(doc=>doc.reportDate),...(analysis.results||[]).map(item=>item.reportDate),analysis.reportDate].filter(Boolean))].sort();
    const when=dates.length>1?`${fmtIsoDay(dates[0])} – ${fmtIsoDay(dates.at(-1))}`:dates.length?fmtIsoDay(dates[0]):"Datum nije očitan",lab=analysis.laboratory||(multi?"Više izvornih nalaza":"Laboratorij nije prepoznat");
    const sources=documents.length?`<div class="blood-lab-sources" aria-label="Izvorni nalazi">${documents.map(doc=>`<div class="blood-lab-source"><b>Nalaz ${num(doc.documentNumber)}</b><span>${doc.reportDate?escapeHtml(fmtIsoDay(doc.reportDate)):"Datum nije očitan"} · ${escapeHtml(doc.laboratory||"Laboratorij nije očitan")}</span>${doc.note?`<p>${escapeHtml(doc.note)}</p>`:""}</div>`).join("")}</div>`:"";
    const alerts=analysis.explicitAlerts?.length?`<div class="blood-lab-alerts"><b>Oznake iz samog nalaza</b><br>${analysis.explicitAlerts.map(escapeHtml).join(" · ")}</div>`:"";
    const questions=analysis.questionsForClinician?.length?`<div class="blood-lab-questions"><b>Pitanja za liječnika</b><ul>${analysis.questionsForClinician.map(question=>`<li>${escapeHtml(question)}</li>`).join("")}</ul></div>`:"";
    const editNote=editable?'<div class="blood-lab-footnote">Provjeri vrijednosti i raspon prije spremanja. Polja naziva, rezultata, jedinice i raspona možeš ispraviti. Sigurnost je procjena AI-ja, ne potvrda laboratorija.</div>':"";
    const resultMarkup=resultCount?`<div class="blood-lab-results">${analysis.results.map((item,index)=>renderBloodLabResult(item,index,editable,documents)).join("")}</div>`:'<div class="blood-lab-empty">Nije moguće izdvojiti sigurne laboratorijske stavke iz odabranih PDF-ova. Nemoj spremati kao nalaz.</div>';
    const controls=editable?`<div class="blood-lab-actions"><button type="button" class="btn" id="blood-lab-save"${resultCount?"":" disabled"}>Spremi provjerene podatke lokalno</button><button type="button" class="btn secondary" id="blood-lab-discard">Odbaci analizu</button></div>`:"";
    return `<div class="blood-lab-summary"><div class="panel-title"><div><h3>${multi?"Zajednička analiza":escapeHtml(when)}</h3><p class="panel-sub">${multi?`${escapeHtml(when)} · PDF dokumenti: ${num(documents.length)} · `:""}${escapeHtml(lab)} · Stavke: ${num(resultCount)}</p></div><span class="badge">AI procjena</span></div><p>${escapeHtml(analysis.overview||"Sažetak nije dostupan.")}</p>${analysis.overviewStale?'<div class="blood-result-stale">Sažetak je nastao prije korisničkih ispravaka pojedinih rezultata i više se ne mora odnositi na trenutačne vrijednosti.</div>':""}</div>${sources}${alerts}${resultMarkup}${questions}<div class="blood-lab-footnote">${escapeHtml(analysis.limitations||"Očitavanje može pogriješiti. Usporedi ga s izvornim PDF-om i razgovaraj s liječnikom.")}</div>${editNote}${controls}`;
  };
  let bloodLabReports=[];
  const bloodLabFilters={query:"",category:"",source:"",status:""};
  const bloodResultSource=(item,analysis)=>{
    const document=(analysis.documents||[]).find(row=>row.documentNumber===item.sourceDocument);
    return item.laboratory||document?.laboratory||analysis.laboratory||"Laboratorij nije naveden";
  };
  const renderSavedBloodLabResult=(report,item,index)=>{
    const analysis=report.analysis||{},source=(analysis.documents||[]).find(row=>row.documentNumber===item.sourceDocument),lab=bloodResultSource(item,analysis),when=item.reportDate||source?.reportDate||analysis.reportDate;
    const flag=String(item.labFlag||"").trim(),verified=item.userVerified===true,stale=item.interpretationStale===true;
    const provenance=`<div class="blood-result-source"><b>${item.sourceDocument?`Nalaz ${num(item.sourceDocument)}`:"Izvor"}</b><span>${when?escapeHtml(fmtIsoDay(when)):"Datum nije očitan"} · ${escapeHtml(lab)}${item.pageNumber?` · str. ${num(item.pageNumber)}`:""}</span></div>`;
    const history=(item.correctionHistory||[]).filter(row=>row?.action==="corrected");
    const historyHtml=history.length?`<details class="blood-correction-history"><summary>Povijest ispravaka · ${num(history.length)}</summary>${history.map(row=>{
      const before=row.before||{},after=row.after||{},keys=[...new Set([...Object.keys(before),...Object.keys(after)])];
      return `<div class="blood-correction-entry"><b>${escapeHtml(fmtIsoDay(String(row.at||"").slice(0,10)))} · ${escapeHtml(fmtDateTime(row.at))}</b>${keys.map(key=>`<span>${escapeHtml(key)}: ${escapeHtml(before[key]??"—")} → ${escapeHtml(after[key]??"—")}</span>`).join("")}</div>`;
    }).join("")}</details>`:"";
    const fields=[
      ["testName","Naziv",item.testName||"",false],["category","Kategorija",item.category||"",false],
      ["valueText","Vrijednost",item.valueText||"",false],["unit","Jedinica",item.unit||"",false],
      ["referenceRange","Referentni raspon",item.referenceRange||"",false],["labFlag","Oznaka laboratorija",item.labFlag||"",false],
    ];
    const form=`<form class="blood-result-edit" data-report-id="${escapeHtml(report.id)}" data-result-index="${index}" hidden><div class="blood-result-edit-grid">${fields.map(([key,label,value])=>`<label>${label}<input data-saved-blood-field="${key}" value="${escapeHtml(value)}" maxlength="${key==="testName"?180:key==="category"?80:key==="valueText"?100:key==="unit"?40:key==="referenceRange"?160:80}"></label>`).join("")}</div><p class="blood-lab-footnote">Ispravak se sprema lokalno. Objašnjenje AI-ja i sažetak označit će se zastarjelima; za novu AI procjenu treba ponovno odabrati nalaz i izričito potvrditi slanje.</p><div class="blood-lab-actions"><button type="submit" class="btn">Spremi ispravak</button><button type="button" class="btn secondary" data-cancel-blood-edit>Odustani</button></div></form>`;
    return `<article class="blood-result saved-blood-result" data-report-id="${escapeHtml(report.id)}" data-result-index="${index}">${provenance}<div class="blood-result-top"><strong>${escapeHtml(item.testName||"Nepoznata pretraga")}</strong>${flag?`<span class="blood-result-tag">${escapeHtml(flag)}</span>`:'<span class="blood-result-tag">Laboratorij nije stavio oznaku</span>'}</div><div class="blood-result-value"><b>${escapeHtml(item.valueText||"—")}${item.unit?` ${escapeHtml(item.unit)}`:""}</b><span>Raspon na nalazu: ${escapeHtml(item.referenceRange||"nije naveden")}</span></div>${stale?'<div class="blood-result-stale">AI objašnjenje je zastarjelo nakon ispravka. Nemoj ga tumačiti kao objašnjenje trenutačne vrijednosti.</div>':""}<details class="blood-result-explanation"><summary>Što je očitano i objašnjenje</summary><p>${escapeHtml(item.interpretation||"AI nije dao dodatno objašnjenje.")}</p><div class="blood-result-meta"><span>AI procjena · ${escapeHtml(({high:"visoka",medium:"srednja",low:"niska"})[item.confidence]||"nepoznata")} sigurnost${item.needsReview&&!verified?" · traži provjeru":""}</span><span>${item.pageNumber?`str. ${num(item.pageNumber)}`:"stranica nije sigurna"}</span></div></details><div class="blood-result-user-status">${verified?`Uspoređeno s originalom · ${escapeHtml(fmtIsoDay(String(item.userVerifiedAt||"").slice(0,10)))} · ${escapeHtml(fmtDateTime(item.userVerifiedAt))}`:"Nije potvrđeno prema izvorniku"}</div><div class="blood-result-actions"><button type="button" class="btn secondary" data-edit-blood-result>Ispravi očitanje</button>${verified?"":`<button type="button" class="btn secondary" data-confirm-blood-result>Usporedio/la s originalom</button>`}</div>${form}${historyHtml}</article>`;
  };
  const bloodResultMatches=(report,item)=>{
    const analysis=report.analysis||{},source=bloodResultSource(item,analysis),query=bloodLabFilters.query.trim().toLocaleLowerCase("hr-HR");
    const text=[item.testName,item.valueText,item.unit,item.category,item.referenceRange,item.labFlag,item.interpretation,source,item.reportDate].filter(Boolean).join(" ").toLocaleLowerCase("hr-HR");
    if(query&&!text.includes(query))return false;
    if(bloodLabFilters.category&&String(item.category||"Ostalo")!==bloodLabFilters.category)return false;
    if(bloodLabFilters.source&&source!==bloodLabFilters.source)return false;
    if(bloodLabFilters.status==="review"&&item.userVerified!==true&&!(item.needsReview||item.confidence==="low"))return false;
    if(bloodLabFilters.status==="flagged"&&!String(item.labFlag||"").trim())return false;
    if(bloodLabFilters.status==="stale"&&item.interpretationStale!==true)return false;
    if(bloodLabFilters.status==="verified"&&item.userVerified!==true)return false;
    return true;
  };
  const renderBloodLabHistory=reports=>{
    bloodLabReports=reports||[];
    const openReports=new Set([...bloodLabHistory.querySelectorAll(".blood-report[open]")].map(node=>node.dataset.reportId));
    const allResults=bloodLabReports.flatMap(report=>(report.analysis?.results||[]).map((item,index)=>({report,item,index})));
    const categories=[...new Set(allResults.map(({item})=>String(item.category||"Ostalo")))].sort((a,b)=>a.localeCompare(b,"hr"));
    const sources=[...new Set(allResults.map(({report,item})=>bloodResultSource(item,report.analysis||{})))].sort((a,b)=>a.localeCompare(b,"hr"));
    const documentsTotal=bloodLabReports.reduce((sum,report)=>sum+Math.max(1,report.analysis?.documents?.length||0),0);
    const updateOptions=(id,values,placeholder,current)=>{
      const select=$(id),options=values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
      select.innerHTML=`<option value="">${placeholder}</option>${options}`;
      select.value=values.includes(current)?current:"";
    };
    updateOptions("blood-lab-category-filter",categories,"Sve kategorije",bloodLabFilters.category);
    updateOptions("blood-lab-source-filter",sources,"Svi izvori",bloodLabFilters.source);
    $("blood-lab-count").textContent=`${num(bloodLabReports.length)} analiza`;
    const flagged=allResults.filter(({item})=>String(item.labFlag||"").trim()).length;
    const needsReview=allResults.filter(({item})=>item.userVerified!==true&&(item.needsReview||item.confidence==="low")).length;
    const stale=allResults.filter(({item})=>item.interpretationStale===true).length;
    const verified=allResults.filter(({item})=>item.userVerified===true).length;
    $("blood-lab-archive-summary").innerHTML=`<div><b>${num(documentsTotal)}</b><span>izvornih dokumenata</span></div><div><b>${num(allResults.length)}</b><span>rezultata</span></div><div><b>${num(flagged)}</b><span>označeno na nalazu</span></div><div><b>${num(needsReview)}</b><span>traži provjeru</span></div><div><b>${num(stale)}</b><span>AI objašnjenja zastarjela</span></div><div><b>${num(verified)}</b><span>uspoređeno s originalom</span></div>`;
    const comparisonGroups=new Map();
    for(const {report,item} of allResults){
      const name=String(item.testName||"").trim().toLocaleLowerCase("hr-HR"),unit=String(item.unit||"").trim().toLocaleLowerCase("hr-HR"),lab=bloodResultSource(item,report.analysis||{}).trim().toLocaleLowerCase("hr-HR"),day=String(item.reportDate||report.analysis?.reportDate||"").slice(0,10),value=Number(item.numericValue);
      if(!name||!unit||!lab||!day||!Number.isFinite(value)||parseLabNumeric(item.valueText)!==value)continue;
      const key=[name,unit,lab].join("|");if(!comparisonGroups.has(key))comparisonGroups.set(key,{name:item.testName,unit:item.unit,lab:bloodResultSource(item,report.analysis||{}),rows:new Map()});
      const group=comparisonGroups.get(key);group.rows.set(report.id,{date:day,value:item.valueText,reportId:report.id});
    }
    const comparisons=[...comparisonGroups.values()].filter(group=>group.rows.size>1).sort((a,b)=>a.name.localeCompare(b.name,"hr"));
    $("blood-lab-comparison-list").innerHTML=comparisons.length?`${comparisons.map(group=>`<details class="blood-history-comparison"><summary><strong>${escapeHtml(group.name)}</strong><span>${escapeHtml(group.unit)} · ${num(group.rows.size)} nalaza</span></summary><div>${[...group.rows.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(row=>`<span><b>${escapeHtml(fmtIsoDay(row.date))}</b> · ${escapeHtml(row.value)} ${escapeHtml(group.unit)} · ${escapeHtml(group.lab)}</span>`).join("")}</div></details>`).join("")}<p class="blood-lab-footnote">Uključeni su samo rezultati s istim nazivom pretrage, jedinicom i laboratorijem te jasnom brojčanom vrijednošću iz najmanje dvije spremljene analize. Metoda i vrsta uzorka nisu uvijek dostupne; ovo je pregled povijesti, ne zaključak o kliničkoj promjeni.</p>`:'<div class="quiet">Za usporedbu su potrebna najmanje dva brojčana rezultata iste pretrage, jedinice i laboratorija.</div>';
    $("blood-lab-filter-count").textContent=`Prikazano ${num(allResults.filter(({report,item})=>bloodResultMatches(report,item)).length)} od ${num(allResults.length)} rezultata.`;
    if(!bloodLabReports.length){bloodLabHistory.innerHTML='<div class="blood-lab-empty">Još nema spremljenih nalaza. Nakon analize možeš pregledati i lokalno spremiti očitane podatke.</div>';return}
    bloodLabHistory.innerHTML=bloodLabReports.map(report=>{
      const analysis=report.analysis||{},documentCount=analysis.documents?.length||1,label=documentCount>1?`Zajednička analiza · ${num(documentCount)} PDF`:analysis.reportDate?fmtIsoDay(analysis.reportDate):"Datum nije naveden",lab=analysis.laboratory||(documentCount>1?"Više izvornih nalaza":"Laboratorij nije naveden"),results=analysis.results||[],matched=results.map((item,index)=>({item,index})).filter(({item})=>bloodResultMatches(report,item));
      if(!matched.length)return "";
      const groups=new Map();for(const row of matched){const key=String(row.item.category||"Ostalo");if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
      const sourcesHtml=(analysis.documents||[]).map(doc=>`<div class="blood-lab-source"><b>Nalaz ${num(doc.documentNumber)}</b><span>${doc.reportDate?escapeHtml(fmtIsoDay(doc.reportDate)):"Datum nije očitan"} · ${escapeHtml(doc.laboratory||"Laboratorij nije očitan")}</span>${doc.note?`<p>${escapeHtml(doc.note)}</p>`:""}</div>`).join("");
      const groupHtml=[...groups].map(([category,rows],groupIndex)=>`<details class="blood-result-group" ${groupIndex===0?"open":""}><summary><strong>${escapeHtml(category)}</strong><span class="badge">${num(rows.length)}</span></summary><div class="blood-result-group-list">${rows.map(({item,index})=>renderSavedBloodLabResult(report,item,index)).join("")}</div></details>`).join("");
      const staleOverview=analysis.overviewStale?'<div class="blood-result-stale">Sažetak je zastario jer su izmijenjeni jedan ili više rezultata. Provjeri ga prema trenutačnim vrijednostima.</div>':"";
      return `<details class="blood-report" data-report-id="${escapeHtml(report.id)}" ${openReports.has(report.id)?"open":""}><summary><span class="blood-report-title"><b>${escapeHtml(label)} · ${escapeHtml(lab)}</b><small>${num(matched.length)} od ${num(results.length)} rezultata · spremljeno ${escapeHtml(fmtIsoDay(String(report.createdAt||"").slice(0,10)))} · ${escapeHtml(fmtDateTime(report.createdAt))}${analysis.overviewStale?" · sažetak treba provjeriti":""}</small></span><span class="badge">Otvori</span></summary><div class="blood-report-content"><div class="blood-lab-summary"><div class="panel-title"><div><h3>${escapeHtml(label)}</h3><p class="panel-sub">${escapeHtml(lab)} · ${num(documentCount)} izvornih ${documentCount===1?"nalaz":"nalaza"}</p></div><span class="badge">AI procjena</span></div><p>${escapeHtml(analysis.overview||"Sažetak nije dostupan.")}</p>${staleOverview}</div>${sourcesHtml?`<div class="blood-lab-sources" aria-label="Izvorni nalazi">${sourcesHtml}</div>`:""}${analysis.explicitAlerts?.length?`<div class="blood-lab-alerts"><b>Doslovne oznake iz nalaza</b><br>${analysis.explicitAlerts.map(escapeHtml).join(" · ")}</div>`:""}${groupHtml}${analysis.questionsForClinician?.length?`<div class="blood-lab-questions"><b>Pitanja za liječnika</b><ul>${analysis.questionsForClinician.map(value=>`<li>${escapeHtml(value)}</li>`).join("")}</ul></div>`:""}<div class="blood-lab-footnote">${escapeHtml(analysis.limitations||"Provjeri očitanja prema izvornom laboratorijskom nalazu.")}</div><button type="button" class="blood-report-delete" data-delete-blood-report="${escapeHtml(report.id)}">Obriši spremljenu analizu</button></div></details>`;
    }).join("")||'<div class="blood-lab-empty">Nijedan spremljeni rezultat ne odgovara odabranom filtru. Promijeni filtre za prikaz cijele arhive.</div>';
  };
  const loadBloodLabReports=async()=>{
    try{
      const payload=await getBloodLabReports();bloodLabAiConfigured=payload.aiConfigured;bloodLabAiStatus=payload.aiStatus||null;renderBloodLabHistory(payload.reports||[]);
      const last=bloodLabAiStatus,when=last?.checkedAt?new Date(last.checkedAt).toLocaleString("hr-HR"):null;
      bloodLabStatus.className="journal-status";
      if(!bloodLabAiConfigured)bloodLabStatus.textContent="OpenAI API ključ nije konfiguriran. Dodaj OPENAI_API_KEY u .env i ponovno pokreni dashboard.";
      else if(last?.state==="success")bloodLabStatus.textContent=`OpenAI API ključ konfiguriran · zadnja analiza uspjela ${when}. To ne potvrđuje trenutačnu kvotu. PDF se šalje samo nakon tvoje potvrde.`;
      else if(last?.state==="checking")bloodLabStatus.textContent="OpenAI analiza je u tijeku. PDF se obrađuje samo za ovaj zahtjev.";
      else if(last?.message)bloodLabStatus.textContent=`OpenAI ključ je konfiguriran · zadnji pokušaj ${when||"od pokretanja"}: ${last.message}`;
      else bloodLabStatus.textContent=`OpenAI API ključ konfiguriran · dostupnost i kvota nisu provjerene. To se utvrđuje tek pri analizi (${payload.model||"model nije naveden"}); PDF se šalje samo nakon tvoje potvrde.`;
      syncBloodLabControls();
    }catch(error){bloodLabAiConfigured=false;syncBloodLabControls();bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=error.message;bloodLabHistory.innerHTML='<div class="blood-lab-empty">Lokalna arhiva nalaza trenutačno nije dostupna.</div>'}
  };
  $("blood-lab-file").addEventListener("change",()=>{
    if(bloodLabBusy||bloodLabAnalysis)return;
    const added=[...($("blood-lab-file").files||[])];$("blood-lab-file").value="";
    if(!added.length)return;
    const next=[...bloodLabFiles];for(const file of added){if(!next.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))next.push(file)}
    const invalid=next.find(file=>!file.size||file.size>15*1024*1024||(!/\.pdf$/i.test(file.name)&&file.type!=="application/pdf"));
    const total=next.reduce((sum,file)=>sum+file.size,0);
    const message=next.length>10?"Možeš dodati najviše 10 PDF nalaza.":invalid?"Svaki nalaz mora biti PDF do 15 MB i ne smije biti prazan.":total>30*1024*1024?"Odabrani nalazi zajedno prelaze dopuštenih 30 MB.":null;
    if(message){bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=message;return}
    bloodLabFiles=next;$("blood-lab-consent").checked=false;renderBloodLabSelection();
    bloodLabStatus.className="journal-status";bloodLabStatus.textContent=`Odabrano PDF nalaza: ${num(next.length)} · ${num(total/1024/1024,1)} MB ukupno. Potvrdi zajedničku analizu.`;
  });
  $("blood-lab-files").addEventListener("click",event=>{
    const button=event.target.closest("[data-remove-blood-file]");if(!button||bloodLabBusy||bloodLabAnalysis)return;
    bloodLabFiles.splice(Number(button.dataset.removeBloodFile),1);$("blood-lab-consent").checked=false;renderBloodLabSelection();
    bloodLabStatus.className="journal-status";bloodLabStatus.textContent=bloodLabFiles.length?`Odabrano PDF nalaza: ${num(bloodLabFiles.length)}. Potvrdi slanje AI analizi.`:"Dodaj PDF nalaze za zajedničku analizu.";
  });
  $("blood-lab-consent").addEventListener("change",syncBloodLabControls);
  $("blood-lab-form").addEventListener("submit",async event=>{
    event.preventDefault();if(!bloodLabFiles.length||!$("blood-lab-consent").checked||bloodLabBusy||bloodLabAnalysis||!bloodLabAiConfigured)return;
    bloodLabBusy=true;syncBloodLabControls();bloodLabAnalyzeButton.textContent="Čitam nalaze…";bloodLabStatus.className="journal-status";bloodLabStatus.textContent=`Šaljem PDF nalaze (${num(bloodLabFiles.length)}) na zajedničku analizu. Izvorne datoteke se ne spremaju.`;
    try{
      const response=await analyzeBloodLabPdfs(bloodLabFiles);bloodLabAnalysis=response.analysis;bloodLabReview.innerHTML=renderBloodLabAnalysis(bloodLabAnalysis,true);bloodLabReview.hidden=false;bloodLabStatus.textContent=`Analiza je spremna · ${response.model}. Provjeri očitane vrijednosti i njihove izvorne nalaze prije spremanja.`;
    }catch(error){bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=error.message}
    finally{bloodLabBusy=false;bloodLabAnalyzeButton.textContent="Analiziraj nalaze zajedno";syncBloodLabControls()}
  });
  bloodLabReview.addEventListener("click",async event=>{
    if(event.target.closest("#blood-lab-discard")){bloodLabAnalysis=null;bloodLabReview.replaceChildren();bloodLabReview.hidden=true;syncBloodLabControls();bloodLabStatus.textContent="Analiza odbačena. PDF nalazi nisu spremljeni.";return}
    if(!event.target.closest("#blood-lab-save")||!bloodLabAnalysis)return;
    bloodLabReview.querySelectorAll("[data-blood-field]").forEach(input=>{
      const item=bloodLabAnalysis.results[Number(input.dataset.bloodIndex)];if(!item)return;
      const value=input.value.trim();
      const field=input.dataset.bloodField;
      if(String(item[field]??"")!==value){
        if(field==="valueText")item.numericValue=parseLabNumeric(value);
        item[field]=value;item.interpretationStale=true;item.needsReview=true;bloodLabAnalysis.overviewStale=true;
      }
    });
    const button=event.target.closest("#blood-lab-save");button.disabled=true;button.textContent="Spremam…";
    try{
      await saveBloodLabReport(bloodLabAnalysis);bloodLabAnalysis=null;bloodLabFiles=[];bloodLabReview.replaceChildren();bloodLabReview.hidden=true;$("blood-lab-form").reset();renderBloodLabSelection();await loadBloodLabReports();bloodLabStatus.className="journal-status";bloodLabStatus.textContent="Provjerena zajednička analiza spremljena je u lokalnu arhivu. Izvorni PDF-ovi nisu spremljeni.";
    }catch(error){button.disabled=false;button.textContent="Spremi provjerene podatke lokalno";bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=error.message}
  });
  const bloodLabFilterControls=[[$("blood-lab-search"),"query"],[$("blood-lab-category-filter"),"category"],[$("blood-lab-source-filter"),"source"],[$("blood-lab-status-filter"),"status"]];
  bloodLabFilterControls.forEach(([control,key])=>control.addEventListener(key==="query"?"input":"change",()=>{bloodLabFilters[key]=control.value;renderBloodLabHistory(bloodLabReports)}));
  bloodLabHistory.addEventListener("click",async event=>{
    const edit=event.target.closest("[data-edit-blood-result]"),confirmation=event.target.closest("[data-confirm-blood-result]"),cancel=event.target.closest("[data-cancel-blood-edit]");
    if(edit){const form=edit.closest(".saved-blood-result")?.querySelector(".blood-result-edit");if(form){form.hidden=false;form.querySelector("input")?.focus()}return}
    if(cancel){const form=cancel.closest(".blood-result-edit");if(form)form.hidden=true;return}
    if(confirmation){
      const result=confirmation.closest(".saved-blood-result"),reportId=result?.dataset.reportId,index=Number(result?.dataset.resultIndex);if(!reportId||!Number.isInteger(index))return;
      confirmation.disabled=true;confirmation.textContent="Spremam potvrdu…";
      try{await correctBloodLabResult(reportId,index,{confirmAgainstOriginal:true});await loadBloodLabReports();bloodLabStatus.textContent="Usporedba s izvornikom spremljena je u lokalnom zapisu."}
      catch(error){confirmation.disabled=false;confirmation.textContent="Usporedio/la s originalom";bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=error.message}return;
    }
    const button=event.target.closest("[data-delete-blood-report]");if(!button)return;
    button.disabled=true;button.textContent="Brišem…";
    try{await deleteBloodLabReport(button.dataset.deleteBloodReport);await loadBloodLabReports()}
    catch(error){button.disabled=false;button.textContent="Brisanje nije uspjelo";bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=error.message}
  });
  bloodLabHistory.addEventListener("submit",async event=>{
    const form=event.target.closest(".blood-result-edit");if(!form)return;event.preventDefault();
    const report=bloodLabReports.find(row=>row.id===form.dataset.reportId),current=report?.analysis?.results?.[Number(form.dataset.resultIndex)];
    if(!current){bloodLabStatus.className="journal-status error";bloodLabStatus.textContent="Spremljeni rezultat nije pronađen. Osvježi arhivu i pokušaj ponovno.";return}
    const changes={};
    for(const input of form.querySelectorAll("[data-saved-blood-field]")){
      const field=input.dataset.savedBloodField,value=input.value.trim(),previous=String(current[field]??"");
      if(value!==previous)changes[field]=["unit","referenceRange","labFlag"].includes(field)&&!value?null:value;
    }
    if(Object.hasOwn(changes,"valueText"))changes.numericValue=parseLabNumeric(changes.valueText);
    if(!Object.keys(changes).length){bloodLabStatus.className="journal-status";bloodLabStatus.textContent="Nema izmjena za spremanje.";form.hidden=true;return}
    const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent="Spremam…";
    try{
      await correctBloodLabResult(form.dataset.reportId,Number(form.dataset.resultIndex),changes);
      bloodLabStatus.className="journal-status";bloodLabStatus.textContent="Ispravak je spremljen lokalno. AI objašnjenje i sažetak označeni su za ponovnu provjeru.";
      await loadBloodLabReports();
    }catch(error){button.disabled=false;button.textContent="Spremi ispravak";bloodLabStatus.className="journal-status error";bloodLabStatus.textContent=error.message}
  });
  void loadBloodLabReports();
  const trainingCalendar=$("training-calendar");
  const quickNav=document.querySelector(".quick-nav"),quickNavLinks=[...document.querySelectorAll(".quick-nav a[href^='#']")];
  const revealQuickNavLink=link=>{
    const linksHost=quickNav?.querySelector(".quick-nav-links");if(!linksHost||!link)return;
    const hostRect=linksHost.getBoundingClientRect(),linkRect=link.getBoundingClientRect();
    if(linkRect.left>=hostRect.left+4&&linkRect.right<=hostRect.right-4)return;
    linksHost.scrollTo({left:Math.max(0,link.offsetLeft-(linksHost.clientWidth-link.offsetWidth)/2),behavior:activityScrollBehavior()});
  };
  const markActiveSection=targetId=>{
    let activeLink=null;
    quickNavLinks.forEach(link=>{if(link.hash===`#${targetId}`){link.setAttribute("aria-current","location");activeLink=link}else link.removeAttribute("aria-current")});
    revealQuickNavLink(activeLink);
  };
  quickNav?.addEventListener("click",event=>{
    const link=event.target.closest("a[href^='#']");if(!link)return;
    markActiveSection(link.hash.slice(1));
  });
  trainingCalendar.addEventListener("click",event=>{
    const button=event.target.closest(".calendar-day");if(!button||button.disabled)return;
    selectedCalendarDate=button.dataset.date;
    trainingCalendar.querySelectorAll(".calendar-day").forEach(dayButton=>{const selected=dayButton===button;dayButton.setAttribute("aria-pressed",String(selected));dayButton.tabIndex=selected?0:-1});
    renderCalendarDayDetail(calendarDaysByDate.get(selectedCalendarDate));
  });
  trainingCalendar.addEventListener("keydown",event=>{
    const button=event.target.closest(".calendar-day");if(!button)return;
    let week=Number(button.dataset.week),weekday=Number(button.dataset.weekday),step=0;
    if(event.key==="ArrowRight"){week+=1;step=1}
    else if(event.key==="ArrowLeft"){week-=1;step=-1}
    else if(event.key==="ArrowDown"){weekday+=1;step=1}
    else if(event.key==="ArrowUp"){weekday-=1;step=-1}
    else if(event.key==="Home"){weekday=0;step=1}
    else if(event.key==="End"){weekday=6;step=-1}
    else return;
    event.preventDefault();
    while(week>=0&&week<13&&weekday>=0&&weekday<7){
      const next=trainingCalendar.querySelector(`.calendar-day[data-week="${week}"][data-weekday="${weekday}"]`);
      if(next&&!next.disabled){next.focus({preventScroll:true});next.click();return}
      if(event.key==="ArrowRight"||event.key==="ArrowLeft")week+=step;
      else weekday+=step;
    }
  });
  $("calendar-day-detail").addEventListener("click",event=>{const button=event.target.closest(".calendar-run-item");if(!button||button.disabled)return;const activity=calendarActivitiesById.get(button.dataset.calendarActivityId);if(activity)void selectActivity(activity.id,true,activity)});
  $("ecg-readings").addEventListener("click",event=>{const button=event.target.closest(".ecg-reading-row");if(button)void selectEcgReading(button.dataset.ecgReadingId)});
  $("activity-list").addEventListener("click",event=>{const button=event.target.closest(".activity-select");if(button&&!button.disabled)void selectActivity(button.dataset.activityId,true)});
  document.addEventListener('analytics:activity-select',event=>{const run=event.detail;if(run?.id)void selectActivity(run.id,true,run)});
  document.addEventListener("dashboard-chart-date-select",event=>{
    const detail=event.detail||{},activityId=detail.activityId==null?null:String(detail.activityId);
    if(activityId){
      const activity=calendarActivitiesById.get(activityId)||visibleActivities.find(item=>String(item.id)===activityId);
      if(activity){void selectActivity(activityId,true,activity);return}
    }
    const target=chartDate(detail.date);if(target&&target!==dateInput.value){dateInput.value=target;dateInput.dispatchEvent(new Event("change",{bubbles:true}))}
  });
  $("history-window-control").addEventListener("click",event=>{
    const button=event.target.closest("[data-history-window]");if(!button)return;
    const mode=button.dataset.historyWindow;
    if(mode==="custom"){openCustomHistoryRange();return}
    if(mode==="auto"){historyCustomForm.hidden=true;applyHistoryWindow("auto");return}
    const range=presetHistoryRange(mode);historyCustomForm.hidden=true;applyHistoryWindow(mode,range);
  });
  historyCustomForm.addEventListener("submit",event=>{
    event.preventDefault();const start=historyRangeStart.value,end=historyRangeEnd.value;
    if(!start||!end){historyWindowError.textContent="Odaberi početni i završni datum.";return}
    if(start>end){historyWindowError.textContent="Početni datum mora biti prije završnog.";return}
    if(end>dateInput.value){historyWindowError.textContent="Kraj razdoblja ne može biti nakon datuma pregleda.";return}
    applyHistoryWindow("custom",{start,end});
  });
  $("refresh").addEventListener("click",()=>load(true));dateInput.addEventListener("change",()=>{
    if(selectedHistoryWindow!=="auto"&&selectedHistoryWindow!=="custom")applyHistoryWindow(selectedHistoryWindow,presetHistoryRange(selectedHistoryWindow));
    else if(selectedHistoryWindow==="custom"&&activeHistoryRange?.end>dateInput.value){
      const end=dateInput.value,start=activeHistoryRange.start>end?isoShift(end,-27):activeHistoryRange.start;
      historyRangeStart.value=start;historyRangeEnd.value=end;applyHistoryWindow("custom",{start,end});
    }else syncHistoryWindowControls();
    load(false);
  });
  syncHistoryWindowControls();load(false);
}
