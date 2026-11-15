"""Per-calendar-day observations. Failed refreshes never erase saved measurements."""
import json
import math
from datetime import date, datetime, timedelta, timezone

METRICS = {
    'hrv': ('hrv', 'HRV tijekom noći', 'ms'),
    'restingHeartRate': ('dailySummaries', 'Puls u mirovanju', 'bpm'),
    'sleepSeconds': ('sleepHistory', 'Trajanje sna', 's'),
    'sleepScore': ('sleepHistory', 'Sleep Score', '/100'),
    'stress': ('stress', 'Stres', '/100'),
    'bodyBattery': ('dailySummaries', 'Body Battery', '/100'),
    'dayRespiration': ('dailySummaries', 'Disanje', '/min'),
    'daySpO2': ('dailySummaries', 'SpO₂', '%'),
    'skinTemperature': ('skinTemperature', 'Temperatura kože · odstupanje', '°C'),
}


def days(start, end):
    return [(start+timedelta(days=i)).isoformat() for i in range((end-start).days+1)]


def validate_range(start, end, metrics, maximum=365):
    if end < start or (end-start).days >= maximum:
        raise ValueError(f'Odaberi razdoblje od 1 do {maximum} dana.')
    if not metrics or len(metrics) != len(set(metrics)) or any(m not in METRICS for m in metrics):
        raise ValueError('Odaberi podržane zdravstvene metrike bez ponavljanja.')


def finite(value):
    try:
        number = float(value) if value is not None and not isinstance(value, bool) else None
        return number if number is not None and math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


def store_observations(core, day, values, source, fetched_at):
    date.fromisoformat(day)
    with core.archive_connection() as db:
        for metric, value in values.items():
            number = finite(value)
            if metric in METRICS and number is not None:
                db.execute('''INSERT INTO health_observations VALUES (?,?,?,?,?)
                    ON CONFLICT(observation_date,metric) DO UPDATE SET value=excluded.value,
                    source=excluded.source,fetched_at=excluded.fetched_at
                    WHERE excluded.fetched_at>=health_observations.fetched_at''', (day,metric,number,source,fetched_at))


def store_results(core, results, start, end, sleep=None):
    sleep = sleep if sleep is not None else core.normalize_sleep({}, results.get('sleepHistory', {}).get('data', []))
    rows = core.daily_trends(results, sleep)
    for source, result in results.items():
        relevant = [k for k, definition in METRICS.items() if definition[0] == source]
        if not relevant:
            continue
        fetched = result.get('_fetchedAt') or datetime.now(timezone.utc).isoformat(timespec='seconds')
        if result.get('ok'):
            for row in rows:
                day = str(row.get('date', ''))[:10]
                if str(start) <= day <= str(end):
                    store_observations(core, day, {k:row.get(k) for k in relevant}, source, fetched)
        with core.archive_connection() as db:
            for day in days(start,end):
                db.execute('''INSERT INTO health_fetches VALUES (?,?,?,?,?) ON CONFLICT(observation_date,source)
                    DO UPDATE SET status=excluded.status,attempted_at=excluded.attempted_at,message=excluded.message
                    WHERE excluded.attempted_at>=health_fetches.attempted_at''',
                    (day,source,'available' if result.get('ok') and not result.get('partial') else 'failed',fetched,
                     str(result.get('message') or '')[:200] or None))


def read_history(core, start, end, metrics):
    validate_range(start,end,metrics)
    calendar = days(start,end)
    indexed = {day:{'date':day, **{m:None for m in metrics}, 'observations':{}} for day in calendar}
    with core.archive_connection() as db:
        observations = db.execute('SELECT * FROM health_observations WHERE observation_date BETWEEN ? AND ?', (str(start),str(end))).fetchall()
        fetches = db.execute('SELECT * FROM health_fetches WHERE observation_date BETWEEN ? AND ?', (str(start),str(end))).fetchall()
    fetched = {(r[0],r[1]):r for r in fetches}
    for day,metric,value,source,stamp in observations:
        if metric in metrics:
            indexed[day][metric] = value
            indexed[day]['observations'][metric] = {'source':source,'fetchedAt':stamp}
    coverage = {}
    now = datetime.now(timezone.utc)
    for metric in metrics:
        source,label,unit = METRICS[metric]
        available = [d for d in calendar if indexed[d][metric] is not None]
        missing = []
        for day in calendar:
            record = fetched.get((day,source))
            try:
                age = (now-datetime.fromisoformat(record[3]).astimezone(timezone.utc)).total_seconds() if record else math.inf
            except (ValueError,TypeError):
                age = math.inf
            if not record or record[2] != 'available' or age > (300 if day==str(core.iso_today()) else 86400):
                missing.append(day)
        coverage[metric] = {'label':label,'unit':unit,'source':source,'days':len(available),'expectedDays':len(calendar),
            'fetchedDays':sum(fetched.get((d,source),(None,None,None))[2]=='available' for d in calendar),
            'availableStart':available[0] if available else None,'availableEnd':available[-1] if available else None,
            'missingDates':missing,'stale':bool(missing)}
    return {'ok':True,'start':str(start),'end':str(end),'rows':list(indexed.values()),'coverage':coverage}


def fetch_chunk(core,start,end,metrics):
    validate_range(start,end,metrics,14)
    results = {}
    limited = False
    for source in dict.fromkeys(METRICS[m][0] for m in metrics):
        if source == 'skinTemperature':
            result = core.safe_garmin_skin_temperature_call(end,days=(end-start).days+1)
            for row in (result.get('data') or {}).get('history',[]):
                if str(start)<=str(row.get('date'))<=str(end):
                    store_observations(core,row['date'],{'skinTemperature':row.get('deviationC')},source,result.get('_fetchedAt') or datetime.now(timezone.utc).isoformat())
        else:
            paths = {
                'dailySummaries':('usersummary-service/v2/dailysummaries',{'startDate':str(start),'endDate':str(end)}),
                'hrv':(f'hrv-service/hrv/daily/{start}/{end}',None),
                'sleepHistory':('sleep-service/sleep/dailySleepSummariesByDate',{'startDate':str(start),'endDate':str(end)}),
                'stress':(f'usersummary-service/stats/stress/daily/{start}/{end}',None),
            }
            path,params = paths[source]
            result = core.safe_call(path,params)
        results[source] = result
        store_results(core,{source:result},start,end)
        if result.get('status')==429:
            limited=True
            break
    return {'ok':True,'rateLimited':limited,'sources':{k:{'ok':bool(v.get('ok')),'partial':bool(v.get('partial')),'status':v.get('status')} for k,v in results.items()}}


def store_activities(core,activities,source,start,end):
    stamp=source.get('_fetchedAt') or datetime.now(timezone.utc).isoformat(timespec='seconds')
    with core.archive_connection() as db:
        for item in activities:
            if item.get('id') is not None:
                db.execute('''INSERT INTO analytics_activity_snapshots VALUES (?,?,?) ON CONFLICT(activity_id)
                    DO UPDATE SET data_json=excluded.data_json,fetched_at=excluded.fetched_at
                    WHERE excluded.fetched_at>=analytics_activity_snapshots.fetched_at''',(str(item['id']),json.dumps(item,ensure_ascii=False),stamp))
        for day in days(start,end):
            db.execute('''INSERT INTO analytics_activity_coverage VALUES (?,?,?) ON CONFLICT(activity_date)
                DO UPDATE SET complete=excluded.complete,fetched_at=excluded.fetched_at
                WHERE excluded.fetched_at>=analytics_activity_coverage.fetched_at''',(day,int(bool(source.get('ok') and not source.get('partial'))),stamp))
