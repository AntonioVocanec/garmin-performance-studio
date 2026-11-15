from datetime import date
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from .health import METRICS, read_history, fetch_chunk


class HealthFetch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    start: date
    end: date
    metrics: list[str] = Field(min_length=1,max_length=len(METRICS))


class RunComparison(BaseModel):
    model_config=ConfigDict(extra='forbid')
    activityIds:list[str]=Field(min_length=2,max_length=5)
    sameRouteConfirmed:bool=False


def create_router(core,detail_loader=None):
    router=APIRouter(prefix='/api/analytics',tags=['analytics'])

    def check(end):
        if end>core.iso_today(): raise HTTPException(422,'Razdoblje ne može završiti u budućnosti.')

    @router.get('/health')
    def health(start:date,end:date,metrics:str='hrv,restingHeartRate,sleepSeconds'):
        check(end)
        try: return read_history(core,start,end,metrics.split(','))
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc

    @router.post('/health/fetch')
    def fetch(body:HealthFetch):
        check(body.end)
        try: return fetch_chunk(core,body.start,body.end,body.metrics)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc

    @router.get('/nutrition-training')
    def nutrition_training(start:date,end:date):
        check(end)
        if end<start or (end-start).days>=90:raise HTTPException(422,'Odaberi do 90 dana.')
        from .training import nutrition_context
        return nutrition_context(core,start,end)

    @router.get('/activities')
    def activities(start:date,end:date,q:str=Query(default='',max_length=100),reference:str|None=None,offset:int=Query(default=0,ge=0),limit:int=Query(default=50,ge=1,le=100)):
        check(end)
        if end<start or (end-start).days>=365:raise HTTPException(422,'Odaberi do 365 dana.')
        from .training import read_activities
        from .running import suggestions
        with core.archive_connection() as db:items=[i for i in read_activities(db,start,end) if i.get('isRun') and not i.get('isSauna')]
        ref=next((i for i in items if str(i['id'])==reference),None)
        proposed=suggestions(ref,items)[:10] if ref else []
        items=[i for i in reversed(items) if q.casefold() in str(i.get('name','')).casefold()]
        return {'ok':True,'items':items[offset:offset+limit],'total':len(items),'suggestions':proposed,'offset':offset}

    @router.get('/training-response')
    def response(start:date,end:date,sport:str|None=Query(default=None,max_length=60)):
        check(end)
        if end<start or (end-start).days>=90:raise HTTPException(422,'Odaberi do 90 dana.')
        from .training import training_response
        return training_response(core,start,end,sport)

    @router.post('/running-comparison')
    def compare(body:RunComparison):
        if len(set(body.activityIds))!=len(body.activityIds) or any(not s.isascii() or not s.isdigit() or len(s)>20 for s in body.activityIds):
            raise HTTPException(422,'Identifikatori trčanja nisu valjani.')
        from .training import read_activities
        from .running import comparison
        with core.archive_connection() as db:
            records=read_activities(db,date.min,core.iso_today())
        items=[]
        for key in body.activityIds:
            row=next((i for i in records if str(i['id'])==key),None)
            if not row or not row.get('isRun') or row.get('isSauna'):raise HTTPException(422,'Odabrana aktivnost nije dostupno trčanje.')
            item=dict(row);item['trace']=[];item['detailSource']={'ok':False,'message':'Detalji nisu dostupni.'}
            if detail_loader:
                try:
                    result=detail_loader(key);detail=result.get('detail',{})
                    for field in ['averageCadence','strideLength','groundContactTime','verticalOscillation','verticalRatio','averagePower']:
                        if detail.get(field) is not None:item[field]=detail[field]
                    item['trace']=detail.get('trace',[])
                    item['detailSource']={'ok':bool(item['trace']),'message':result.get('message')}
                except (core.GarminError,HTTPException):
                    pass
            items.append(item)
        try:return comparison(items,body.sameRouteConfirmed)
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc

    return router
