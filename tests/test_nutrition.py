import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from nutrition.migrations import MIGRATIONS
from fastapi import HTTPException
from nutrition.models import Food, Recipe, Cook, Log, Profile, AIGenerate
from nutrition.repository import DomainError
from nutrition.service import NutritionService
from nutrition.garmin_adapter import energy_context


class NutritionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'test.sqlite3'
        with self.connection() as db:
            for migration in MIGRATIONS.values():migration(db)
        self.service=NutritionService(self.connection,lambda:date(2026,11,14))
        self.food=self.service.save_food(Food(name='Test oats',source='Synthetic label',sourceId='label-A',nutrients={'kcal':'400','protein':'10','carbs':'60','fat':'8','fiber':'5'}).model_dump())
        self.recipe=self.service.save_recipe(Recipe(name='Test meal',portions='2',minutes=10,ingredients=[{'foodId':self.food['id'],'quantity':'100'}],steps=['Cook synthetic sample.']).model_dump())

    def tearDown(self):self.temp.cleanup()

    @contextmanager
    def connection(self):
        db=sqlite3.connect(self.path);db.execute('PRAGMA foreign_keys=ON')
        try:
            yield db;db.commit()
        except Exception:
            db.rollback();raise
        finally:db.close()

    def receipt(self,key,quantity,expiry):
        data={'foodId':self.food['id'],'quantity':quantity,'location':'pantry','expiresOn':expiry,'cost':None}
        return self.service.repo.operation('receipt',key,data,lambda db,op:self.service.receive(db,op,data))

    def test_blank_profile_and_exact_fefo_idempotency(self):
        with self.connection() as db:self.assertEqual(self.service.profile(db),{'version':0})
        late=self.receipt('late','100','2026-12-01')
        early=self.receipt('early','100','2026-11-20')
        self.assertEqual(early,self.receipt('early','100','2026-11-20'))
        with self.connection() as db:
            allocations,short=self.service.allocate(db,self.food['id'],150000,date(2026,11,14))
            self.assertEqual(allocations[0]['lotId'],early['lotId']);self.assertEqual(short,0)
        with self.assertRaises(DomainError):self.receipt('early','50','2026-11-20')

    def test_receipt_cannot_be_used_before_business_date(self):
        self.receipt('stock', '100', '2026-12-01')
        with self.connection() as db:
            self.assertEqual(self.service.allocate(db, self.food['id'], 1000, date(2026,11,13))[1], 1000)

    def test_portion_cannot_be_consumed_before_preparation(self):
        self.receipt('stock', '100', '2026-12-01')
        cooked = self.service.cook('cook', Cook(recipeVersionId=self.recipe['versionId'], portions=2,
            location='fridge', expiresOn='2026-11-16', asOf='2026-11-14').model_dump())
        with self.assertRaises(DomainError):
            self.service.log('early', Log(date='2026-11-13', meal='lunch', kind='portion',
                sourceId=cooked['lotId'], quantity=1).model_dump())

    def test_dashboard_expired_stock_does_not_hide_low_stock(self):
        from nutrition.routes import create_router
        self.service.save_food(Food(name='Oats', source='Test', minimumQuantity=50).model_dump(), self.food['id'])
        self.receipt('stock', '100', '2026-11-01')
        core = SimpleNamespace(archive_connection=self.connection, iso_today=self.service.today,
            initialize_archive=lambda:None, ENV={}, OPENAI_API_KEY='', OPENAI_LAB_MODEL='test')
        endpoint = next(r.endpoint for r in create_router(core).routes if r.path=='/api/nutrition/dashboard')
        self.assertEqual(len(endpoint(date(2026,11,14))['data']['lowStock']), 1)

    def test_backdated_prep_uses_backdated_receipt_and_keeps_reversal_dates(self):
        body = {'foodId':self.food['id'],'quantity':'100','location':'pantry',
                'expiresOn':'2026-12-01','cost':None,'receivedOn':'2026-11-12'}
        self.service.repo.operation('receipt','dated',body,lambda db,op:self.service.receive(db,op,body))
        cook = Cook(recipeVersionId=self.recipe['versionId'], portions=2, location='fridge',
                    expiresOn='2026-11-16', asOf='2026-11-13').model_dump()
        batch = self.service.cook('yesterday',cook)
        self.assertEqual(batch,self.service.cook('yesterday',cook))
        log = Log(date='2026-11-13',meal='lunch',kind='portion',sourceId=batch['lotId'],quantity='0.5').model_dump()
        eaten = self.service.log('eat-yesterday',log)
        undo = self.service.reverse('undo-yesterday',eaten['operationId'])
        self.assertEqual(undo,self.service.reverse('undo-yesterday',eaten['operationId']))
        with self.connection() as db:
            portions = self.service.inventory(db,date(2026,11,13))
            self.assertEqual(portions[0]['availableQuantity'],'2')
            dates = db.execute('SELECT DISTINCT event_date FROM nutrition_inventory_transactions WHERE lot_id=?',(batch['lotId'],)).fetchall()
            self.assertEqual(dates,[('2026-11-13',)])

    def test_unknown_receipt_date_is_physical_but_unavailable(self):
        lot = self.receipt('stock','100','2026-12-01')
        with self.connection() as db:
            db.execute('UPDATE nutrition_inventory_lots SET available_on=NULL WHERE id=?',(lot['lotId'],))
            db.execute('UPDATE nutrition_inventory_transactions SET event_date=NULL')
            stock = self.service.inventory(db)[0]
            self.assertEqual(stock['quantity'],'100')
            self.assertEqual(stock['availableQuantity'],'0')
            self.assertFalse(stock['dateKnown'])
            self.assertEqual(self.service.allocate(db,self.food['id'],1000,date(2026,11,14))[1],1000)

    def test_scaling_shopping_and_ai_share_available_stock(self):
        from nutrition.routes import create_router
        from nutrition.models import AIPreview
        self.receipt('expired','100','2026-11-01')
        available = self.receipt('valid','50','2026-11-20')
        self.service.save_plan({'date':'2026-11-14','meal':'lunch','recipeVersionId':self.recipe['versionId'],'portions':'2'})
        core = SimpleNamespace(archive_connection=self.connection,iso_today=self.service.today,
            initialize_archive=lambda:None,ENV={},OPENAI_API_KEY='',OPENAI_LAB_MODEL='test')
        endpoints = {r.path:r.endpoint for r in create_router(core).routes}
        with self.connection() as db:
            scale = self.service.scale(db,self.recipe,{'portions':2,'asOf':date(2026,11,14)})
            shopping = self.service.shopping(db,date(2026,11,14),date(2026,11,14))
        self.assertEqual(scale['missing'][0]['quantity'],'50')
        self.assertEqual(shopping[0]['available'],'50')
        self.assertEqual(shopping[0]['quantity'],'50')
        preview = endpoints['/api/nutrition/ai/preview'](AIPreview(lotIds=[available['lotId']]))['data']
        self.assertEqual(preview['items'][0]['quantity'],'50')
        with self.assertRaises(DomainError):
            self.service.cook('insufficient',Cook(recipeVersionId=self.recipe['versionId'],portions=2,
                location='fridge',expiresOn='2026-11-16',asOf='2026-11-14').model_dump())

    def test_later_positive_correction_cannot_fund_earlier_consumption(self):
        lot = self.receipt('stock','10','2026-12-01')
        self.service.today = lambda:date(2026,11,15)
        with self.connection() as db:
            version=db.execute('SELECT version FROM nutrition_inventory_lots WHERE id=?',(lot['lotId'],)).fetchone()[0]
        self.service.lot_change('adjustment','correct',{'lotId':lot['lotId'],'quantity':100,'expectedVersion':version,'reason':'Count'})
        with self.connection() as db:
            self.assertEqual(self.service.allocate(db,self.food['id'],50000,date(2026,11,14))[1],40000)
            self.assertEqual(self.service.allocate(db,self.food['id'],50000,date(2026,11,15))[1],0)

    def test_cooking_partial_consumption_snapshot_and_reverse(self):
        self.receipt('stock','100','2026-12-01')
        request=Cook(recipeVersionId=self.recipe['versionId'],portions='2',location='fridge',expiresOn='2026-11-16',asOf='2026-11-14').model_dump()
        cooked=self.service.cook('cook',request)
        self.assertEqual(cooked,self.service.cook('cook',request))
        entry=Log(date='2026-11-14',meal='lunch',kind='portion',sourceId=cooked['lotId'],quantity='0.5').model_dump()
        logged=self.service.log('eat',entry)
        self.assertEqual(logged,self.service.log('eat',entry))
        with self.connection() as db:
            diary=self.service.diary(db,date(2026,11,14))
            self.assertEqual(Decimal(diary['nutrients']['kcal']),Decimal(100))
            self.assertEqual(db.execute('SELECT quantity FROM nutrition_inventory_lots WHERE id=?',(cooked['lotId'],)).fetchone()[0],1500)
        with self.assertRaises(DomainError):self.service.reverse('unsafe',cooked['operationId'])
        self.service.reverse('undo',logged['operationId'])
        with self.connection() as db:self.assertEqual(self.service.diary(db,date(2026,11,14))['entries'],[])

    def test_failure_rolls_back_all_raw_consumption(self):
        self.receipt('stock','20','2026-12-01')
        request=Cook(recipeVersionId=self.recipe['versionId'],portions='2',location='fridge',expiresOn='2026-11-16',asOf='2026-11-14').model_dump()
        with self.assertRaises(DomainError):self.service.cook('cook',request)
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],20000)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_prep_batches').fetchone()[0],0)

    def prep_endpoint(self):
        from nutrition.routes import create_router
        core = SimpleNamespace(archive_connection=self.connection, iso_today=self.service.today,
            initialize_archive=lambda:None, ENV={}, OPENAI_API_KEY='', OPENAI_LAB_MODEL='test')
        return next(r.endpoint for r in create_router(core).routes if r.path=='/api/nutrition/prep/preview')

    def optional_recipe(self):
        return self.service.save_recipe(Recipe(name='Optional oats', portions=1, minutes=5,
            ingredients=[{'foodId':self.food['id'],'quantity':10},
                         {'foodId':self.food['id'],'quantity':5,'optional':True}],
            steps=['Mix.']).model_dump())

    def cooking_body(self, recipe=None, portions=1):
        return Cook(recipeVersionId=(recipe or self.recipe)['versionId'], portions=portions,
            location='fridge', expiresOn='2026-11-16', asOf='2026-11-14').model_dump()

    def test_prep_preview_requires_explicit_optional_selection(self):
        recipe = self.optional_recipe()
        self.receipt('stock','100','2026-12-01')
        preview = self.prep_endpoint()(Cook.model_validate(self.cooking_body(recipe)))['data']
        self.assertFalse(preview['feasible'])

    def test_optional_exclusion_commits_the_preview_nutrients(self):
        recipe = self.optional_recipe()
        self.receipt('stock','100','2026-12-01')
        body = self.cooking_body(recipe) | {'optionalIngredientPositions':[]}
        preview = self.prep_endpoint()(Cook.model_validate(body))['data']
        self.assertEqual(preview['nutrients']['kcal'],'40')
        self.service.cook('optional',body)
        with self.connection() as db:
            snap=json.loads(db.execute('SELECT snapshot_json FROM nutrition_prep_batches').fetchone()[0])
            self.assertEqual(snap['nutrients'],preview['nutrients'])

    def test_prep_rejects_positive_scaled_quantity_below_minimum(self):
        recipe = self.service.save_recipe(Recipe(name='Tiny', portions=100, minutes=1,
            ingredients=[{'foodId':self.food['id'],'quantity':'0.01'}],steps=['Mix.']).model_dump())
        preview = self.prep_endpoint()(Cook.model_validate(self.cooking_body(recipe)))['data']
        self.assertFalse(preview['feasible'])
        with self.assertRaises(DomainError):
            self.service.cook('tiny',self.cooking_body(recipe))
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_prep_batches').fetchone()[0],0)

    def test_tiny_commit_cannot_create_batch_without_raw_consumption(self):
        recipe = self.service.save_recipe(Recipe(name='Tiny', portions=100, minutes=1,
            ingredients=[{'foodId':self.food['id'],'quantity':'0.01'}],steps=['Mix.']).model_dump())
        with self.assertRaises(DomainError):
            self.service.cook('tiny',self.cooking_body(recipe))

    def test_cooking_optional_inclusion_and_scaled_mass_cost_match_consumption(self):
        recipe = self.optional_recipe()
        data={'foodId':self.food['id'],'quantity':100,'location':'pantry','expiresOn':'2026-12-01','cost':'10'}
        self.service.repo.operation('receipt','priced',data,lambda db,op:self.service.receive(db,op,data))
        body=self.cooking_body(recipe,3) | {'optionalIngredientPositions':[1],'cookedMass':Decimal(150)}
        with self.connection() as db:preview=self.service.preview_cook(db,body)
        self.assertEqual(preview['nutrients'],{'kcal':'180','protein':'4.5','carbs':'27','fat':'3.6','fiber':'2.25'})
        self.assertEqual(preview['cost'],'4.5')
        self.assertEqual(preview['massPerPortion'],'50')
        self.assertEqual(sum(Decimal(a['quantity']) for a in preview['allocations']),Decimal(45))
        cooked=self.service.cook('cook',body | {'previewToken':preview['previewToken']})
        with self.connection() as db:
            snap=json.loads(db.execute('SELECT snapshot_json FROM nutrition_prep_batches').fetchone()[0])
            self.assertEqual(snap['nutrients'],preview['nutrients'])
            self.assertEqual(db.execute("SELECT SUM(delta) FROM nutrition_inventory_transactions WHERE reason='cooking'").fetchone()[0],-45000)
        self.service.log('eat',Log(date='2026-11-14',meal='lunch',kind='portion',sourceId=cooked['lotId'],quantity=1).model_dump())
        with self.connection() as db:self.assertEqual(self.service.diary(db,date(2026,11,14))['nutrients']['kcal'],'60')

    def test_cooking_preview_availability_aggregates_ingredients_and_excludes_expired_stock(self):
        recipe = self.optional_recipe()
        self.receipt('expired','100','2026-11-13')
        self.receipt('available','30','2026-12-01')
        body=self.cooking_body(recipe,3) | {'optionalIngredientPositions':[1]}
        preview=self.prep_endpoint()(Cook.model_validate(body))['data']
        self.assertFalse(preview['feasible'])
        self.assertEqual(preview['ingredientAvailability'], [{
            'foodId':self.food['id'], 'name':self.food['name'], 'unit':'g',
            'required':'45', 'available':'30', 'missing':'15',
        }])
        self.assertEqual(preview['missing'][0]['quantity'],'15')

    def test_changed_inventory_requires_refresh_even_when_stock_is_still_sufficient(self):
        self.receipt('stock','200','2026-12-01')
        body=self.cooking_body()
        with self.connection() as db:preview=self.service.preview_cook(db,body)
        self.receipt('new','10','2026-11-16')
        with self.assertRaises(DomainError) as error:self.service.cook('changed',body | {'previewToken':preview['previewToken']})
        self.assertEqual(error.exception.status,409)
        self.assertEqual(error.exception.details['code'],'preview_changed')
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_prep_batches').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],210000)

    def test_preview_and_commit_missing_and_invalid_dates_agree(self):
        for body in (self.cooking_body(), self.cooking_body() | {'expiresOn':'2026-11-01'}):
            with self.connection() as db:preview=self.service.preview_cook(db,body)
            self.assertFalse(preview['feasible'])
            with self.assertRaises(DomainError) as error:self.service.cook('invalid',body)
            self.assertEqual(error.exception.details['currentPreview']['issues'],preview['issues'])

    def test_concurrent_same_preview_and_same_key_are_idempotent(self):
        self.receipt('stock','200','2026-12-01')
        body=self.cooking_body()
        with self.connection() as db:preview=self.service.preview_cook(db,body)
        body |= {'previewToken':preview['previewToken']}
        with ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:self.service.cook('same',body),range(2)))
        self.assertEqual(results[0],results[1])
        with self.connection() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_prep_batches').fetchone()[0],1)

    def test_concurrent_different_keys_cannot_commit_one_preview_twice(self):
        self.receipt('stock','200','2026-12-01')
        body=self.cooking_body()
        with self.connection() as db:preview=self.service.preview_cook(db,body)
        body |= {'previewToken':preview['previewToken']}
        def cook(key):
            try:self.service.cook(key,body);return True
            except DomainError:return False
        with ThreadPoolExecutor(2) as pool:results=list(pool.map(cook,['one','two']))
        self.assertEqual(sum(results),1)
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_prep_batches').fetchone()[0],1)
            self.assertEqual(db.execute("SELECT SUM(quantity) FROM nutrition_inventory_lots WHERE food_id IS NOT NULL").fetchone()[0],150000)

    def test_cooking_rolls_back_after_first_real_deduction(self):
        self.receipt('early','50','2026-11-16')
        self.receipt('late','50','2026-12-01')
        original=self.service.change
        deductions=[]
        def fail(db,op,lot,delta,reason,event_date=None):
            if reason=='cooking':
                deductions.append(delta)
                if len(deductions)==2:raise DomainError('Synthetic failure')
            return original(db,op,lot,delta,reason,event_date)
        with patch.object(self.service,'change',side_effect=fail), self.assertRaises(DomainError):
            self.service.cook('rollback',self.cooking_body(portions=2))
        self.assertEqual(deductions,[-50000,-50000])
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],100000)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_operations WHERE operation_type=?',('cook',)).fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_prep_batches').fetchone()[0],0)
        self.service.cook('rollback',self.cooking_body(portions=2))

    def test_cooking_uses_displayed_rounded_quantities_for_nutrition(self):
        self.receipt('stock','100','2026-12-01')
        recipe=self.service.save_recipe(Recipe(name='Thirds',portions=3,minutes=1,
            ingredients=[{'foodId':self.food['id'],'quantity':100}],steps=['Mix.']).model_dump())
        with self.connection() as db:preview=self.service.preview_cook(db,self.cooking_body(recipe))
        self.assertEqual(preview['ingredients'][0]['quantity'],'33.333')
        self.assertEqual(preview['nutrients']['kcal'],'133.332')
        self.assertTrue(preview['warnings'])
        self.service.cook('rounded',self.cooking_body(recipe) | {'previewToken':preview['previewToken']})
        with self.connection() as db:
            self.assertEqual(db.execute("SELECT SUM(delta) FROM nutrition_inventory_transactions WHERE reason='cooking'").fetchone()[0],-33333)

    def test_legacy_cook_request_hash_is_preserved(self):
        self.receipt('stock','100','2026-12-01')
        old_body={k:v for k,v in self.cooking_body().items() if k not in ('previewToken','optionalIngredientPositions')}
        first=self.service.cook('old-key',old_body)
        self.assertEqual(self.service.cook('old-key',self.cooking_body()),first)

    def test_scaling_duplicate_ingredients_and_unknown_values(self):
        self.receipt('stock','50','2026-12-01')
        with self.connection() as db:
            result=self.service.scale(db,self.recipe,{'byInventory':True,'asOf':date(2026,11,14)})
            self.assertEqual(Decimal(result['portions']),Decimal(1))
        unknown=self.service.save_food(Food(name='Unknown',source='Manual').model_dump())
        self.assertIsNone(unknown['nutrients']['kcal'])

    def test_garmin_total_is_not_active_plus_total(self):
        result=energy_context({'date':'2026-11-14','normalized':{'dailySummary':{'activeCalories':500,'totalCalories':2300,'previousDayRestingCalories':2100}},'sources':{'dailySummaries':{'ok':True}}},date(2026,11,14))
        self.assertEqual(result['totalCalories'],2300);self.assertEqual(result['localEstimate'],2600)

    def test_plan_does_not_consume_stock_and_shopping_consolidates(self):
        self.receipt('stock','60','2026-12-01')
        for day in ('2026-11-15','2026-11-16'):
            self.service.save_plan({'date':day,'meal':'lunch','recipeVersionId':self.recipe['versionId'],'portions':'2','expectedVersion':1})
        with self.connection() as db:
            items=self.service.shopping(db,date(2026,11,15),date(2026,11,16))
            self.assertEqual(len(items),1);self.assertEqual(Decimal(items[0]['quantity']),140)
            self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],60000)

    def test_recipe_nutrition_version_is_immutable(self):
        food=Food(name='Revised',source='New synthetic label',nutrients={'kcal':'800'}).model_dump()
        self.service.save_food(food,self.food['id'])
        with self.connection() as db:
            recipe=self.service.recipe(db,self.recipe['id'])
            self.assertEqual(Decimal(recipe['perPortion']['kcal']),200)

    def import_usda(self, nutrient_rows, data_type='Foundation'):
        from nutrition.routes import create_router
        from nutrition.models import FoodImport
        core = SimpleNamespace(archive_connection=self.connection, iso_today=self.service.today,
                               initialize_archive=lambda:None, ENV={'USDA_API_KEY':'synthetic'},
                               OPENAI_API_KEY='', OPENAI_LAB_MODEL='synthetic')
        endpoint = next(r.endpoint for r in create_router(core).routes if r.path.endswith('/food-imports'))
        payload = {'fdcId':123, 'description':'Synthetic USDA', 'dataType':data_type, 'foodNutrients':nutrient_rows}
        with patch('nutrition.providers.usda.urlopen', return_value=BytesIO(json.dumps(payload).encode())):
            return endpoint(FoodImport(sourceId=123, state='dry', confirmed=True))['data']

    def test_usda_reviewed_create_preserves_source_and_requires_duplicate_consent(self):
        from nutrition.routes import create_router
        from pydantic import ValidationError
        core = SimpleNamespace(archive_connection=self.connection, iso_today=self.service.today,
            initialize_archive=lambda:None, ENV={'USDA_API_KEY':'synthetic'},
            OPENAI_API_KEY='', OPENAI_LAB_MODEL='synthetic')
        routes = create_router(core).routes
        preview = next(r.endpoint for r in routes if r.path.endswith('/preview') and 'food-imports' in r.path)
        create = next(r.endpoint for r in routes if r.path.endswith('/foods') and 'POST' in r.methods)
        detail = {'fdcId':123, 'description':'Synthetic oats', 'dataType':'Branded', 'foodNutrients':[
            {'nutrient':{'id':1008,'unitName':'kcal'},'amount':300},
            {'nutrient':{'id':1089,'name':'Iron, Fe','unitName':'MG'},'amount':4}]}
        with patch('nutrition.providers.usda.urlopen', return_value=BytesIO(json.dumps(detail).encode())) as fetch:
            draft = preview(123)['data']
            self.assertIn('/food/123?', fetch.call_args.args[0])
        with self.connection() as db:
            self.assertEqual(len(self.service.foods(db)),1)
        self.assertIsNone(draft['nutrients']['fiber'])
        self.assertEqual(draft['nutritionData']['carbDefinition'],'unknown')
        self.assertEqual(draft['micronutrients']['Iron, Fe'],{'value':'4','unit':'mg'})
        self.assertFalse(draft['allergensKnown'])
        self.assertEqual(draft['state'],'label')
        draft.update(name='Zobene pahuljice',state='dry')
        draft['nutrients']['kcal']='313'
        for unit in ['ml','piece']:
            with self.assertRaises(ValidationError):
                Food(**{**draft, 'unit':unit})
            self.assertEqual(Food(**{**draft,'unit':unit,'gramsPerUnit':'12'}).nutrients.kcal,313)
        body=Food(**draft)
        first=create(body,False,'review-1')['data']
        self.assertEqual(first,create(body,False,'review-1')['data'])
        with self.assertRaises(DomainError):
            self.service.reverse('invalid-inventory-undo', first['operationId'])
        self.assertEqual(first['nutritionData']['usda']['nutrients']['kcal'],'300')
        self.assertEqual(first['nutritionData']['originalValues'][0]['value'],'300')
        self.assertEqual(first['nutrients']['kcal'],'313')
        self.assertEqual(first['nutritionData']['usda']['description'],'Synthetic oats')
        self.assertEqual(first['name'],'Zobene pahuljice')
        with self.assertRaises(HTTPException) as conflict:
            create(body,False,'review-2')
        self.assertEqual(conflict.exception.status_code,409)
        self.assertNotEqual(first['id'],create(body,True,'review-3')['data']['id'])
        with self.connection() as db:
            self.assertEqual(len(self.service.foods(db)),3)
            self.assertEqual(db.execute('SELECT count(*) FROM nutrition_inventory_lots').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM nutrition_food_log_entries').fetchone()[0],0)

    def test_usda_bad_detail_and_failed_search_leave_catalog_intact(self):
        from nutrition.routes import create_router
        core = SimpleNamespace(archive_connection=self.connection, iso_today=self.service.today,
            initialize_archive=lambda:None, ENV={'USDA_API_KEY':'synthetic'},
            OPENAI_API_KEY='', OPENAI_LAB_MODEL='synthetic')
        routes=create_router(core).routes
        search=next(r.endpoint for r in routes if r.path.endswith('/food-search'))
        preview=next(r.endpoint for r in routes if 'food-imports/' in r.path)
        for payload in [{}, {'fdcId':999,'description':'Wrong food','foodNutrients':[]}, []]:
            with patch('nutrition.providers.usda.urlopen',return_value=BytesIO(json.dumps(payload).encode())):
                with self.assertRaises(HTTPException) as error:
                    preview(123)
                self.assertEqual(error.exception.status_code,422)
        from urllib.parse import parse_qs, urlsplit
        hit = {'fdcId':123, 'description':'Oats', 'dataType':'Branded', 'brandOwner':'Test brand'}
        with patch('nutrition.providers.usda.urlopen',return_value=BytesIO(json.dumps({'foods':[hit]}).encode())) as network:
            result=search('rolled oats')['data'][0]
            self.assertEqual((result['sourceId'],result['dataType'],result['brand']),('123','Branded','Test brand'))
            query=parse_qs(urlsplit(network.call_args.args[0]).query)
            self.assertEqual(set(query),{'query','pageSize','api_key'})
            self.assertEqual(query['query'],['rolled oats'])
        with patch('nutrition.providers.usda.urlopen',side_effect=TimeoutError):
            with self.assertRaises(HTTPException) as error:
                search('rolled oats')
            self.assertEqual(error.exception.status_code,503)
        with patch('nutrition.providers.usda.urlopen',return_value=BytesIO(b'{}')):
            with self.assertRaises(HTTPException) as error:
                search('rolled oats')
            self.assertEqual(error.exception.status_code,502)
        with self.connection() as db:
            self.assertEqual(len(self.service.foods(db)),1)

    def test_usda_energy_methods_are_supported(self):
        for nutrient_id in (1008, 2047, 2048):
            with self.subTest(nutrient_id=nutrient_id):
                food = self.import_usda([{'nutrient':{'id':nutrient_id,'unitName':'kcal'},'amount':350}])
                self.assertEqual(food['nutrients']['kcal'], '350')

    def test_usda_total_carbs_and_unknown_carbs_are_not_compared_as_eu(self):
        food = self.import_usda([
            {'nutrient':{'id':1005,'unitName':'g'},'amount':70},
            {'nutrient':{'id':1079,'unitName':'g'},'amount':10},
        ])
        self.assertEqual(food['nutrients']['carbs'], '70')
        self.assertEqual(food['comparableNutrients']['carbs'], '60')
        self.assertEqual(food['carbComparison'], 'estimated')
        with self.connection() as db:
            unknown = self.service.food(db, self.food['id'])
        self.assertIsNone(unknown['comparableNutrients']['carbs'])

    def test_eu_carbs_do_not_subtract_fiber_or_recalculate_energy(self):
        food = self.service.save_food(Food(name='EU label', state='cooked', source='EU package',
            nutrients={'kcal':123, 'carbs':20, 'fiber':5, 'protein':3, 'fat':2},
            nutritionData={'carbDefinition':'eu_available', 'energyMethod':'declared'}).model_dump())
        self.assertEqual(food['comparableNutrients']['carbs'], '20')
        self.assertEqual(food['nutrients']['kcal'], '123')
        self.assertEqual(food['carbComparison'], 'exact')
        self.assertEqual(food['nutritionData']['state'], 'cooked')
        self.assertEqual(food['nutritionData']['normalizedUnits']['carbs'], 'g')
        observations = food['nutritionData']['originalValues']
        self.assertEqual(next(v['value'] for v in observations if v['nutrientId']=='carbs'), '20')

    def test_incomplete_ambiguous_and_invalid_fiber_disable_comparison(self):
        for data_type, fiber in [('Branded',10), ('Unspecified',10), ('Foundation',None), ('Foundation',80)]:
            with self.subTest(data_type=data_type, fiber=fiber):
                food = self.import_usda([
                    {'nutrient':{'id':1005,'unitName':'g'},'amount':70},
                    {'nutrient':{'id':1079,'unitName':'g'},'amount':fiber},
                ], data_type)
                self.assertEqual(food['nutrients']['carbs'], '70')
                self.assertIsNone(food['comparableNutrients']['carbs'])
                self.assertEqual(food['carbComparison'], 'unavailable')

    def test_usda_units_original_precision_and_deterministic_energy_selection(self):
        observations = [
            {'nutrient':{'id':1008,'unitName':'kcal'},'amount':301},
            {'nutrient':{'id':2047,'unitName':'kcal'},'amount':302},
            {'nutrient':{'id':2048,'unitName':'kJ'},'amount':'1267.752'},
            {'nutrient':{'id':1005,'unitName':'mg'},'amount':'70000.12345'},
            {'nutrient':{'id':1079,'unitName':'g'},'amount':10},
            {'nutrient':{'id':9999,'unitName':'unsupported'},'amount':2},
        ]
        food = self.import_usda(list(reversed(observations)))
        self.assertEqual(food['nutrients']['kcal'], '303')
        self.assertEqual(food['nutritionData']['energyMethod'], 'atwater_specific')
        self.assertEqual(food['nutrients']['carbs'], '70')
        original = {v['nutrientId']:v for v in food['nutritionData']['originalValues']}
        self.assertEqual(original['1005']['value'], '70000.12345')
        self.assertEqual(original['1005']['unit'], 'mg')
        self.assertEqual(original['9999']['unit'], 'unsupported')
        branded = self.import_usda(observations, 'Branded')
        self.assertEqual(branded['nutrients']['kcal'], '301')
        self.assertEqual(branded['nutritionData']['energyMethod'], 'usda_1008')

    def test_conflicting_duplicate_usda_values_remain_unknown(self):
        food = self.import_usda([
            {'nutrient':{'id':1005,'unitName':'g'},'amount':70},
            {'nutrient':{'id':1005,'unitName':'g'},'amount':71},
            {'nutrient':{'id':1079,'unitName':'g'},'amount':10},
        ])
        self.assertIsNone(food['nutrients']['carbs'])
        self.assertIsNone(food['comparableNutrients']['carbs'])
        self.assertEqual(len(food['nutritionData']['originalValues']), 3)

    def test_comparable_daily_targets_and_frozen_normalization(self):
        imported = self.import_usda([
            {'nutrient':{'id':2048,'unitName':'kcal'},'amount':350},
            {'nutrient':{'id':1005,'unitName':'g'},'amount':70},
            {'nutrient':{'id':1079,'unitName':'g'},'amount':10},
        ])
        recipe = self.service.save_recipe(Recipe(name='Normalized', portions=2, minutes=5,
            ingredients=[{'foodId':imported['id'],'quantity':100}], steps=['Mix.']).model_dump())
        self.assertEqual(recipe['perPortionComparable']['carbs'], '30')
        self.service.save_profile(Profile(effectiveDate='2026-11-14', carbs=200).model_dump())
        self.service.log('normalized-log', Log(date='2026-11-14', meal='lunch', kind='recipe',
            sourceId=recipe['versionId'], quantity=1).model_dump())
        with self.connection() as db:
            frozen = db.execute('SELECT snapshot_json FROM nutrition_food_log_entries').fetchone()[0]
            diary = self.service.diary(db, date(2026,11,14))
        self.assertEqual(diary['targets']['carbs'], '200')
        self.assertEqual(diary['comparableNutrients']['carbs'], '30')
        self.assertEqual(diary['nutrients']['carbs'], '35')
        self.assertEqual(diary['carbComparison'], 'estimated')
        self.service.save_food(Food(name='Changed', source='New EU label',
            nutrients={'kcal':800,'carbs':20}, nutritionData={'carbDefinition':'eu_available'}).model_dump(), imported['id'])
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT snapshot_json FROM nutrition_food_log_entries').fetchone()[0], frozen)
            same = self.service.recipe(db, recipe['id'])
        self.assertEqual(same['perPortionComparable']['carbs'], '30')
        self.assertEqual(same['perPortion']['kcal'], '175')
        self.assertEqual(same['ingredientSources'][0]['nutritionData']['energyMethod'], 'atwater_specific')

    def test_legacy_recipe_batch_and_diary_preserve_values_without_semantic_guess(self):
        self.receipt('stock', '100', '2026-12-01')
        # Simulate food snapshots made before metadata existed.
        with self.connection() as db:
            raw = json.loads(db.execute('SELECT food_snapshot_json FROM nutrition_recipe_ingredients').fetchone()[0])
            for key in ('nutritionData', 'comparableNutrients', 'carbComparison'):
                raw.pop(key, None)
            db.execute('UPDATE nutrition_recipe_ingredients SET food_snapshot_json=?', (json.dumps(raw),))
        body = Cook(recipeVersionId=self.recipe['versionId'], portions=2, location='fridge',
                    expiresOn='2026-11-16', asOf='2026-11-14').model_dump()
        cooked = self.service.cook('cook', body)
        self.service.log('eat', Log(date='2026-11-14', meal='lunch', kind='portion',
            sourceId=cooked['lotId'], quantity='0.5').model_dump())
        with self.connection() as db:
            diary = self.service.diary(db, date(2026,11,14))
        self.assertEqual(diary['nutrients']['kcal'], '100')
        self.assertEqual(diary['nutrients']['carbs'], '15')
        self.assertIsNone(diary['comparableNutrients']['carbs'])
        self.assertEqual(diary['carbComparison'], 'unavailable')

    def test_batch_and_partial_diary_keep_recipe_declaration(self):
        original = self.food
        replacement = Food(name='Revised oats', source='Replacement label', sourceId='label-B',
                           nutrients={'kcal':800, 'protein':20, 'carbs':30, 'fat':40, 'fiber':2})
        self.service.save_food(replacement.model_dump(), original['id'])
        self.receipt('stock', '100', '2026-12-01')
        body = Cook(recipeVersionId=self.recipe['versionId'], portions=2, location='fridge',
                    expiresOn='2026-11-16', asOf='2026-11-14').model_dump()
        batch = self.service.cook('cook', body)
        self.assertEqual(batch, self.service.cook('cook', body))
        with self.connection() as db:
            snapshot = json.loads(db.execute('SELECT snapshot_json FROM nutrition_prep_batches').fetchone()[0])
        self.assertEqual(snapshot['nutrients'], original['nutrients'])
        self.assertEqual(snapshot['nutritionVersionIds'], [original['nutritionVersionId']])
        source = snapshot['ingredientSources'][0]
        self.assertEqual(source['foodVersion'], original['version'])
        self.assertEqual(source['nutritionVersionId'], original['nutritionVersionId'])
        self.assertEqual(source['sourceId'], original['sourceId'])
        self.assertEqual(source['source'], original['source'])
        entry = Log(date='2026-11-14', meal='lunch', kind='portion',
                    sourceId=batch['lotId'], quantity='0.5').model_dump()
        logged = self.service.log('eat', entry)
        self.assertEqual(logged, self.service.log('eat', entry))
        self.service.save_food(replacement.model_dump() | {'expectedVersion':2}, original['id'])
        with self.connection() as db:
            diary = self.service.diary(db, date(2026,11,14))
            self.assertEqual(diary['nutrients'], {'kcal':'100','protein':'2.5','carbs':'15','fat':'2','fiber':'1.25'})
            self.assertEqual(diary['entries'][0]['nutrients']['provenance']['ingredientSources'], [source])
        undo = self.service.reverse('undo', logged['operationId'])
        self.assertEqual(undo, self.service.reverse('undo', logged['operationId']))
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT quantity FROM nutrition_inventory_lots WHERE id=?', (batch['lotId'],)).fetchone()[0], 2000)
            archived = json.loads(db.execute('SELECT snapshot_json FROM nutrition_food_log_entries WHERE voided=1').fetchone()[0])
            self.assertEqual(archived['provenance']['ingredientSources'], [source])

    def test_legacy_batch_and_diary_resolve_sources_without_rewriting_rows(self):
        self.receipt('stock', '100', '2026-12-01')
        changed = self.service.save_food(Food(name='Updated oats', source='Replacement',
                                              sourceId='label-B').model_dump(), self.food['id'])
        batch = self.service.cook('cook', Cook(recipeVersionId=self.recipe['versionId'], portions=2,
                                  asOf='2026-11-14', expiresOn='2026-11-16', location='fridge').model_dump())
        portion = Log(date='2026-11-14', meal='lunch', kind='portion',
                      sourceId=batch['lotId'], quantity='0.5').model_dump()
        self.service.log('old-entry', portion)
        with self.connection() as db:
            batch_json = json.loads(db.execute('SELECT snapshot_json FROM nutrition_prep_batches').fetchone()[0])
            del batch_json['ingredientSources']
            batch_json['nutritionVersionIds'] = [changed['nutritionVersionId']]
            old_batch = json.dumps(batch_json)
            db.execute('UPDATE nutrition_prep_batches SET snapshot_json=?', (old_batch,))
            entry_json = json.loads(db.execute('SELECT snapshot_json FROM nutrition_food_log_entries').fetchone()[0])
            del entry_json['provenance']['ingredientSources']
            old_entry = json.dumps(entry_json)
            db.execute('UPDATE nutrition_food_log_entries SET snapshot_json=?', (old_entry,))

        self.service.log('new-entry', portion)
        with self.connection() as db:
            projected = json.loads(self.service.batches(db)[0]['snapshot_json'])
            self.assertEqual(projected['nutritionVersionIds'], [self.food['nutritionVersionId']])
            entries = self.service.diary(db, date(2026,11,14))['entries']
            self.assertEqual(len(entries), 2)
            for entry in entries:
                snap = entry['nutrients']
                self.assertEqual(snap['kcal'], '100')
                self.assertEqual(snap['provenance']['ingredientSources'], projected['ingredientSources'])
                self.assertEqual(snap['provenance']['ingredientSources'][0]['sourceId'], 'label-A')
            self.assertEqual(db.execute('SELECT snapshot_json FROM nutrition_prep_batches').fetchone()[0], old_batch)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_food_log_entries WHERE snapshot_json=?',
                                        (old_entry,)).fetchone()[0], 1)

    def test_ingredient_sources_follow_positions_and_recipe_versions(self):
        other = self.service.save_food(Food(name='Other', source='Manual').model_dump())
        ingredients = [{'foodId':item['id'], 'quantity':10} for item in (other, self.food, other)]
        body = Recipe(name='Two foods', portions=1, minutes=2, steps=['Mix'], ingredients=ingredients)
        old = self.service.save_recipe(body.model_dump())
        body.ingredients = list(reversed(body.ingredients[:2]))
        revised = self.service.save_recipe(body.model_dump(), old['id'])
        self.service.log('recipe-entry', Log(date='2026-11-14', meal='lunch', kind='recipe',
                         sourceId=old['versionId'], quantity=1).model_dump())
        with self.connection() as db:
            snapshot = self.service.diary(db, date(2026,11,14))['entries'][0]['nutrients']
        self.assertIsNone(snapshot['kcal'])
        sources = snapshot['provenance']['ingredientSources']
        self.assertEqual([s['foodId'] for s in sources], [other['id'], self.food['id'], other['id']])
        self.assertEqual([s['sourceId'] for s in sources], [None, 'label-A', None])
        self.assertEqual(snapshot['provenance']['recipeVersionId'], old['versionId'])
        self.assertNotEqual(old['versionId'], revised['versionId'])

    def test_parallel_consumption_never_goes_negative(self):
        self.receipt('stock','100','2026-12-01')
        body=Log(date='2026-11-14',meal='lunch',kind='food',sourceId=self.food['id'],quantity='100',consumeInventory=True).model_dump()
        def consume(key):
            try:self.service.log(key,body);return True
            except DomainError:return False
        with ThreadPoolExecutor(2) as pool:result=list(pool.map(consume,['a','b']))
        self.assertEqual(sum(result),1)
        with self.connection() as db:self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],0)

    def test_expired_lots_and_unknown_units_do_not_invent_nutrition(self):
        self.receipt('expired','100','2026-11-01')
        with self.connection() as db:self.assertEqual(self.service.allocate(db,self.food['id'],1000,date(2026,11,14))[1],1000)
        food=self.service.save_food(Food(name='Liquid',unit='ml',source='Synthetic',nutrients={'kcal':'100'}).model_dump())
        self.service.log('unknown-density',Log(date='2026-11-14',meal='snack',kind='food',sourceId=food['id'],quantity='100').model_dump())
        with self.connection() as db:self.assertIsNone(self.service.diary(db,date(2026,11,14))['nutrients']['kcal'])

    def test_profile_effective_dates_and_conflicts(self):
        body=Profile(effectiveDate='2026-11-14',calories='2200',carbs='200').model_dump()
        self.service.save_profile(body)
        with self.assertRaises(DomainError):self.service.save_profile(body)
        with self.connection() as db:
            self.assertEqual(self.service.diary(db,date(2026,11,13))['targets'],{})
            self.assertEqual(self.service.diary(db,date(2026,11,14))['targets']['calories'],'2200')

    def test_cook_reversal_after_reversed_consumption(self):
        self.receipt('stock','100','2026-12-01')
        cooked=self.service.cook('cook',Cook(recipeVersionId=self.recipe['versionId'],portions='2',location='fridge',expiresOn='2026-11-16',asOf='2026-11-14').model_dump())
        eaten=self.service.log('eat',Log(date='2026-11-14',meal='lunch',kind='portion',sourceId=cooked['lotId'],quantity='0.5').model_dump())
        self.service.reverse('undo-eat',eaten['operationId']);self.service.reverse('undo-cook',cooked['operationId'])
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots WHERE food_id IS NOT NULL').fetchone()[0],100000)
            self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots WHERE batch_id IS NOT NULL').fetchone()[0],0)

    def ai_preview_for_oats(self):
        from nutrition.models import AIPreview
        from nutrition.routes import create_router

        self.food = self.service.save_food(Food(
            name=self.food['name'], source='Synthetic label', allergensKnown=True
        ).model_dump(), self.food['id'])
        lot = self.receipt('ai-stock', '100', '2026-12-01')
        self.service.save_profile(Profile(
            effectiveDate='2026-11-14', allergens=['peanut'],
            aiDailyRequests=3, aiDailyTokens=24000
        ).model_dump())
        core = SimpleNamespace(archive_connection=self.connection, iso_today=self.service.today,
                               initialize_archive=lambda: None, ENV={},
                               OPENAI_API_KEY='synthetic', OPENAI_LAB_MODEL='synthetic')
        endpoints = {r.path.removeprefix('/api/nutrition'): r.endpoint for r in create_router(core).routes}
        preview = endpoints['/ai/preview'](AIPreview(lotIds=[lot['lotId']]))['data']
        return endpoints, preview

    def ai_proposal(self):
        return {'portions':1, 'minutes':5,
                'ingredients':[{'name':self.food['name'], 'quantity':50}],
                'steps':[{'action':'cook', 'ingredientRefs':[1]}]}

    def generate_mock_recipes(self, endpoints, preview, recipes, key='try'):
        response = {'output':[{'type':'message', 'content':[
            {'type':'output_text', 'text':json.dumps({'recipes':recipes})}]}]}
        with patch('nutrition.ai.urlopen', return_value=BytesIO(json.dumps(response).encode())):
            return endpoints['/ai/generate'](AIGenerate(previewId=preview['previewId'], confirmation=True), key)['data']

    def test_ai_rejects_allergen_only_in_instructions(self):
        endpoints, preview = self.ai_preview_for_oats()
        recipe = {'name':'Synthetic dish', 'portions':1, 'minutes':5,
                  'ingredients':[{'name':self.food['name'], 'quantity':50}],
                  'steps':['Stir in peanut butter.']}
        with self.assertRaises(HTTPException) as error:
            self.generate_mock_recipes(endpoints, preview, [recipe, recipe])
        self.assertEqual(error.exception.status_code, 422)
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_ai_drafts').fetchone()[0], 0)

    def test_ai_steps_reject_undeclared_refs_aliases_and_incomplete_steps(self):
        from pydantic import ValidationError
        from nutrition.models import AIProposal

        for step in ('Dodaj kikiriki.', 'Stir in groundnuts.', 'Dodaj sol.',
                     {'action':'mix', 'ingredientRefs':[1, 2]},
                     {'action':'groundnuts', 'ingredientRefs':[1]},
                     {'action':'mix', 'ingredientRefs':[1], 'note':'Dodaj arašide.'},
                     {'action':'mix', 'ingredientRefs':['zob']},
                     {'action':'mix'}, {'action':'mix', 'ingredientRefs':[]}):
            with self.subTest(step=step), self.assertRaises(ValidationError):
                AIProposal.model_validate({**self.ai_proposal(), 'steps':[step]})

    def test_ai_rejects_unconfirmed_ingredient_alias_atomically(self):
        endpoints, preview = self.ai_preview_for_oats()
        valid = self.ai_proposal()
        alias = {**valid, 'ingredients':[{'name':'Avena sativa', 'quantity':50}]}
        with self.assertRaises(HTTPException) as error:
            self.generate_mock_recipes(endpoints, preview, [valid, alias])
        self.assertEqual(error.exception.status_code, 422)
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_ai_drafts').fetchone()[0], 0)

    def test_ai_structured_recipe_saves_local_steps_without_inventory_changes(self):
        endpoints, preview = self.ai_preview_for_oats()
        valid = self.ai_proposal()
        result = self.generate_mock_recipes(endpoints, preview, [valid, valid])
        draft = result['drafts'][0]
        expected = ['Skuhaj: Test oats.']
        self.assertEqual(draft['recipe']['steps'], expected)
        self.assertEqual(endpoints['/ai/requests/{request_id}'](result['requestId'])['data']['result'], result)
        save = endpoints['/ai/drafts/{draft_id}/save']
        saved = save(draft['id'])['data']
        self.assertEqual(saved['steps'], expected)
        self.assertEqual(saved['ingredients'][0]['foodId'], self.food['id'])
        self.assertEqual(save(draft['id'])['data']['id'], saved['id'])
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_inventory_transactions').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT quantity FROM nutrition_inventory_lots').fetchone()[0], 100000)

    def test_ai_rechecks_changed_allergens_on_save(self):
        endpoints, preview = self.ai_preview_for_oats()
        self.service.save_food(Food(name=self.food['name'], source='Synthetic label',
                                    allergensKnown=True, allergens=['oats'],
                                    expectedVersion=self.food['version']).model_dump(), self.food['id'])
        result = self.generate_mock_recipes(endpoints, preview, [self.ai_proposal()]*2)
        self.service.save_profile(Profile(effectiveDate='2026-11-14', expectedVersion=1,
                                          allergens=['OATS']).model_dump())
        with self.assertRaises(HTTPException) as error:
            endpoints['/ai/drafts/{draft_id}/save'](result['drafts'][0]['id'])
        self.assertEqual(error.exception.status_code, 422)
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_recipes').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(saved_recipe_id) FROM nutrition_ai_drafts').fetchone()[0], 0)

    def test_ai_old_unverified_draft_is_blocked_on_save_status_and_replay(self):
        endpoints, preview = self.ai_preview_for_oats()
        result = self.generate_mock_recipes(endpoints, preview, [self.ai_proposal()]*2)
        draft = result['drafts'][0]
        draft['recipe']['steps'] = ['Add peanut butter.']
        with self.connection() as db:
            db.execute('UPDATE nutrition_ai_drafts SET proposal_json=? WHERE id=?', (json.dumps(draft['recipe']), draft['id']))
            db.execute('UPDATE nutrition_ai_requests SET result_json=? WHERE id=?', (json.dumps(result), result['requestId']))
        with self.assertRaises(HTTPException):
            endpoints['/ai/drafts/{draft_id}/save'](draft['id'])
        with self.assertRaises(HTTPException):
            endpoints['/ai/requests/{request_id}'](result['requestId'])
        with patch('nutrition.ai.urlopen') as provider, self.assertRaises(HTTPException):
            endpoints['/ai/generate'](AIGenerate(previewId=preview['previewId'], confirmation=True), 'try')
        provider.assert_not_called()

    def test_ai_large_selected_lots_and_fresh_availability(self):
        from nutrition.models import AIPreview
        endpoints,_=self.ai_preview_for_oats()
        lot_ids=[]
        ingredients=[]
        for name,stock,serving in [('Milk',12000,200),('Rolled oats',1500,50),('Strawberry',2500,80)]:
            food=self.service.save_food(Food(name=name,source='Test',allergensKnown=True).model_dump())
            receipt={'foodId':food['id'],'quantity':stock,'location':'pantry','expiresOn':None,
                     'cost':None,'receivedOn':self.service.today()}
            lot=self.service.repo.operation('receipt',name,receipt,lambda db,op:self.service.receive(db,op,receipt))
            lot_ids.append(lot['lotId'])
            ingredients.append({'name':name,'quantity':serving})
        def preview():
            return endpoints['/ai/preview'](AIPreview(lotIds=lot_ids))['data']
        recipe={**self.ai_proposal(),'ingredients':ingredients,'steps':[{'action':'mix','ingredientRefs':[1,2,3]}]}
        result=self.generate_mock_recipes(endpoints,preview(),[recipe,recipe])
        self.assertEqual(len(result['drafts']),2)
        pending=preview()
        with self.connection() as db:
            db.execute('UPDATE nutrition_inventory_lots SET quantity=0 WHERE id=?',(lot_ids[1],))
        with self.assertRaises(HTTPException) as error:
            self.generate_mock_recipes(endpoints,pending,[recipe,recipe],'changed')
        self.assertIn('više nije dovoljna',error.exception.detail)
        with self.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_ai_drafts').fetchone()[0],2)

    def test_ai_response_diagnostics_and_preview_quantity(self):
        from nutrition.ai import parse_response
        base=self.ai_proposal()
        ingredients=[{'name':name,'quantity':q} for name,q in [('Milk',200),('Oats',50),('Berries',80)]]
        recipe={**base,'ingredients':ingredients,'steps':[{'action':'mix','ingredientRefs':[1,2,3]}]}
        def response(second):
            return {'output_text':json.dumps({'recipes':[recipe,second]})}
        self.assertEqual(len(parse_response(response(recipe)).recipes),2)
        for refs,reason in [([1,2],'sastojak broj 3'),([1,4],'nepostojeći sastojak broj 4')]:
            with self.assertRaisesRegex(DomainError,reason):
                parse_response(response({**recipe,'steps':[{'action':'mix','ingredientRefs':refs}]}))
        with self.assertRaisesRegex(DomainError,'količina'):
            parse_response(response({**recipe,'ingredients':[{'name':'Milk','quantity':-1}]}))
        with self.assertRaisesRegex(DomainError,'ne sadrži tekst'):
            parse_response({})
        endpoints,preview=self.ai_preview_for_oats()
        self.receipt('extra','200','2026-12-01')
        oversize={**base,'ingredients':[{'name':self.food['name'],'quantity':110}]}
        with self.assertRaises(HTTPException) as error:
            self.generate_mock_recipes(endpoints,preview,[base,oversize])
        with self.connection() as db:
            self.assertEqual(db.execute("SELECT error FROM nutrition_ai_requests WHERE state='failed'").fetchone()[0],error.exception.detail)
            self.assertIn('premašuje potvrđenu količinu',error.exception.detail)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_ai_drafts').fetchone()[0],0)

    def test_ai_wire_quantity_has_same_limits_as_local_decimal(self):
        from nutrition.ai import request_recipes, parse_response
        proposal=self.ai_proposal()
        with patch('nutrition.ai.urlopen',return_value=BytesIO(json.dumps(
                {'output_text':json.dumps({'recipes':[proposal,proposal]})}).encode())) as network:
            request_recipes('synthetic','synthetic',[])
        schema=json.loads(network.call_args.args[0].data)['text']['format']['schema']
        for definition,field in [('AIIngredient','quantity'),('AIProposal','portions')]:
            shape=schema['$defs'][definition]['properties'][field]
            self.assertEqual(shape['type'],'number')
            self.assertEqual(shape['multipleOf'],0.001)
            self.assertEqual(shape['minimum'],0.001)
            self.assertEqual(shape['maximum'],999999999.999)
        for value,reason in [('200 g','decimalni broj'),(0,'veća od nule'),
                             ('0.0001','tri decimale'),('1000000000','prevelika')]:
            with self.subTest(value=value):
                bad={**proposal,'ingredients':[{'name':'Test oats','quantity':value}]}
                with self.assertRaisesRegex(DomainError,reason):
                    parse_response({'output_text':json.dumps({'recipes':[bad,proposal]})})
        valid={**proposal,'portions':'1.5','ingredients':[{'name':'Test oats','quantity':'0.001'}]}
        result=parse_response({'output_text':json.dumps({'recipes':[valid,valid]})})
        self.assertEqual(result.recipes[0].ingredients[0].quantity,Decimal('0.001'))

    def test_ai_payload_contains_only_names_amounts_and_static_instructions(self):
        from nutrition.ai import request_recipes
        from io import BytesIO
        proposals={'recipes':[self.ai_proposal()]*2}
        response=BytesIO(json.dumps({'output_text':json.dumps(proposals)}).encode())
        with patch('nutrition.ai.urlopen',return_value=response) as network:
            result=request_recipes('synthetic-key','synthetic-model',[{'name':'Test oats','quantity':'100','unit':'g'}])
        payload=json.loads(network.call_args.args[0].data)
        self.assertEqual(json.loads(payload['input']),[{'name':'Test oats','quantity':'100','unit':'g'}])
        self.assertFalse(payload['store']);self.assertNotIn('Garmin',payload['input']);self.assertEqual(len(result.recipes),2)

    def test_ai_is_opt_in_budgeted_and_never_consumes_inventory(self):
        from nutrition.routes import create_router
        from nutrition.models import AIPreview,AIGenerate,AIOutput
        from fastapi import HTTPException
        self.receipt('stock','100','2026-12-01')
        core=SimpleNamespace(archive_connection=self.connection,iso_today=lambda:date(2026,11,14),initialize_archive=lambda:None,ENV={},OPENAI_API_KEY='synthetic',OPENAI_LAB_MODEL='synthetic')
        router=create_router(core);endpoint=lambda path:next(r.endpoint for r in router.routes if r.path=='/api/nutrition'+path)
        with self.connection() as db:lot=self.service.inventory(db)[0]
        p=endpoint('/ai/preview')(AIPreview(lotIds=[lot['id']]))['data']
        with self.assertRaises(HTTPException):endpoint('/ai/generate')(AIGenerate(previewId=p['previewId'],confirmation=True),'budget-off')
        self.service.save_profile(Profile(effectiveDate='2026-11-14',aiDailyRequests=2,aiDailyTokens=16000).model_dump())
        output=AIOutput(recipes=[self.ai_proposal()]*2)
        with patch('nutrition.ai.request_recipes',return_value=output) as network:
            result=endpoint('/ai/generate')(AIGenerate(previewId=p['previewId'],confirmation=True),'valid')
            repeated=endpoint('/ai/generate')(AIGenerate(previewId=p['previewId'],confirmation=True),'valid')
        self.assertEqual(result,repeated);self.assertEqual(network.call_count,1)
        with self.connection() as db:self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],100000)

    def test_scheduled_prep_is_separate_from_cooking_and_reversible(self):
        from nutrition.repository import uid
        self.receipt('stock','100','2026-12-01')
        schedule_id=uid()
        with self.connection() as db:db.execute('INSERT INTO nutrition_prep_schedule(id,planned_date,recipe_version_id,portions) VALUES (?,?,?,?)',(schedule_id,'2026-11-14',self.recipe['versionId'],2000))
        with self.connection() as db:self.assertEqual(db.execute('SELECT SUM(quantity) FROM nutrition_inventory_lots').fetchone()[0],100000)
        cooked=self.service.cook('scheduled',Cook(recipeVersionId=self.recipe['versionId'],portions='2',location='fridge',expiresOn='2026-11-16',asOf='2026-11-14',scheduleId=schedule_id).model_dump())
        with self.connection() as db:self.assertEqual(db.execute('SELECT status FROM nutrition_prep_schedule').fetchone()[0],'prepared')
        self.service.reverse('undo',cooked['operationId'])
        with self.connection() as db:self.assertEqual(db.execute('SELECT status FROM nutrition_prep_schedule').fetchone()[0],'planned')

    def test_adaptive_is_user_authored_and_requires_known_base_targets(self):
        from nutrition.adaptive import SportsAdjustment,preview
        adjustment=SportsAdjustment(trainingLabel='Synthetic training',durationMinutes=60,extraCalories='100',extraCarbs='25',expectedVersion=0)
        with self.assertRaises(DomainError):preview({},adjustment)
        result=preview({'calories':'2200','carbs':'200'},adjustment)
        self.assertEqual(result['calories'],'2300');self.assertEqual(result['carbs'],'225')

    def test_ai_retries_only_explicit_rate_limit_and_rejects_invalid_output(self):
        from nutrition.ai import request_recipes
        from io import BytesIO
        from urllib.error import HTTPError
        from pydantic import ValidationError
        response=BytesIO(json.dumps({'output_text':'{}'}).encode())
        rejected=HTTPError('https://example.invalid',429,'Rate limited',{},BytesIO(b'{"error":{"code":"rate_limit_exceeded"}}'))
        with patch('nutrition.ai.urlopen',side_effect=[rejected,response]) as network,patch('nutrition.ai.time.sleep'):
            with self.assertRaises(DomainError):request_recipes('synthetic','synthetic',[])
        self.assertEqual(network.call_count,2)


if __name__=='__main__':unittest.main()
