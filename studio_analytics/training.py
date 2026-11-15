"""Calendar joins and descriptive comparisons, without causal claims."""
import json
from datetime import date, timedelta
from statistics import median
from .health import days,finite


def read_activities(db,start,end):
    db.row_factory=__import__('sqlite3').Row
    result=[]
    for record in db.execute('''SELECT a.*,s.data_json FROM activities a LEFT JOIN analytics_activity_snapshots s
        ON s.activity_id=a.activity_id WHERE activity_date BETWEEN ? AND ? ORDER BY activity_date,activity_id''',(str(start),str(end))):
        row=dict(record)
        item=json.loads(row['data_json']) if row.get('data_json') else {}
        item.update({'id':row['activity_id'],'date':row['activity_date'],'name':row['name'],'type':row['sport'],
            'isRun':bool(row['is_run']),'distanceMeters':row['distance_meters'],'durationSeconds':row['duration_seconds'],
            'paceSecondsPerKm':row['pace_seconds_per_km'],'avgHeartRate':row['average_heart_rate'],
            'trainingLoad':row['training_load'],'elevationGain':row['elevation_gain']})
        item['isSauna']=bool(item.get('isSauna') or 'sauna' in str(item['name']).casefold())
        result.append(item)
    return result


def daily_loads(db,start,end):
    items=read_activities(db,start,end)
    coverage={r[0]:{'complete':bool(r[1]),'fetchedAt':r[2]} for r in db.execute('SELECT * FROM analytics_activity_coverage WHERE activity_date BETWEEN ? AND ?',(str(start),str(end)))}
    result={}
    for day in days(start,end):
        current=[i for i in items if i['date']==day and not i['isSauna']]
        values=[finite(i['trainingLoad']) for i in current]
        known=coverage.get(day,{}).get('complete',False) and all(v is not None and v>=0 for v in values)
        result[day]={'load':sum(values) if known else None,'activityCount':len(current),
            'activityCoverage':bool(coverage.get(day,{}).get('complete')),'fetchedAt':coverage.get(day,{}).get('fetchedAt')}
    return result


def quantile(values,p):
    ordered=sorted(values);offset=(len(ordered)-1)*p;lower=int(offset);upper=min(lower+1,len(ordered)-1)
    return ordered[lower]+(ordered[upper]-ordered[lower])*(offset-lower)


def nutrition_context(core,start,end):
    from nutrition.service import NutritionService
    service=NutritionService(core.archive_connection,core.iso_today)
    with core.archive_connection() as db:
        loads=daily_loads(db,start,end)
        observations={(r[0],r[1]):{'value':r[2],'source':r[3],'fetchedAt':r[4]} for r in db.execute(
            'SELECT * FROM health_observations WHERE observation_date BETWEEN ? AND ?', (str(start),str(end+timedelta(days=1))))}
        rows=[]
        for day in days(start,end):
            diary=service.diary(db,date.fromisoformat(day));load=loads[day]
            next_day=str(date.fromisoformat(day)+timedelta(days=1))
            targets=diary['targets'];calories=finite(diary['nutrients']['kcal']);carbs=finite(diary['comparableNutrients']['carbs'])
            reasons=[]
            if not diary['complete']:reasons.append('Dnevnik nije potvrđen kao potpun.')
            if load['load'] is None:reasons.append('Load ili povijest aktivnosti nisu potpuni.')
            if not load['activityCount']:reasons.append('Nema zabilježenog treninga za grupiranje.')
            if day==str(core.iso_today()):reasons.append('Današnji dan još traje.')
            if calories is None:reasons.append('Unos energije nije potpun.')
            rows.append({'date':day,**load,'complete':diary['complete'],'kcal':calories,'carbs':carbs,'carbComparison':diary['carbComparison'],
                'calorieTarget':finite(targets.get('calories')),'carbTarget':finite(targets.get('carbs')),
                'nextDate':next_day,'nextHrv':observations.get((next_day,'hrv')),'nextRestingHeartRate':observations.get((next_day,'restingHeartRate')),
                'nextSleep':observations.get((next_day,'sleepSeconds')),'exclusions':reasons,'group':None})
    eligible=[r for r in rows if not r['exclusions']]
    low=quantile([r['load'] for r in eligible],1/3) if eligible else None
    high=quantile([r['load'] for r in eligible],2/3) if eligible else None
    if low is not None and high is not None and low<high:
        for row in eligible:row['group']='lower' if row['load']<=low else 'higher' if row['load']>high else 'middle'
    groups=[]
    for key,label in [('lower','Niži load'),('higher','Viši load')]:
        group=[r for r in eligible if r['group']==key]
        def middle(metric):
            values=[r[metric] for r in group if r[metric] is not None]
            return {'value':median(values) if values else None,'days':len(values)}
        goals=[r['kcal']/r['calorieTarget']*100 for r in group if r['kcal'] is not None and r['calorieTarget'] and r['calorieTarget']>0]
        carb_goals=[r['carbs']/r['carbTarget']*100 for r in group if r['carbs'] is not None and r['carbTarget'] and r['carbTarget']>0]
        groups.append({'key':key,'label':label,'days':len(group),'kcal':middle('kcal'),'carbs':middle('carbs'),
            'calorieTargetPercent':median(goals) if goals else None,'carbTargetPercent':median(carb_goals) if carb_goals else None})
    sufficient=all(g['days']>=5 for g in groups)
    return {'ok':True,'start':str(start),'end':str(end),'rows':rows,'groups':groups if sufficient else [],'eligibleDays':len(eligible),
        'thresholds':{'lowerMax':low,'higherAbove':high},'sufficient':sufficient,
        'note':'Opisna usporedba donje i gornje trećine Garmin loada. Potrebno je najmanje 5 dana u svakoj grupi. Povezanost nije dokaz uzroka.'}


