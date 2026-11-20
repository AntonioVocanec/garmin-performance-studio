"""One read-only cooking calculation shared by preview and transactional commit."""
import json
from decimal import Decimal
from .availability import available_lots
from .engine import KEYS, MIN_QUANTITY, decimal, fixed, grams, per_portion, quantity_units, scaled, text, total
from .normalization import combined_status, comparable_snapshot
from .repository import digest, rows


def cooking_plan(service, db, data):
    recipe = service.recipe(db, version_id=data['recipeVersionId'])
    foods = [json.loads(row['food_snapshot_json']) for row in rows(
        db, 'SELECT food_snapshot_json FROM nutrition_recipe_ingredients WHERE version_id=? ORDER BY position',
        (recipe['versionId'],))]
    issues = []
    optional = {i for i, item in enumerate(recipe['ingredients']) if item.get('optional')}
    choice = data.get('optionalIngredientPositions')
    selected = set(choice or [])
    if optional and choice is None:
        issues.append({'code':'optional_selection_required', 'message':'Potvrdi uključene i isključene opcionalne sastojke.'})
    if selected - optional or len(selected) != len(choice or []):
        issues.append({'code':'invalid_optional_selection', 'message':'Izbor opcionalnih sastojaka nije valjan.'})
    if str(data['asOf']) > str(service.today()) or str(data['expiresOn']) < str(data['asOf']):
        issues.append({'code':'invalid_dates', 'message':'Provjeri datum pripreme i rok gotovog jela.'})
    schedule = None
    if data.get('scheduleId'):
        schedules = rows(db, 'SELECT * FROM nutrition_prep_schedule WHERE id=?', (data['scheduleId'],))
        schedule = schedules[0] if schedules else None
        if (not schedule or schedule['status'] != 'planned' or
            schedule['recipe_version_id'] != recipe['versionId'] or schedule['portions'] != fixed(data['portions'])):
            issues.append({'code':'schedule_changed', 'message':'Raspored pripreme je izmijenjen ili izvršen.'})

    portions = Decimal(str(data['portions']))
    factor = portions / Decimal(recipe['portions'])
    ingredients, parts, comparable_parts, statuses, needs = [], [], [], [], {}
    warnings = []
    for position, (item, food) in enumerate(zip(recipe['ingredients'], foods, strict=True)):
        if position in optional and position not in selected:
            continue
        requested = Decimal(str(item['quantity'])) * factor
        if requested < MIN_QUANTITY:
            issues.append({'code':'quantity_below_minimum', 'position':position, 'unit':food['unit'],
                           'requestedQuantity':text(requested), 'minimumQuantity':text(MIN_QUANTITY),
                           'message':food['name'] + ': količina je manja od 0,001 ' + food['unit'] + '.'})
            continue
        units = quantity_units(requested)
        quantity = decimal(units)
        if quantity != requested:
            warnings.append(food['name'] + ': količina je zaokružena na ' + text(quantity) + ' ' + food['unit'] + '.')
        ingredients.append({**item, 'quantity':text(quantity), 'requestedQuantity':text(requested),
                            'position':position, 'name':food['name'], 'unit':food['unit'],
                            'source':recipe['ingredientSources'][position]})
        needs[food['id']] = needs.get(food['id'], 0) + units
        mass = grams(quantity, food)
        parts.append(scaled(food['nutrients'], mass/100) if mass is not None else {key:None for key in KEYS})
        comparable_parts.append(scaled(comparable_snapshot(food), mass/100) if mass is not None else {key:None for key in KEYS})
        statuses.append(food.get('carbComparison', 'unavailable') if mass is not None else 'unavailable')
    if not ingredients:
        issues.append({'code':'no_ingredients', 'message':'Odaberi barem jedan sastojak s podržanom količinom.'})

    allocations, missing, inventory, availability = [], [], [], []
    cost = Decimal(0)
    cost_complete = True
    for food_id, required in needs.items():
        remaining = required
        candidates = available_lots(db, data['asOf'], food_id=food_id)
        for lot in candidates:
            inventory.append({key:lot[key] for key in ('id','version','quantity','expires_on','available_on','cost')})
            take = min(remaining, lot['quantity'])
            if not take:
                continue
            allocations.append({'lotId':lot['id'], 'foodId':food_id, 'quantity':text(decimal(take)), 'version':lot['version']})
            remaining -= take
            if lot['cost'] is None:
                cost_complete = False
            else:
                cost += decimal(lot['cost'], 10000) * Decimal(take) / lot['initial_quantity']
        item = next(i for i in ingredients if i['foodId'] == food_id)
        availability.append({'foodId':food_id, 'name':item['name'], 'unit':item['unit'],
                             'required':text(decimal(required)),
                             'available':text(decimal(sum(lot['quantity'] for lot in candidates))),
                             'missing':text(decimal(remaining))})
        if remaining:
            missing.append({'foodId':food_id, 'name':item['name'], 'unit':item['unit'], 'quantity':text(decimal(remaining))})
    if missing:
        issues.append({'code':'missing_ingredients', 'message':'Nedostaju sastojci za odabranu pripremu.'})
    nutrients, comparable = total(parts), total(comparable_parts)
    result = {'recipeVersionId':recipe['versionId'], 'name':recipe['name'], 'portions':text(portions),
              'factor':text(factor), 'ingredients':ingredients, 'allocations':allocations, 'missing':missing,
              'issues':issues, 'warnings':warnings, 'feasible':not issues,
              'nutrients':nutrients, 'perPortion':per_portion(nutrients, portions),
              'perPortionComparable':per_portion(comparable, portions), 'carbComparison':combined_status(statuses),
              'cost':text(cost) if cost_complete and not missing else None,
              'cookedMass':text(data['cookedMass']) if data.get('cookedMass') else None,
              'massPerPortion':text(Decimal(str(data['cookedMass']))/portions) if data.get('cookedMass') else None}
    result['costPerPortion'] = text(cost/portions) if result['cost'] is not None else None
    result['previewToken'] = digest({'request':{k:v for k,v in data.items() if k != 'previewToken'},
                                     'plan':result, 'inventory':inventory, 'schedule':schedule})
    result['ingredientAvailability'] = availability
    return result
