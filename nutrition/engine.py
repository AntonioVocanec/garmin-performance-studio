"""Deterministic quantity/nutrition arithmetic; never infers unknown values."""
from decimal import Decimal, ROUND_HALF_UP
from .repository import DomainError

KEYS = ('kcal', 'protein', 'carbs', 'fat', 'fiber')
MIN_QUANTITY = Decimal('0.001')


def quantity_units(value):
    number = Decimal(str(value))
    if number < MIN_QUANTITY:
        raise DomainError('Najmanja količina sastojka je 0,001 inventarne jedinice.', 422)
    return fixed(number)


def fixed(value, scale=1000):
    number=Decimal(str(value))
    if not number.is_finite() or abs(number*scale)>2**63-1:
        raise DomainError('Izračunata količina prelazi podržanu preciznost.',422)
    return int((number * scale).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def decimal(value, scale=1000):
    return Decimal(value) / scale


def text(value):
    return format(Decimal(str(value)).normalize(), 'f')


def scaled(nutrients, factor):
    return {k: None if nutrients.get(k) is None else text(Decimal(str(nutrients[k])) * factor) for k in KEYS}


def per_portion(nutrients, portions):
    return {k:None if nutrients.get(k) is None else text(Decimal(str(nutrients[k])) / portions) for k in KEYS}


def total(parts):
    return {k: None if any(p.get(k) is None for p in parts) else text(sum((Decimal(str(p[k])) for p in parts), Decimal(0))) for k in KEYS}


def grams(quantity, food):
    if food['unit'] == 'g':
        return quantity
    conversion = food.get('gramsPerUnit')
    return None if conversion is None else quantity * Decimal(str(conversion))
