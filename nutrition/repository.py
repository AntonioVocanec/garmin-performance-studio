import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from uuid import uuid4
from decimal import Decimal


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def dumps(value):
    return json.dumps(value, ensure_ascii=False, default=lambda v: str(v) if isinstance(v, Decimal) else v.isoformat(), sort_keys=True)


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def rows(db, sql, args=()):
    cursor = db.execute(sql, args)
    keys = [v[0] for v in cursor.description]
    return [dict(zip(keys, row)) for row in cursor.fetchall()]


def one(db, sql, args=()):
    result = rows(db, sql, args)
    if not result:
        raise DomainError('Zapis nije pronađen.', 404)
    return result[0]


class DomainError(ValueError):
    def __init__(self, message, status=409, details=None):
        super().__init__(message)
        self.status = status
        self.details = details


class Repository:
    def __init__(self, connection):
        self.connection = connection

    def operation(self, kind, key, payload, action):
        if not key or len(key) > 150:
            raise DomainError('Potreban je valjan Idempotency-Key.', 422)
        fingerprint = digest(payload)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = rows(db, 'SELECT * FROM nutrition_operations WHERE operation_type=? AND idempotency_key=?', (kind, key))
            if previous:
                if previous[0]['request_hash'] != fingerprint:
                    raise DomainError('Ključ je već korišten za drugi zahtjev.')
                return json.loads(previous[0]['result_json'])
            operation_id = uid()
            db.execute('INSERT INTO nutrition_operations VALUES (?,?,?,?,?,?,NULL)', (operation_id, kind, key, fingerprint, '{}', now()))
            result = action(db, operation_id)
            result['operationId'] = operation_id
            db.execute('UPDATE nutrition_operations SET result_json=? WHERE id=?', (dumps(result), operation_id))
            return json.loads(dumps(result))
