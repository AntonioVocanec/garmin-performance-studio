"""Capacity to use current stock on a business date, in fixed integer units."""
from .repository import rows


def lot_availability(db, lot, as_of):
    day = str(as_of)
    physical = lot['quantity']
    received = lot.get('available_on')
    expired = physical if lot['expires_on'] and lot['expires_on'] < day else 0
    capacity = 0
    if received and received <= day and not expired:
        events = rows(db, 'SELECT event_date,SUM(delta) AS delta FROM nutrition_inventory_transactions '
                          'WHERE lot_id=? GROUP BY event_date ORDER BY event_date', (lot['id'],))
        # An undated ledger cannot prove that a historical consumption is valid.
        if all(event['event_date'] for event in events):
            balance = sum(event['delta'] for event in events if event['event_date'] <= day)
            capacity = min(physical, balance)
            for event in events:
                if event['event_date'] > day:
                    balance += event['delta']
                    capacity = min(capacity, balance)
    return {'physical':physical, 'available':max(0, capacity), 'expired':expired,
            'receivedOn':received, 'dateKnown':bool(received)}


def available_lots(db, as_of, food_id=None, recipe_version_id=None):
    lots = rows(db, 'SELECT l.*,b.recipe_version_id FROM nutrition_inventory_lots l '
                    'LEFT JOIN nutrition_prep_batches b ON b.id=l.batch_id WHERE l.quantity>0 '
                    'ORDER BY l.expires_on IS NULL,l.expires_on,l.available_on,l.received_at,l.id')
    result = []
    for lot in lots:
        if food_id is not None and lot['food_id'] != food_id:
            continue
        if recipe_version_id is not None and lot['recipe_version_id'] != recipe_version_id:
            continue
        capacity = lot_availability(db, lot, as_of)['available']
        if capacity:
            result.append({**lot, 'quantity':capacity})
    return result
