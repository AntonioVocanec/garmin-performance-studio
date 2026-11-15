"""Versioned source semantics. Historical values are never rewritten."""
from decimal import Decimal
from .engine import KEYS, text, fixed, decimal


def nutrition_metadata(data):
    metadata = dict(data.get('nutritionData') or {})
    metadata.setdefault('schemaVersion', 1)
    metadata.setdefault('basis', '100g')
    metadata.setdefault('carbDefinition', 'unknown')
    metadata.setdefault('energyMethod', 'unknown')
    if not metadata.get('originalValues'):
        metadata['originalValues'] = [
            {'nutrientId': key, 'value': str(value), 'unit': 'kcal' if key == 'kcal' else 'g'}
            for key, value in data['nutrients'].items() if value is not None
        ]
    metadata['state'] = data['state']
    metadata['normalizedUnits'] = {key:'kcal' if key == 'kcal' else 'g' for key in KEYS}
    return metadata


def comparison(nutrients, metadata=None):
    values = {key:nutrients.get(key) for key in KEYS}
    definition = (metadata or {}).get('carbDefinition', 'unknown')
    carbs, fiber = values['carbs'], values['fiber']
    status = 'unavailable'
    if carbs is not None and definition == 'eu_available':
        status = 'exact'
    elif (carbs is not None and fiber is not None and definition == 'total_including_fiber'
          and Decimal(str(carbs)) >= Decimal(str(fiber))):
        values['carbs'] = text(Decimal(str(carbs)) - Decimal(str(fiber)))
        status = 'estimated'
    else:
        values['carbs'] = None
    return values, status


def comparable_snapshot(snapshot):
    # No reinterpretation of existing snapshots without their recorded semantics.
    return snapshot.get('comparableNutrients') or comparison(snapshot)[0]


def combined_status(statuses):
    statuses = list(statuses)
    if 'unavailable' in statuses:
        return 'unavailable'
    return 'estimated' if 'estimated' in statuses else 'exact'


def normalized_value(value, unit, target):
    if value is None:
        return None
    factor = ({'g':Decimal(1), 'mg':Decimal('.001'), 'ug':Decimal('.000001')}
              if target != 'kcal' else {'kcal':Decimal(1), 'kj':Decimal(1)/Decimal('4.184')})
    conversion = factor.get(unit.strip().lower())
    if conversion is None:
        return None
    return text(decimal(fixed(Decimal(str(value)) * conversion)))
