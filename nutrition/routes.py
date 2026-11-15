"""Nutrition API. All writes remain local except explicit AI/import actions."""
import json
import sqlite3
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Any, Generic, TypeVar
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from . import models as m
from .repository import DomainError, dumps, now, one, rows, uid
from .engine import decimal, fixed, text
from .service import NutritionService


T = TypeVar('T')


class Response(BaseModel, Generic[T]):
    ok: bool = True
    data: T


def create_router(core):
    router = APIRouter(prefix='/api/nutrition', tags=['nutrition'])
    service = NutritionService(core.archive_connection, core.iso_today)

    def run(action):
        core.initialize_archive()
        try:
            return {'ok': True, 'data': json.loads(dumps(action()))}
        except DomainError as e:
            if e.details is not None:
                return JSONResponse(status_code=e.status, content=json.loads(dumps(
                    {'ok':False, 'error':str(e), 'details':e.details})))
            raise HTTPException(e.status, str(e)) from e
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, 'Promjena nije spremljena zbog sukoba podataka.') from e
        except sqlite3.Error as e:
            raise HTTPException(503, 'Lokalna arhiva prehrane trenutačno nije dostupna.') from e

    def read(action):
        def work():
            with core.archive_connection() as db:
                return action(db)
        return run(work)

    Key = Annotated[str, Header(alias='Idempotency-Key', min_length=1, max_length=150)]

    @router.get('/profile', response_model=Response)
    def profile(): return read(service.profile)

    @router.put('/profile', response_model=Response)
    def save_profile(body: m.Profile): return run(lambda: service.save_profile(body.model_dump()))

    @router.get('/foods', response_model=Response[list[m.FoodResponse]])
    def foods(): return read(service.foods)

    @router.post('/foods', response_model=Response[m.FoodResponse])
    def create_food(body: m.Food): return run(lambda: service.save_food(body.model_dump()))

    @router.patch('/foods/{food_id}', response_model=Response[m.FoodResponse])
    def update_food(food_id: str, body: m.Food): return run(lambda: service.save_food(body.model_dump(), food_id))

    @router.get('/inventory', response_model=Response[list[m.LotResponse]])
    def inventory(): return read(service.inventory)

    @router.get('/inventory/history', response_model=Response)
    def history(limit: int = Query(100, ge=1, le=500)):
        return read(lambda db: rows(db,'SELECT t.*,o.created_at,o.operation_type,o.reversed_by FROM nutrition_inventory_transactions t JOIN nutrition_operations o ON o.id=t.operation_id ORDER BY t.rowid DESC LIMIT ?',(limit,)))

    @router.post('/inventory/receipts', response_model=Response)
    def receipt(body: m.Receipt, idempotency_key: Key):
        data=body.model_dump()
        return run(lambda: service.repo.operation('receipt',idempotency_key,data,lambda db,op:service.receive(db,op,data)))

    @router.post('/inventory/{kind}', response_model=Response)
    def lot_change(kind: str,body: m.LotChange,idempotency_key: Key):
        names={'adjustments':'adjustment','transfers':'transfer','waste':'waste'}
        if kind not in names:raise HTTPException(404,'Nepoznata inventarna operacija.')
        return run(lambda:service.lot_change(names[kind],idempotency_key,body.model_dump()))

    @router.get('/recipes', response_model=Response[list[m.RecipeResponse]])
    def recipes(): return read(lambda db:[service.recipe(db,r['id']) for r in rows(db,'SELECT id FROM nutrition_recipes WHERE archived=0 ORDER BY name')])

    @router.get('/recipes/{recipe_id}', response_model=Response[m.RecipeResponse])
    def recipe(recipe_id:str):return read(lambda db:service.recipe(db,recipe_id))

    @router.post('/recipes', response_model=Response[m.RecipeResponse])
    def create_recipe(body:m.Recipe):return run(lambda:service.save_recipe(body.model_dump()))

    @router.patch('/recipes/{recipe_id}', response_model=Response[m.RecipeResponse])
    def update_recipe(recipe_id:str,body:m.Recipe):return run(lambda:service.save_recipe(body.model_dump(),recipe_id))

    @router.post('/recipes/{recipe_id}/duplicate', response_model=Response)
    def duplicate(recipe_id:str):
        def work():
            with core.archive_connection() as db:r=service.recipe(db,recipe_id)
            data={k:v for k,v in r.items() if k in m.Recipe.model_fields};data['name']+=' · kopija'
            return service.save_recipe(m.Recipe.model_validate(data).model_dump())
        return run(work)

    @router.post('/recipes/{recipe_id}/scale-preview', response_model=Response)
    def scale(recipe_id:str,body:m.Scale):return read(lambda db:service.scale(db,service.recipe(db,recipe_id),body.model_dump()))

    @router.post('/prep/preview', response_model=Response)
    def prep_preview(body:m.Cook):return read(lambda db:service.preview_cook(db,body.model_dump()))

    @router.post('/prep/batches', response_model=Response)
    def cook(body:m.Cook,idempotency_key:Key):return run(lambda:service.cook(idempotency_key,body.model_dump()))

    @router.get('/prep/batches', response_model=Response)
    def batches():return read(service.batches)

    @router.get('/prep/portions', response_model=Response)
    def portions():return read(lambda db:[l for l in service.inventory(db) if l['batch_id']])

    @router.get('/prep/schedule', response_model=Response)
    def prep_schedule():return read(lambda db:rows(db,'SELECT s.*,r.name FROM nutrition_prep_schedule s JOIN nutrition_recipe_versions v ON v.id=s.recipe_version_id JOIN nutrition_recipes r ON r.id=v.recipe_id WHERE s.status=? ORDER BY planned_date LIMIT 100',('planned',)))

    @router.post('/prep/schedule', response_model=Response)
    def schedule_prep(body:m.PrepSchedule,idempotency_key:Key):
        def action(db,op):
            if body.plannedDate<core.iso_today():raise DomainError('Planirana priprema ne može biti u prošlosti.',422)
            service.recipe(db,version_id=body.recipeVersionId)
            schedule_id=uid()
            db.execute('INSERT INTO nutrition_prep_schedule(id,planned_date,recipe_version_id,portions) VALUES (?,?,?,?)',(schedule_id,str(body.plannedDate),body.recipeVersionId,fixed(body.portions)))
            return {'id':schedule_id}
        return run(lambda:service.repo.operation('schedule-prep',idempotency_key,body.model_dump(),action))

    @router.delete('/prep/schedule/{schedule_id}', response_model=Response)
    def cancel_prep(schedule_id:str):
        def action(db):
            db.execute('UPDATE nutrition_prep_schedule SET status=? WHERE id=? AND status=?',('cancelled',schedule_id,'planned'));return {'id':schedule_id}
        return read(action)

    @router.get('/diary', response_model=Response)
    def diary(date:date):return read(lambda db:service.diary(db,date))

    @router.post('/diary/entries', response_model=Response)
    def log(body:m.Log,idempotency_key:Key):return run(lambda:service.log(idempotency_key,body.model_dump()))

    @router.put('/diary/days/{day}', response_model=Response)
    def complete_day(day:date,body:m.Day):
        def work(db):
            if day>core.iso_today():raise DomainError('Budući dan ne može biti zaključen.',422)
            db.execute('INSERT INTO nutrition_diary_days VALUES (?,?) ON CONFLICT(entry_date) DO UPDATE SET complete=excluded.complete',(str(day),int(body.complete)))
            return service.diary(db,day)
        return read(work)

    @router.post('/operations/{operation_id}/reverse', response_model=Response)
    def reverse(operation_id:str,idempotency_key:Key):return run(lambda:service.reverse(idempotency_key,operation_id))

    @router.get('/plan', response_model=Response)
    def plan(week:date):return read(lambda db:service.plan(db,week,week+timedelta(days=6)))

    @router.get('/plan/summary', response_model=Response)
    def plan_summary(week:date):return read(lambda db:service.plan_summary(db,week,week+timedelta(days=6)))

    @router.post('/plan/entries', response_model=Response)
    def create_plan(body:m.Plan):return run(lambda:service.save_plan(body.model_dump()))

    @router.patch('/plan/entries/{plan_id}', response_model=Response)
    def update_plan(plan_id:str,body:m.Plan):return run(lambda:service.save_plan(body.model_dump(),plan_id))

    @router.delete('/plan/entries/{plan_id}', response_model=Response)
    def delete_plan(plan_id:str):
        def work(db):
            db.execute('DELETE FROM nutrition_meal_plan_entries WHERE id=?',(plan_id,))
            return {'id':plan_id}
        return read(work)

    @router.post('/shopping/preview', response_model=Response)
    def shopping_preview(body:m.ShoppingBuild):return read(lambda db:service.shopping(db,body.start,body.end))

    @router.post('/shopping/lists', response_model=Response)
    def shopping_create(body:m.ShoppingBuild,idempotency_key:Key):
        def action(db,op):
            items=service.shopping(db,body.start,body.end);list_id=uid()
            db.execute('INSERT INTO nutrition_shopping_lists VALUES (?,?,?,1)',(list_id,body.name,now()))
            for item in items:
                if Decimal(item['quantity'])<=0:continue
                item_id=uid()
                db.execute('INSERT INTO nutrition_shopping_items (id,list_id,food_id,required,quantity) VALUES (?,?,?,?,?)',(item_id,list_id,item['foodId'],fixed(item['required']),fixed(item['quantity'])))
                for plan_id in item['planIds']:db.execute('INSERT INTO nutrition_shopping_sources VALUES (?,?)',(item_id,plan_id))
            return {'id':list_id}
        return run(lambda:service.repo.operation('shopping',idempotency_key,body.model_dump(),action))

    @router.get('/shopping/lists', response_model=Response)
    def shopping_lists():
        def work(db):
            lists=rows(db,'SELECT * FROM nutrition_shopping_lists ORDER BY created_at DESC LIMIT 30')
            for l in lists:
                l['items']=rows(db,'SELECT i.*,f.name,f.unit FROM nutrition_shopping_items i JOIN nutrition_foods f ON f.id=i.food_id WHERE list_id=?',(l['id'],))
                for i in l['items']:
                    i['quantity']=text(decimal(i['quantity']));i['required']=text(decimal(i['required']));i['packageSize']=text(decimal(i['package_size'])) if i['package_size'] else None
            return lists
        return read(work)

    @router.patch('/shopping/items/{item_id}', response_model=Response)
    def shopping_edit(item_id:str,body:m.ShoppingEdit):
        def work(db):
            cur=db.execute('UPDATE nutrition_shopping_items SET quantity=?,package_size=?,checked=?,version=version+1 WHERE id=? AND version=? AND received=0',(fixed(body.quantity),fixed(body.packageSize) if body.packageSize else None,int(body.checked),item_id,body.expectedVersion))
            if cur.rowcount!=1:raise DomainError('Stavka je promijenjena ili već zaprimljena.')
            return {'id':item_id}
        return read(work)

    @router.post('/shopping/lists/{list_id}/items', response_model=Response)
    def shopping_manual(list_id:str,body:m.ShoppingManual,idempotency_key:Key):
        def action(db,op):
            one(db,'SELECT id FROM nutrition_shopping_lists WHERE id=?',(list_id,));service.food(db,body.foodId)
            existing=rows(db,'SELECT id FROM nutrition_shopping_items WHERE list_id=? AND food_id=?',(list_id,body.foodId))
            if existing:raise DomainError('Namirnica je već na listi. Uredi postojeću količinu.')
            item_id=uid()
            db.execute('INSERT INTO nutrition_shopping_items(id,list_id,food_id,required,quantity,package_size) VALUES (?,?,?,?,?,?)',(item_id,list_id,body.foodId,0,fixed(body.quantity),fixed(body.packageSize) if body.packageSize else None))
            return {'id':item_id}
        return run(lambda:service.repo.operation('shopping-manual',idempotency_key,{'listId':list_id,**body.model_dump()},action))

    @router.post('/shopping/receive', response_model=Response)
    def purchase(body:m.Purchase,idempotency_key:Key):
        def action(db,op):
            item=one(db,'SELECT * FROM nutrition_shopping_items WHERE id=?',(body.itemId,))
            if item['received'] or item['version']!=body.expectedVersion:raise DomainError('Stavka je već zaprimljena ili promijenjena.')
            result=service.receive(db,op,{'foodId':item['food_id'],**body.model_dump()})
            db.execute('UPDATE nutrition_shopping_items SET received=1,checked=1,version=version+1 WHERE id=?',(body.itemId,))
            result['itemId']=body.itemId
            return result
        return run(lambda:service.repo.operation('purchase',idempotency_key,body.model_dump(),action))

    @router.get('/dashboard', response_model=Response)
    def dashboard(date:date):
        def work(db):
            diary=service.diary(db,date);inventory=service.inventory(db,date)
            alerts=[l for l in inventory if l['expires_on'] and l['expires_on']<=str(date+timedelta(days=3))]
            return {'diary':diary,'profile':service.profile(db),'meals':service.plan(db,date,date),'portions':[{**l,'quantity':l['availableQuantity']} for l in inventory if l['batch_id'] and Decimal(l['availableQuantity'])>0],'alerts':alerts,'lowStock':[f for f in service.foods(db) if sum(Decimal(l['availableQuantity']) for l in inventory if l['food_id']==f['id'])<Decimal(f['minimumQuantity'])]}
        return read(work)

    @router.get('/analytics', response_model=Response)
    def analytics(start:date,end:date):
        def work(db):
            if end<start or (end-start).days>90:raise DomainError('Odaberi raspon do 90 dana.',422)
            return [service.diary(db,start+timedelta(days=i)) for i in range((end-start).days+1)]
        return read(work)

    from .garmin_adapter import attach_energy_routes
    from .adaptive import SportsAdjustment, preview as sports_preview
    @router.post('/adaptive/preview', response_model=Response)
    def adaptive(body:SportsAdjustment,date:date):
        return read(lambda db:sports_preview(service.diary(db,date)['targets'],body))
    @router.post('/adaptive/apply', response_model=Response)
    def adaptive_apply(body:SportsAdjustment,date:date):
        def work():
            with core.archive_connection() as db:
                profile=service.profile(db)
                targets=sports_preview(service.diary(db,date)['targets'],body)
            data={k:v for k,v in profile.items() if k in m.Profile.model_fields}
            rules=profile.get('sportsRules',[])
            rule={k:v for k,v in body.model_dump().items() if k!='expectedVersion'}
            data.update(effectiveDate=date,expectedVersion=body.expectedVersion,calories=targets['calories'],carbs=targets['carbs'],sportsRules=[*rules[-29:],rule])
            return service.save_profile(m.Profile.model_validate(data).model_dump())
        return run(work)
    attach_energy_routes(router,core,service,run)
    from .ai import attach_ai_routes
    attach_ai_routes(router,core,service,run)
    from .providers.usda import attach_food_routes
    attach_food_routes(router,core,service,run)
    return router
