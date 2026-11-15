import json
import os
from http.client import HTTPException as HttpProtocolError
from urllib.parse import urlencode
from urllib.request import urlopen
from fastapi import HTTPException, Path, Query
from .. import models as m
from ..normalization import normalized_value
from ..engine import decimal, fixed
from ..repository import DomainError


# Supported vitamin and mineral IDs. Other observations remain in originalValues.
MICRO_IDS = {1087, 1089, 1090, 1091, 1092, 1093, 1095, 1098, 1101, 1103,
             1106, 1109, 1114, 1162, 1165, 1166, 1167, 1175, 1177, 1178, 1185}


def food_from_usda(data, source_id, state):
    if (data.get('fdcId') != source_id or not isinstance(data.get('description'), str)
            or not data['description'].strip() or not isinstance(data.get('foodNutrients'), list)):
        raise ValueError('Invalid USDA detail')
    micro_candidates = {}
    observations = []
    candidates = {}
    ids = {1008:'kcal', 2047:'kcal', 2048:'kcal', 1003:'protein',
           1005:'carbs', 1004:'fat', 1079:'fiber'}
    for row in data.get('foodNutrients', []):
        nutrient = row.get('nutrient', {})
        observation = m.NutrientObservation(nutrientId=str(nutrient.get('id', 'unknown')),
            value=row.get('amount'), unit=nutrient.get('unitName', ''), name=nutrient.get('name', ''))
        observations.append(observation)
        nutrient_id = nutrient.get('id')
        target = ids.get(nutrient_id)
        if nutrient_id in MICRO_IDS and observation.value is not None and 0 < len(observation.name) <= 80:
            unit = observation.unit.lower().replace('µ', 'u').replace('μ', 'u')
            if unit in ('mg', 'ug', 'g', 'iu'):
                micro_candidates.setdefault(observation.name, set()).add(
                    (observation.value, 'IU' if unit == 'iu' else unit))
        if target:
            value = normalized_value(observation.value, observation.unit, target)
            if value is not None:
                candidates.setdefault(nutrient_id, []).append(value)
    # Conflicting duplicate observations cannot silently overwrite one another.
    values = {key:items[0] for key, items in candidates.items() if len(set(items)) == 1}
    nutrients = {target:values[key] for key, target in ids.items() if key in values and target != 'kcal'}
    foundation = data.get('dataType') == 'Foundation'
    energy_order = (2048, 2047, 1008) if foundation else (1008, 2048, 2047)
    selected = next((key for key in energy_order if key in values), None)
    methods = {1008:'usda_1008', 2047:'atwater_general', 2048:'atwater_specific'}
    if selected:
        nutrients['kcal'] = values[selected]
    # Branded labels and unknown datasets do not establish fiber inclusion.
    confirmed_total = data.get('dataType') in ('Foundation', 'SR Legacy')
    metadata = m.NutritionData(carbDefinition='total_including_fiber' if confirmed_total else 'unknown',
                              energyMethod=methods.get(selected, 'unknown'), originalValues=observations)
    micros = {}
    for name, readings in micro_candidates.items():
        if len(readings) == 1:
            amount, unit = next(iter(readings))
            stored = decimal(fixed(amount))
            if stored or amount == 0:
                micros[name] = m.Micronutrient(value=stored, unit=unit)
    metadata.usda = m.UsdaSource(description=data['description'], dataType=data.get('dataType') or 'Unknown',
        nutrients=nutrients, carbDefinition=metadata.carbDefinition, energyMethod=metadata.energyMethod)
    return m.Food(name=data['description'][:150], state=state, unit='g',
                  source='USDA FoodData Central · /100 g', sourceId=str(source_id),
                  nutrients=nutrients, micronutrients=micros, nutritionData=metadata)


def attach_food_routes(router, core, service, run):
    def fetch(path, params):
        key = os.getenv('USDA_API_KEY') or core.ENV.get('USDA_API_KEY')
        if not key:
            raise HTTPException(503, 'USDA nije konfiguriran. Dostupan je ručni unos.')
        url = 'https://api.nal.usda.gov/fdc/v1/' + path + '?' + urlencode({**params, 'api_key': key})
        try:
            with urlopen(url, timeout=15) as response:
                return json.loads(response.read(1000000))
        except (HttpProtocolError, OSError, ValueError) as exc:
            raise HTTPException(503, 'USDA trenutačno nije dostupan. Pokušaj ponovno ili nastavi ručno.') from exc

    def detail(source_id, state):
        data = fetch(f'food/{source_id}', {})
        try:
            return food_from_usda(data, source_id, state)
        except (AttributeError, TypeError, ValueError, ArithmeticError) as exc:
            raise DomainError('USDA zapis sadrži neispravne podatke.', 422) from exc

    @router.get('/food-imports/{source_id}/preview')
    def preview(source_id: int = Path(gt=0)):
        return run(lambda: detail(source_id, 'label').model_dump())

    @router.post('/food-imports')
    def import_food(body: m.FoodImport):
        return run(lambda: service.save_food(detail(body.sourceId, body.state).model_dump()))

    @router.get('/food-search')
    def search(q: str = Query(min_length=2, max_length=100), provider: str = 'usda'):
        if provider != 'usda':
            raise HTTPException(503, 'Odabrani izvor nije dostupan.')
        def work():
            data = fetch('foods/search', {'query': q, 'pageSize': 15})
            try:
                if not isinstance(data['foods'], list):
                    raise ValueError()
                results = []
                for f in data['foods']:
                    if not isinstance(f['fdcId'], int) or f['fdcId'] <= 0 or not isinstance(f['description'], str) or not f['description'].strip():
                        raise ValueError()
                    results.append({'sourceId': str(f['fdcId']), 'name': f['description'],
                        'dataType': f.get('dataType'), 'brand': f.get('brandName') or f.get('brandOwner'),
                        'nutrients': f.get('foodNutrients', []), 'source': 'USDA FoodData Central'})
                return results
            except (KeyError, TypeError, ValueError) as exc:
                raise HTTPException(502, 'USDA je vratio neispravne rezultate. Pokušaj ponovno.') from exc
        return run(work)
