"""Independent contributions, not a readiness score or clinical classifier."""
from .health import finite


def dated_inputs(target,sleep,recovery,trends,heart_date=None):
    """Do not reuse an older row selected by a legacy source fallback."""
    day=str(target)
    current=next((row for row in trends if str(row.get('date'))==day),{})
    safe_sleep={**sleep,'totalSeconds':sleep.get('totalSeconds') if str(sleep.get('date'))==day else None}
    safe={**recovery,'hrvLastNight':current.get('hrv')}
    if str(heart_date)!=day:
        safe['restingHeartRate']=current.get('restingHeartRate');safe['_rhrSource']='dailySummaries'
    battery=recovery.get('bodyBatteryHistory') or {}
    if battery.get('date')!=day or battery.get('latestLevel') is None:
        safe['bodyBattery']=current.get('bodyBattery');safe['bodyBatteryHistory']={}
    return safe_sleep,safe


def contributions(target,sleep,debt,recovery,baseline,training,sources):
    result=[]
    def add(key,label,value,unit,source,note,samples=1,expected=1,comparison=None):
        source_state=sources.get(source,{})
        number=finite(value) if source_state.get('ok') is not False else None
        enough=comparison and comparison.get('sampleDays',0)>=7
        base=finite(comparison.get('median28d')) if enough else None
        result.append({'key':key,'label':label,'value':number,'unit':unit,'date':str(target),
            'source':source,'fetchedAt':source_state.get('fetchedAt') or source_state.get('_fetchedAt'),
            'sampleDays':samples if number is not None else 0,'expectedDays':expected,
            'baselineDays':comparison.get('sampleDays',0) if comparison else 0,'baseline':base,
            'delta':number-base if number is not None and base is not None else None,
            'note':note,'partial':bool(source_state.get('partial'))})
    add('sleep','San',sleep.get('totalSeconds'),'s','sleep','Posljednja noć; usporedba s medijanom prethodnih 28 dana.',comparison=baseline.get('sleep'))
    add('debt','Sleep Debt',debt.get('debtSeconds'),'s','sleepHistory',
        f"Postojeći obračun uključuje registrirane napove ({debt.get('napCoverageDays',0)} dana s podatkom o napovima).",debt.get('daysAvailable',0),debt.get('daysExpected',14))
    add('hrv','HRV',recovery.get('hrvLastNight'),'ms','hrv','Noćni prosjek; odstupanje samo prema osobnoj bazi.',comparison=baseline.get('hrv'))
    add('rhr','Puls u mirovanju',recovery.get('restingHeartRate'),'bpm',recovery.get('_rhrSource','heartRate'),'Dnevni Garmin podatak; prethodnih 28 dana za kontekst.',comparison=baseline.get('restingHeartRate'))
    day=recovery.get('bodyBatteryHistory') or {}
    add('battery','Body Battery',recovery.get('bodyBattery'),'/100','bodyBattery' if day.get('latestTime') else 'dailySummaries',
        'Posljednje stanje'+(f" u {day['latestTime']}" if day.get('latestTime') else '; vrijeme uzorka nije dostupno')+'. Nije usporedba s jutarnjim maksimumom.')
    status=training.get('trainingStatus') or {}
    add('load','Nedavno opterećenje',status.get('acuteLoad'),'load','garminTraining','Garminov akutni load; ne pretvara se u bodove spremnosti.')
    available=sum(row['value'] is not None for row in result)
    return {'date':str(target),'summary':f'{available}/6 doprinosa ima zapis. Odstupanja od osobne baze prikazana su odvojeno.', 'signals':result}
