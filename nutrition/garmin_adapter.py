"""Read the existing dashboard source; no independent Garmin credentials."""
from datetime import date


def energy_context(payload, today):
    day=payload.get('date')
    summary=payload.get('normalized',{}).get('dailySummary',{})
    source=payload.get('sources',{}).get('dailySummaries',{})
    unavailable=source.get('ok') is False
    active=None if unavailable else summary.get('activeCalories')
    resting=None if unavailable else summary.get('restingCalories')
    total=None if unavailable else summary.get('totalCalories')
    previous=summary.get('previousDayRestingCalories')
    estimate=active+previous if day==str(today) and active is not None and previous is not None and not unavailable else None
    return {'date':day,'activeCalories':active,'restingCalories':resting,'totalCalories':total,'localEstimate':estimate,'status':'unavailable' if unavailable else 'partial' if source.get('partial') else 'available','fetchedAt':source.get('fetchedAt'),'source':'Garmin dailySummaries','provisional':day==str(today),'history':[] if unavailable else payload.get('normalized',{}).get('energyHistory',[]),'nextRun':payload.get('normalized',{}).get('runnaSchedule',{}).get('nextRun')}


def attach_energy_routes(router,core,service,run):
    @router.get('/energy')
    def energy(date:date,force:bool=False):
        def work():
            try:
                return energy_context(core.build_dashboard(date,force_refresh=force),core.iso_today())
            except core.GarminError:
                return {'date':str(date),'status':'unavailable','totalCalories':None,'activeCalories':None,'restingCalories':None,'localEstimate':None,'source':'Garmin dailySummaries','fetchedAt':None,'provisional':date==core.iso_today()}
        return run(work)