def training_response(core,start,end,sport=None):
    with core.archive_connection() as db:
        activities=[a for a in read_activities(db,start,end) if not a['isSauna']]
        rated={r[0]:{'value':r[1],'updatedAt':r[2]} for r in db.execute('SELECT activity_id,rpe,updated_at FROM activity_rpe WHERE activity_date BETWEEN ? AND ?',(str(start),str(end)))}
        journal={r[0]:{'fatigue':r[1],'updatedAt':r[2]} for r in db.execute('SELECT entry_date,fatigue,updated_at FROM daily_journal WHERE entry_date BETWEEN ? AND ?',(str(start),str(end+timedelta(days=1))))}
        coverage={r[0]:bool(r[1]) for r in db.execute('SELECT * FROM analytics_activity_coverage WHERE activity_date BETWEEN ? AND ?',(str(start),str(end)))}
    sports={}
    for a in activities:
        key,label=core.training_sport_group(a);a['sportGroup']=key;sports[key]=label
    counts={day:sum(a['date']==day for a in activities) for day in days(start,end)}
    if sport:activities=[a for a in activities if a['sportGroup']==sport]
    rows=[]
    for a in activities:
        day=a['date'];next_day=str(date.fromisoformat(day)+timedelta(days=1));record=rated.get(a['id'])
        rows.append({**a,'rpe':record['value'] if record else None,'rpeUpdatedAt':record['updatedAt'] if record else None,
            'workoutType':None,'sameDayFatigue':journal.get(day),'nextDayFatigue':journal.get(next_day),'nextDate':next_day,
            'activitiesOnDay':counts[day],'dayCoverage':coverage.get(day,False)})
    groups=[]
    for key in sorted({r['sportGroup'] for r in rows}):
        group=[r for r in rows if r['sportGroup']==key];values=[r['rpe'] for r in group if r['rpe'] is not None]
        groups.append({'sport':key,'label':sports[key],'activities':len(group),'rated':len(values),'medianRpe':median(values) if len(values)>=5 else None})
    return {'ok':True,'start':str(start),'end':str(end),'rows':rows,'groups':groups,'sports':sports,
        'rated':sum(r['rpe'] is not None for r in rows),'total':len(rows),
        'coveredDays':sum(coverage.values()),'expectedDays':(end-start).days+1,
        'note':'RPE je vezan uz aktivnost. Umor je dnevni zapis bez poznatog vremena mjerenja; ne pripisuje se pojedinom treningu. Podvrsta treninga nije potvrđena.'}
