import json
from contextlib import nullcontext
from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN
from .engine import KEYS, decimal, fixed, grams, quantity_units, scaled, text, total
from .cooking import cooking_plan
from .repository import DomainError, Repository, dumps, now, one, rows, uid
from .normalization import nutrition_metadata, comparison, comparable_snapshot, combined_status
from .availability import lot_availability, available_lots


def frozen_foods(db, recipe_version_id):
    records = rows(db, 'SELECT food_snapshot_json FROM nutrition_recipe_ingredients '
                       'WHERE version_id=? ORDER BY position', (recipe_version_id,))
    return [json.loads(record['food_snapshot_json']) for record in records]


def ingredient_source(food):
    return {'foodId': food['id'], 'foodVersion': food['version'],
            'nutritionVersionId': food['nutritionVersionId'], 'source': food['source'],
            'sourceId': food.get('sourceId'), 'state': food['state'],
            'nutritionData': food.get('nutritionData', {})}


class NutritionService:
    def __init__(self, connection, today):
        self.repo = Repository(connection)
        self.connection = connection
        self.today = today

    def profile(self, db):
        found = rows(db, 'SELECT * FROM nutrition_profiles WHERE id=1')
        return {**json.loads(found[0]['data_json']), 'version': found[0]['version']} if found else {'version': 0}

    def save_profile(self, data):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            profile = self.profile(db)
            if profile['version'] != data['expectedVersion']:
                raise DomainError('Profil je u međuvremenu izmijenjen.')
            version = profile['version'] + 1
            db.execute('INSERT INTO nutrition_profiles VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,version=excluded.version', (dumps(data), version))
            db.execute('INSERT INTO nutrition_target_periods VALUES (?,?) ON CONFLICT(effective_date) DO UPDATE SET data_json=excluded.data_json', (str(data['effectiveDate']), dumps({k: data.get(k) for k in ('calories', 'protein', 'carbs', 'fat', 'fiber')})))
            return {**data, 'version': version}

    def food(self, db, food_id):
        f = one(db, 'SELECT * FROM nutrition_foods WHERE id=?', (food_id,))
        v = rows(db, 'SELECT * FROM nutrition_nutrition_versions WHERE food_id=? ORDER BY rowid DESC LIMIT 1', (food_id,))
        nutrients = {k: None for k in KEYS}
        micros = {}
        if v:
            for n in rows(db, 'SELECT * FROM nutrition_nutrient_values WHERE version_id=?', (v[0]['id'],)):
                if n['nutrient'].startswith('micro:'):micros[n['nutrient'][6:]]={'value':text(decimal(n['value'])),'unit':n['unit']}
                else:nutrients[n['nutrient']] = text(decimal(n['value']))
        metadata = json.loads(v[0]['metadata_json']) if v and v[0]['metadata_json'] else {}
        comparable, status = comparison(nutrients, metadata)
        return {'id': f['id'], 'name': f['name'], 'state': f['state'], 'unit': f['unit'], 'version': f['version'], 'gramsPerUnit': text(decimal(f['grams_per_unit'])) if f['grams_per_unit'] else None, 'minimumQuantity': text(decimal(f['minimum_quantity'])), 'allergens': json.loads(f['allergens_json']), 'allergensKnown':bool(f['allergens_known']),'dietaryTags':json.loads(f['dietary_tags_json']), 'micronutrients':micros, 'nutrients': nutrients, 'source': v[0]['source'] if v else None, 'sourceId': v[0]['source_id'] if v else None, 'nutritionVersionId': v[0]['id'] if v else None,'retrievedAt':v[0]['retrieved_at'] if v else None,
                'nutritionData':metadata, 'comparableNutrients':comparable, 'carbComparison':status}

    def foods(self, db):
        return [self.food(db, f['id']) for f in rows(db, 'SELECT id FROM nutrition_foods WHERE archived=0 ORDER BY name')]

    def save_food(self, data, food_id=None):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            return self.write_food(db, data, food_id)

    def create_reviewed_food(self, data, key, allow_duplicate):
        def write(db, _operation):
            if not allow_duplicate and db.execute(
                "SELECT 1 FROM nutrition_nutrition_versions v JOIN nutrition_foods f ON f.id=v.food_id "
                "WHERE f.archived=0 AND v.source_id=? AND v.source LIKE 'USDA FoodData Central%' "
                "AND v.rowid=(SELECT MAX(rowid) FROM nutrition_nutrition_versions WHERE food_id=f.id)",
                (data['sourceId'],)).fetchone():
                raise DomainError('Ovaj FDC zapis već postoji. Odaberi postojeći ili potvrdi novi unos.')
            return self.write_food(db, data)
        return self.repo.operation('usda_food_create', key, {**data, 'allowDuplicate':allow_duplicate}, write)

    def write_food(self, db, data, food_id=None):
        if food_id:
            old = self.food(db, food_id)
            if old['version'] != data['expectedVersion']:
                raise DomainError('Namirnica je u međuvremenu izmijenjena.')
            if old['unit'] != data['unit']:
                raise DomainError('Za drugu inventarnu jedinicu kreiraj novu namirnicu.')
            db.execute('UPDATE nutrition_foods SET name=?,state=?,grams_per_unit=?,minimum_quantity=?,allergens_json=?,version=version+1 WHERE id=?', (data['name'].strip(), data['state'], fixed(data['gramsPerUnit']) if data['gramsPerUnit'] else None, fixed(data['minimumQuantity']), dumps(data['allergens']), food_id))
        else:
            food_id = uid()
            db.execute('INSERT INTO nutrition_foods (id,name,state,unit,grams_per_unit,minimum_quantity,allergens_json) VALUES (?,?,?,?,?,?,?)', (food_id, data['name'].strip(), data['state'], data['unit'], fixed(data['gramsPerUnit']) if data['gramsPerUnit'] else None, fixed(data['minimumQuantity']), dumps(data['allergens'])))
        version_id = uid()
        db.execute('UPDATE nutrition_foods SET allergens_known=?,dietary_tags_json=? WHERE id=?',(int(data.get('allergensKnown',False)),dumps(data.get('dietaryTags',[])),food_id))
        db.execute('INSERT INTO nutrition_nutrition_versions (id,food_id,source,source_id,retrieved_at,metadata_json) VALUES (?,?,?,?,?,?)', (version_id, food_id, data['source'], data.get('sourceId'), now(), dumps(nutrition_metadata(data))))
        for key, value in data['nutrients'].items():
            if value is not None:
                db.execute('INSERT INTO nutrition_nutrient_values VALUES (?,?,?,?)', (version_id, key, fixed(value), 'kcal' if key == 'kcal' else 'g'))
        for key,value in data.get('micronutrients',{}).items():
            db.execute('INSERT INTO nutrition_nutrient_values VALUES (?,?,?,?)',(version_id,'micro:'+key,fixed(value['value']),value['unit']))
        return self.food(db, food_id)

    def change(self, db, operation, lot_id, delta, reason, event_date=None):
        lot = one(db, 'SELECT * FROM nutrition_inventory_lots WHERE id=?', (lot_id,))
        if lot['quantity'] + delta < 0:
            raise DomainError('Nedostatne zalihe. Osvježi pregled.')
        db.execute('UPDATE nutrition_inventory_lots SET quantity=quantity+?,version=version+1 WHERE id=?', (delta, lot_id))
        day = str(event_date or self.today())
        db.execute('INSERT INTO nutrition_inventory_transactions(id,operation_id,lot_id,delta,reason,event_date) VALUES (?,?,?,?,?,?)', (uid(), operation, lot_id, delta, reason, day))

    def receive(self, db, op, data):
        food = self.food(db, data['foodId'])
        lot_id = uid()
        quantity = fixed(data['quantity'])
        received_on = data.get('receivedOn') or self.today()
        if str(received_on) > str(self.today()):
            raise DomainError('Primitak ne može biti u budućnosti.', 422)
        if quantity <= 0:
            raise DomainError('Količina je premala.', 422)
        db.execute('INSERT INTO nutrition_inventory_lots (id,food_id,quantity,initial_quantity,unit,location,expires_on,received_at,cost) VALUES (?,?,?,?,?,?,?,?,?)', (lot_id, food['id'], 0, quantity, food['unit'], data['location'], str(data['expiresOn']) if data.get('expiresOn') else None, now(), fixed(data['cost'],10000) if data.get('cost') is not None else None))
        db.execute('UPDATE nutrition_inventory_lots SET available_on=? WHERE id=?', (str(received_on), lot_id))
        self.change(db, op, lot_id, quantity, 'receipt', received_on)
        if data.get('cost') is not None:
            db.execute('INSERT INTO nutrition_price_history VALUES (?,?,?,?,?,?,?,?)', (uid(), food['id'], quantity, food['unit'], fixed(data['cost'],10000), 'EUR', str(self.today()), op))
        return {'lotId': lot_id}

    def inventory(self, db, as_of=None):
        result = []
        for lot in rows(db, 'SELECT l.*,f.name FROM nutrition_inventory_lots l LEFT JOIN nutrition_foods f ON f.id=l.food_id WHERE l.quantity>0 ORDER BY l.expires_on IS NULL,l.expires_on,l.received_at,l.id'):
            if lot['batch_id']:
                batch = one(db, 'SELECT snapshot_json FROM nutrition_prep_batches WHERE id=?', (lot['batch_id'],))
                lot['name'] = json.loads(batch['snapshot_json'])['name']
            availability = lot_availability(db, lot, as_of or self.today())
            result.append({**lot, 'quantity': text(decimal(lot['quantity'])), 'cost': text(decimal(lot['cost'],10000)) if lot['cost'] is not None else None,
                           'receivedOn':availability['receivedOn'], 'dateKnown':availability['dateKnown'],
                           'availableQuantity':text(decimal(availability['available'])),
                           'expiredQuantity':text(decimal(availability['expired']))})
        return result

    def allocate(self, db, food_id, quantity, as_of):
        lots = available_lots(db, as_of, food_id=food_id)
        remaining = quantity
        allocations = []
        for lot in lots:
            take = min(remaining, lot['quantity'])
            if take:
                allocations.append({'lotId': lot['id'], 'quantity': take})
                remaining -= take
        return allocations, remaining

    def lot_change(self, kind, key, data):
        def action(db, op):
            lot = one(db, 'SELECT * FROM nutrition_inventory_lots WHERE id=?', (data['lotId'],))
            if lot['version'] != data['expectedVersion']:
                raise DomainError('Stanje lota je izmijenjeno.')
            quantity = fixed(data['quantity'])
            if quantity<=0 and kind!='adjustment':raise DomainError('Za potrošnju ili premještanje unesi pozitivnu količinu.',422)
            if kind == 'transfer':
                if not data.get('location'):
                    raise DomainError('Odaberi lokaciju.',422)
                new_id = uid()
                db.execute('INSERT INTO nutrition_inventory_lots (id,food_id,batch_id,quantity,initial_quantity,unit,location,expires_on,received_at,cost) VALUES (?,?,?,?,?,?,?,?,?,?)', (new_id,lot['food_id'],lot['batch_id'],0,quantity,lot['unit'],data['location'],lot['expires_on'],now(),None))
                db.execute('UPDATE nutrition_inventory_lots SET available_on=? WHERE id=?', (str(self.today()), new_id))
                self.change(db,op,lot['id'],-quantity,'transfer')
                self.change(db,op,new_id,quantity,'transfer')
            elif kind == 'adjustment':
                self.change(db,op,lot['id'],quantity-lot['quantity'],data['reason'])
            else:
                self.change(db,op,lot['id'],-quantity,'waste: '+data['reason'])
            return {'ok':True}
        return self.repo.operation(kind,key,data,action)

    def recipe(self, db, recipe_id=None, version_id=None):
        v = one(db, 'SELECT v.*,r.name FROM nutrition_recipe_versions v JOIN nutrition_recipes r ON r.id=v.recipe_id WHERE '+('v.id=?' if version_id else 'r.id=?')+' ORDER BY v.version_number DESC LIMIT 1', (version_id or recipe_id,))
        data = json.loads(v['data_json'])
        parts = []
        comparable_parts = []
        statuses = []
        cost = Decimal(0)
        cost_complete = True
        price_sources=[]
        foods = frozen_foods(db, v['id'])
        for ingredient, food in zip(data['ingredients'], foods, strict=True):
            mass = grams(Decimal(ingredient['quantity']),food)
            parts.append(scaled(food['nutrients'],mass/100) if mass is not None else {k:None for k in KEYS})
            comparable_parts.append(scaled(comparable_snapshot(food), mass/100) if mass is not None else {k:None for k in KEYS})
            statuses.append(food.get('carbComparison', 'unavailable') if mass is not None else 'unavailable')
            prices = rows(db,'SELECT p.* FROM nutrition_price_history p LEFT JOIN nutrition_operations o ON o.id=p.operation_id WHERE p.food_id=? AND o.reversed_by IS NULL ORDER BY p.purchased_on DESC,p.rowid DESC LIMIT 1',(food['id'],))
            if prices:
                price_sources.append({'foodId':food['id'],'name':food['name'],'date':prices[0]['purchased_on']})
                cost += decimal(prices[0]['cost'],10000)*Decimal(ingredient['quantity'])/decimal(prices[0]['quantity'])
            else:
                cost_complete=False
        nutrients=total(parts)
        comparable = total(comparable_parts)
        return {**data,'id':v['recipe_id'],'versionId':v['id'],'version':v['version_number'],'nutrients':nutrients,'perPortion':scaled(nutrients,1/Decimal(data['portions'])),'cost':text(cost) if cost_complete else None,'costPerPortion':text(cost/Decimal(data['portions'])) if cost_complete else None,'nutritionComplete':all(nutrients[k] is not None for k in ('kcal','protein','carbs','fat')),'priceSources':price_sources,
                'ingredientSources': [ingredient_source(food) for food in foods],
                'comparableNutrients':comparable, 'perPortionComparable':scaled(comparable, 1/Decimal(data['portions'])),
                'carbComparison':combined_status(statuses)}

    def save_recipe(self,data,recipe_id=None,connection_db=None):
        with (nullcontext(connection_db) if connection_db is not None else self.connection()) as db:
            if not db.in_transaction:db.execute('BEGIN IMMEDIATE')
            version=1
            if recipe_id:
                r=one(db,'SELECT * FROM nutrition_recipes WHERE id=?',(recipe_id,))
                if r['version']!=data['expectedVersion']:
                    raise DomainError('Recept je u međuvremenu izmijenjen.')
                version=r['version']+1
                db.execute('UPDATE nutrition_recipes SET name=?,version=? WHERE id=?',(data['name'],version,recipe_id))
            else:
                recipe_id=uid()
                db.execute('INSERT INTO nutrition_recipes(id,name) VALUES (?,?)',(recipe_id,data['name']))
            v=uid()
            db.execute('INSERT INTO nutrition_recipe_versions VALUES (?,?,?,?,?)',(v,recipe_id,version,dumps(data),now()))
            for i,item in enumerate(data['ingredients']):
                db.execute('INSERT INTO nutrition_recipe_ingredients VALUES (?,?,?,?,?,?)',(v,i,item['foodId'],fixed(item['quantity']),int(item['optional']),dumps(self.food(db,item['foodId']))))
            for i,step in enumerate(data['steps']):
                db.execute('INSERT INTO nutrition_recipe_steps VALUES (?,?,?)',(v,i,step))
            return self.recipe(db,recipe_id)

    def requirements(self,recipe,portions):
        needs={}
        factor=Decimal(str(portions))/Decimal(recipe['portions'])
        for item in recipe['ingredients']:
            if item.get('optional'):
                continue
            requested = Decimal(item['quantity'])*factor
            needs[item['foodId']]=needs.get(item['foodId'],0)+(quantity_units(requested) if requested else 0)
        return needs

    def scale(self,db,recipe,data):
        needs=self.requirements(recipe,recipe['portions'])
        factors=[]
        missing=[]
        for food_id,quantity in needs.items():
            available=sum(a['quantity'] for a in self.allocate(db,food_id,10**18,data['asOf'])[0])
            factors.append((Decimal(available)/quantity,food_id))
        if data.get('byInventory'):
            factor,limiting=min(factors) if factors else (Decimal(0),None)
            portions=(Decimal(recipe['portions'])*factor).quantize(Decimal('.001'),rounding=ROUND_DOWN)
            factor=portions/Decimal(recipe['portions'])
        else:
            portions=Decimal(str(data.get('portions') or recipe['portions']))
            factor=portions/Decimal(recipe['portions'])
            limiting=None
        for food_id,quantity in self.requirements(recipe,portions).items():
            allocations,short=self.allocate(db,food_id,quantity,data['asOf'])
            if short:
                missing.append({'foodId':food_id,'name':self.food(db,food_id)['name'],'quantity':text(decimal(short))})
        return {'portions':text(portions),'factor':text(factor),'limitingFoodId':limiting,'missing':missing,'feasible':not missing and portions>0,'ingredients':[{**i,'quantity':text(Decimal(i['quantity'])*factor)} for i in recipe['ingredients']],'nutrients':scaled(recipe['nutrients'],factor),'warnings':['Opcionalne sastojke potvrdi zasebno prije kuhanja.'] if any(i.get('optional') for i in recipe['ingredients']) else []}

    def preview_cook(self, db, data):
        if not db.in_transaction:
            db.execute('BEGIN')
        return cooking_plan(self, db, data)

    def cook(self,key,data):
        def action(db,op):
            plan = cooking_plan(self, db, data)
            token = data.get('previewToken')
            if token and token != plan['previewToken']:
                raise DomainError('Uvjeti pripreme su promijenjeni. Osvježi pregled prije potvrde.', 409,
                                  {'code':'preview_changed', 'refreshPreview':True, 'currentPreview':plan})
            if not plan['feasible']:
                raise DomainError('Priprema nije izvediva. Provjeri objašnjenja u pregledu.', 422,
                                  {'code':'invalid_cooking_plan', 'refreshPreview':True, 'currentPreview':plan})
            if token and rows(db, "SELECT id FROM nutrition_operations WHERE operation_type='cook' "
                                 "AND json_extract(result_json,'$.previewToken')=?", (token,)):
                raise DomainError('Ovaj pregled je već potvrđen. Osvježi pregled.', 409,
                                  {'code':'preview_already_committed', 'refreshPreview':True})
            if data.get('scheduleId'):
                db.execute('UPDATE nutrition_prep_schedule SET status=?,operation_id=? WHERE id=?',('prepared',op,data['scheduleId']))
            for allocation in plan['allocations']:
                self.change(db,op,allocation['lotId'],-fixed(allocation['quantity']),'cooking', data['asOf'])
            batch=uid()
            sources = [ingredient['source'] for ingredient in plan['ingredients']]
            snapshot = {'name': plan['name'], 'nutrients': plan['nutrients'],
                        'perPortion': plan['perPortion'], 'ingredients': plan['ingredients'],
                        'ingredientSources': sources, 'nutritionVersionIds': [s['nutritionVersionId'] for s in sources],
                        'perPortionComparable':plan['perPortionComparable'], 'carbComparison':plan['carbComparison'],
                        'cost':plan['cost'], 'costPerPortion':plan['costPerPortion'],
                        'massPerPortion':plan['massPerPortion'], 'previewToken':plan['previewToken']}
            portions=fixed(data['portions'])
            db.execute('INSERT INTO nutrition_prep_batches VALUES (?,?,?,?,?,?,?)',(batch,plan['recipeVersionId'],op,portions,fixed(data['cookedMass']) if data.get('cookedMass') else None,dumps(snapshot),now()))
            # A lot tracks fractional portions without assigning raw mass to cooked food.
            lot=uid()
            db.execute('INSERT INTO nutrition_inventory_lots (id,batch_id,quantity,initial_quantity,unit,location,expires_on,received_at) VALUES (?,?,?,?,?,?,?,?)',(lot,batch,0,portions,'portion',data['location'],str(data['expiresOn']),now()))
            db.execute('UPDATE nutrition_inventory_lots SET available_on=? WHERE id=?', (str(data['asOf']), lot))
            self.change(db,op,lot,portions,'prepared', data['asOf'])
            db.execute('INSERT INTO nutrition_prepared_portions VALUES (?,?,?)',(uid(),batch,lot))
            return {'batchId':batch,'lotId':lot, 'previewToken':plan['previewToken']}
        payload = {k:v for k,v in data.items() if k not in ('previewToken','optionalIngredientPositions') or v is not None}
        return self.repo.operation('cook',key,payload,action)

    def batch_snapshot(self, db, batch):
        snapshot = json.loads(batch['snapshot_json'])
        if 'ingredientSources' not in snapshot:
            # Older batches recorded current catalogue IDs alongside frozen recipe values.
            foods = frozen_foods(db, batch['recipe_version_id'])
            snapshot['ingredientSources'] = [ingredient_source(food) for food in foods]
            snapshot['nutritionVersionIds'] = [food['nutritionVersionId'] for food in foods]
        return snapshot

    def batches(self, db):
        batches = rows(db, 'SELECT * FROM nutrition_prep_batches ORDER BY created_at DESC LIMIT 100')
        for batch in batches:
            batch['snapshot_json'] = dumps(self.batch_snapshot(db, batch))
        return batches

    def log(self,key,data):
        def action(db,op):
            if str(data['date'])>str(self.today()):
                raise DomainError('Konzumacija ne može biti u budućnosti.',422)
            quantity=Decimal(str(data['quantity']))
            provenance={}
            status = 'unavailable'
            if data['kind']=='portion':
                lot=one(db,'SELECT * FROM nutrition_inventory_lots WHERE id=? AND batch_id IS NOT NULL',(data['sourceId'],))
                if lot_availability(db, lot, data['date'])['available'] < fixed(quantity):
                    raise DomainError('Porcija nije raspoloživa na odabrani datum. Provjeri datum pripreme i rok.', 409)
                if lot['expires_on'] and lot['expires_on']<str(data['date']):
                    raise DomainError('Porcija ima istekao rok.')
                batch=one(db,'SELECT * FROM nutrition_prep_batches WHERE id=?',(lot['batch_id'],))
                snap = self.batch_snapshot(db, batch)
                provenance={'batchId':batch['id'],'recipeVersionId':batch['recipe_version_id'],
                            'ingredientSources': snap['ingredientSources']}
                nutrients=scaled(snap['perPortion'],quantity)
                comparable = scaled(snap.get('perPortionComparable') or comparison(snap['perPortion'])[0], quantity)
                status = snap.get('carbComparison', 'unavailable')
                name=snap['name'];unit='portion'
                self.change(db,op,lot['id'],-fixed(quantity),'consumption', data['date'])
            elif data['kind']=='food':
                food=self.food(db,data['sourceId']);mass=grams(quantity,food)
                provenance={'nutritionVersionId':food['nutritionVersionId'],'source':food['source'],'state':food['state']}
                provenance.update(sourceId=food['sourceId'], nutritionData=food['nutritionData'])
                nutrients=scaled(food['nutrients'],mass/100) if mass is not None else {k:None for k in KEYS}
                comparable = scaled(food['comparableNutrients'], mass/100) if mass is not None else {k:None for k in KEYS}
                status = food['carbComparison'] if mass is not None else 'unavailable'
                name=food['name'];unit=food['unit']
                if data['consumeInventory']:
                    allocations,short=self.allocate(db,food['id'],fixed(quantity),data['date'])
                    if short: raise DomainError('Nedostatne zalihe.')
                    for a in allocations:self.change(db,op,a['lotId'],-a['quantity'],'consumption', data['date'])
            else:
                if data['consumeInventory']:
                    raise DomainError('Recept prvo pripremi u Meal Prep; zatim konzumiraj gotovu porciju.',422)
                recipe=self.recipe(db,version_id=data['sourceId'])
                provenance={'recipeVersionId':recipe['versionId'], 'ingredientSources':recipe['ingredientSources']}
                nutrients=scaled(recipe['perPortion'],quantity);name=recipe['name'];unit='portion'
                comparable = scaled(recipe['perPortionComparable'], quantity)
                status = recipe['carbComparison']
            entry=uid()
            snapshot={**nutrients,'sourceKind':data['kind'],'sourceId':data['sourceId'],'recordedAt':now(),'provenance':provenance,
                      'comparableNutrients':comparable, 'carbComparison':status}
            db.execute('INSERT INTO nutrition_food_log_entries VALUES (?,?,?,?,?,?,?,?,0,?)',(entry,str(data['date']),data['meal'],name,fixed(quantity),unit,dumps(snapshot),op,now()))
            for k in KEYS:
                if nutrients[k] is not None:db.execute('INSERT INTO nutrition_food_log_nutrients VALUES (?,?,?)',(entry,k,fixed(nutrients[k])))
            db.execute('INSERT INTO nutrition_diary_days VALUES (?,0) ON CONFLICT(entry_date) DO UPDATE SET complete=0',(str(data['date']),))
            return {'entryId':entry}
        return self.repo.operation('log',key,data,action)

    def diary(self,db,day):
        entries=rows(db,'SELECT * FROM nutrition_food_log_entries WHERE entry_date=? AND voided=0 ORDER BY created_at',(str(day),))
        for e in entries:
            e['nutrients'] = json.loads(e.pop('snapshot_json'))
            e['quantity'] = text(decimal(e['quantity']))
            provenance = e['nutrients'].get('provenance', {})
            if provenance.get('recipeVersionId') and 'ingredientSources' not in provenance:
                foods = frozen_foods(db, provenance['recipeVersionId'])
                provenance['ingredientSources'] = [ingredient_source(food) for food in foods]
        complete=rows(db,'SELECT complete FROM nutrition_diary_days WHERE entry_date=?',(str(day),))
        nutrients=total([e['nutrients'] for e in entries]) if entries else {k:'0' if complete and complete[0]['complete'] else None for k in KEYS}
        comparable = total([comparable_snapshot(e['nutrients']) for e in entries]) if entries else dict(nutrients)
        status = combined_status(e['nutrients'].get('carbComparison', 'unavailable') for e in entries)
        if not entries and not (complete and complete[0]['complete']):
            status = 'unavailable'
        targets=rows(db,'SELECT data_json FROM nutrition_target_periods WHERE effective_date<=? ORDER BY effective_date DESC LIMIT 1',(str(day),))
        return {'date':str(day),'entries':entries,'nutrients':nutrients,'complete':bool(complete and complete[0]['complete']),'targets':json.loads(targets[0]['data_json']) if targets else {},
                'comparableNutrients':comparable, 'carbComparison':status, 'targetCarbDefinition':'eu_available'}

    def reverse(self,key,operation_id):
        def action(db,op):
            old=one(db,'SELECT * FROM nutrition_operations WHERE id=?',(operation_id,))
            if old['operation_type']=='usda_food_create':
                raise DomainError('Namirnicu možeš urediti u katalogu.')
            if old['reversed_by'] or old['operation_type']=='reverse':raise DomainError('Operacija je već poništena ili je kompenzacijska.')
            transactions=rows(db,'SELECT * FROM nutrition_inventory_transactions WHERE operation_id=?',(operation_id,))
            for t in transactions:
                newer=rows(db,'SELECT t.id FROM nutrition_inventory_transactions t JOIN nutrition_operations o ON o.id=t.operation_id WHERE t.lot_id=? AND t.rowid>(SELECT MAX(rowid) FROM nutrition_inventory_transactions WHERE operation_id=?) AND o.reversed_by IS NULL AND o.operation_type<>?',(t['lot_id'],operation_id,'reverse'))
                if newer:raise DomainError('Lot ima kasnije promjene. Najprije poništi povezane novije operacije.')
            for t in reversed(transactions):
                if not t['event_date']:
                    raise DomainError('Za poništavanje stare operacije nedostaje poslovni datum.', 409)
                self.change(db,op,t['lot_id'],-t['delta'],'reversal', t['event_date'])
            db.execute('UPDATE nutrition_food_log_entries SET voided=1 WHERE operation_id=?',(operation_id,))
            db.execute('UPDATE nutrition_diary_days SET complete=0 WHERE entry_date IN (SELECT entry_date FROM nutrition_food_log_entries WHERE operation_id=?)',(operation_id,))
            db.execute('UPDATE nutrition_operations SET reversed_by=? WHERE id=?',(op,operation_id))
            db.execute('UPDATE nutrition_prep_schedule SET status=?,operation_id=NULL WHERE operation_id=?',('planned',operation_id))
            if old['operation_type']=='purchase':
                request_result=json.loads(old['result_json'])
                db.execute('UPDATE nutrition_shopping_items SET received=0,checked=0,version=version+1 WHERE id=?',(request_result.get('itemId'),))
            return {'reversed':operation_id}
        return self.repo.operation('reverse',key,{'id':operation_id},action)

    def plan(self,db,start,end):
        entries=rows(db,'SELECT * FROM nutrition_meal_plan_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date,meal',(str(start),str(end)))
        for e in entries:
            recipe=self.recipe(db,version_id=e['recipe_version_id'])
            e['portions']=text(decimal(e['portions']));e['name']=recipe['name'];e['nutrients']=scaled(recipe['perPortion'],Decimal(e['portions']));e['estimatedCost']=text(Decimal(recipe['costPerPortion'])*Decimal(e['portions'])) if recipe['costPerPortion'] is not None else None
            e['comparableNutrients'] = scaled(recipe['perPortionComparable'], Decimal(e['portions']))
            e['carbComparison'] = recipe['carbComparison']
        return entries

    def plan_summary(self,db,start,end):
        entries=[e for e in self.plan(db,start,end) if e['status']!='skipped']
        return {'nutrients':total([e['nutrients'] for e in entries]),'estimatedCost':text(sum((Decimal(e['estimatedCost']) for e in entries),Decimal(0))) if all(e['estimatedCost'] is not None for e in entries) else None,
                'comparableNutrients':total([e['comparableNutrients'] for e in entries]),
                'carbComparison':combined_status(e['carbComparison'] for e in entries),
                'days':[{'date':str(start+timedelta(days=i)),'nutrients':total([e['nutrients'] for e in entries if e['entry_date']==str(start+timedelta(days=i))])} for i in range((end-start).days+1)]}

    def save_plan(self,data,plan_id=None):
        with self.connection() as db:
            self.recipe(db,version_id=data['recipeVersionId'])
            if plan_id:
                cur=db.execute('UPDATE nutrition_meal_plan_entries SET entry_date=?,meal=?,recipe_version_id=?,portions=?,status=?,version=version+1 WHERE id=? AND version=?',(str(data['date']),data['meal'],data['recipeVersionId'],fixed(data['portions']),data.get('status','planned'),plan_id,data['expectedVersion']))
                if cur.rowcount!=1:raise DomainError('Plana nema ili je promijenjen.')
            else:
                plan_id=uid()
                db.execute('INSERT INTO nutrition_meal_plan_entries (id,entry_date,meal,recipe_version_id,portions,status) VALUES (?,?,?,?,?,?)',(plan_id,str(data['date']),data['meal'],data['recipeVersionId'],fixed(data['portions']),data.get('status','planned')))
            return {'id':plan_id}

    def shopping(self,db,start,end):
        if end<start or (end-start).days>90:raise DomainError('Odaberi raspon do 90 dana.',422)
        entries=self.plan(db,start,end);needs={};sources={}
        # Simulated allocation across meals avoids reusing the same stock for each recipe.
        remaining={l['id']:fixed(l['quantity']) for l in self.inventory(db)}
        for entry in entries:
            if entry['status'] in ('consumed','skipped'):continue
            recipe=self.recipe(db,version_id=entry['recipe_version_id'])
            portions=Decimal(entry['portions'])
            for lot in available_lots(db, entry['entry_date'], recipe_version_id=recipe['versionId']):
                take=min(fixed(portions),remaining.get(lot['id'],0),lot['quantity']);remaining[lot['id']]-=take;portions-=decimal(take)
            for fid,q in self.requirements(recipe,portions).items():
                sources.setdefault(fid,set()).add(entry['id'])
                required=q
                for lot in available_lots(db, entry['entry_date'], food_id=fid):
                    take=min(q,remaining.get(lot['id'],0),lot['quantity']);remaining[lot['id']]-=take;q-=take
                n=needs.setdefault(fid,{'required':0,'missing':0});n['required']+=required;n['missing']+=q
        items=[]
        for fid,n in needs.items():
            food=self.food(db,fid)
            price=rows(db,'SELECT p.* FROM nutrition_price_history p LEFT JOIN nutrition_operations o ON o.id=p.operation_id WHERE p.food_id=? AND o.reversed_by IS NULL ORDER BY p.purchased_on DESC,p.rowid DESC LIMIT 1',(fid,))
            cost=decimal(price[0]['cost'],10000)*Decimal(n['missing'])/price[0]['quantity'] if price else None
            items.append({'foodId':fid,'name':food['name'],'unit':food['unit'],'required':text(decimal(n['required'])),'available':text(decimal(n['required']-n['missing'])),'quantity':text(decimal(n['missing'])),'cost':text(cost) if cost is not None else None,'priceDate':price[0]['purchased_on'] if price else None,'planIds':sorted(sources[fid])})
        return items
