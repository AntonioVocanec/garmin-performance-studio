import json
import os
from urllib.parse import urlencode
from urllib.request import urlopen
from fastapi import HTTPException, Query
from pydantic import ValidationError
from .. import models as m
from ..normalization import normalized_value
from ..repository import DomainError


def food_from_usda(data, body):
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
    return m.Food(name=data.get('description','USDA namirnica')[:150], state=body.state, unit='g',
                  source='USDA FoodData Central · /100 g', sourceId=str(body.sourceId),
                  nutrients=nutrients, nutritionData=metadata)


def attach_food_routes(router,core,service,run):
    @router.post('/food-imports')
    def import_food(body:m.FoodImport):
        key=os.getenv('USDA_API_KEY') or core.ENV.get('USDA_API_KEY')
        if not key:raise HTTPException(503,'USDA uvoz nije konfiguriran.')
        def work():
            try:
                with urlopen('https://api.nal.usda.gov/fdc/v1/food/'+str(body.sourceId)+'?'+urlencode({'api_key':key}),timeout=15) as r:data=json.loads(r.read(1000000))
            except Exception as e:raise HTTPException(503,'USDA zapis nije dostupan.') from e
            try:
                food = food_from_usda(data, body)
            except (ValidationError, ArithmeticError) as exc:
                raise DomainError('USDA zapis sadrži neispravne nutritivne vrijednosti.', 422) from exc
            return service.save_food(food.model_dump())
        return run(work)
    @router.get('/food-search')
    def search(q:str=Query(min_length=2,max_length=100),provider:str='usda'):
        key=os.getenv('USDA_API_KEY') or core.ENV.get('USDA_API_KEY')
        if provider!='usda' or not key:raise HTTPException(503,'USDA pretraga nije konfigurirana; dostupan je ručni unos.')
        def work():
            try:
                with urlopen('https://api.nal.usda.gov/fdc/v1/foods/search?'+urlencode({'api_key':key,'query':q,'pageSize':15}),timeout=15) as r:data=json.loads(r.read(1000000))
                return [{'sourceId':str(f['fdcId']),'name':f.get('description'),'dataType':f.get('dataType'),'nutrients':f.get('foodNutrients',[]),'source':'USDA FoodData Central'} for f in data.get('foods',[])]
            except Exception as e:
                raise HTTPException(503,'USDA podaci trenutačno nisu dostupni.') from e
        return run(work)
