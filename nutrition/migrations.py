"""Additive migrations registered by the existing archive runner."""
import sqlite3


def create(db: sqlite3.Connection, statements: list[str]) -> None:
    for statement in statements:
        db.execute(statement)


def migration_4(db: sqlite3.Connection) -> None:
    create(db, [
        "CREATE TABLE nutrition_profiles (id INTEGER PRIMARY KEY CHECK(id=1), data_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE nutrition_target_periods (effective_date TEXT PRIMARY KEY, data_json TEXT NOT NULL)",
        "CREATE TABLE nutrition_foods (id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, unit TEXT NOT NULL, grams_per_unit INTEGER, minimum_quantity INTEGER NOT NULL DEFAULT 0 CHECK(minimum_quantity>=0), allergens_json TEXT NOT NULL, allergens_known INTEGER NOT NULL DEFAULT 0, dietary_tags_json TEXT NOT NULL DEFAULT '[]', archived INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE nutrition_nutrition_versions (id TEXT PRIMARY KEY, food_id TEXT NOT NULL REFERENCES nutrition_foods(id), source TEXT NOT NULL, source_id TEXT, retrieved_at TEXT NOT NULL, basis TEXT NOT NULL DEFAULT '100g', UNIQUE(food_id,id))",
        "CREATE TABLE nutrition_nutrient_values (version_id TEXT NOT NULL REFERENCES nutrition_nutrition_versions(id), nutrient TEXT NOT NULL, value INTEGER NOT NULL CHECK(value>=0), unit TEXT NOT NULL, PRIMARY KEY(version_id,nutrient))",
        "CREATE TABLE nutrition_operations (id TEXT PRIMARY KEY, operation_type TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, reversed_by TEXT REFERENCES nutrition_operations(id), UNIQUE(operation_type,idempotency_key))",
        "CREATE TABLE nutrition_inventory_lots (id TEXT PRIMARY KEY, food_id TEXT REFERENCES nutrition_foods(id), batch_id TEXT REFERENCES nutrition_prep_batches(id), quantity INTEGER NOT NULL CHECK(quantity>=0), initial_quantity INTEGER NOT NULL CHECK(initial_quantity>0), unit TEXT NOT NULL, location TEXT NOT NULL, expires_on TEXT, received_at TEXT NOT NULL, cost INTEGER CHECK(cost>=0), version INTEGER NOT NULL DEFAULT 1, CHECK((food_id IS NULL) != (batch_id IS NULL)))",
        "CREATE TABLE nutrition_inventory_transactions (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES nutrition_operations(id), lot_id TEXT NOT NULL REFERENCES nutrition_inventory_lots(id), delta INTEGER NOT NULL, reason TEXT NOT NULL)",
        "CREATE INDEX nutrition_lot_fefo ON nutrition_inventory_lots(food_id,expires_on,received_at)",
        "CREATE INDEX nutrition_transaction_operation ON nutrition_inventory_transactions(operation_id)",
        "CREATE TABLE nutrition_price_history (id TEXT PRIMARY KEY, food_id TEXT NOT NULL REFERENCES nutrition_foods(id), quantity INTEGER NOT NULL CHECK(quantity>0), unit TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost>=0), currency TEXT NOT NULL CHECK(currency='EUR'), purchased_on TEXT NOT NULL, operation_id TEXT REFERENCES nutrition_operations(id))",
    ])


def migration_5(db: sqlite3.Connection) -> None:
    create(db, [
        "CREATE TABLE nutrition_recipes (id TEXT PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE nutrition_recipe_versions (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES nutrition_recipes(id), version_number INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(recipe_id,version_number))",
        "CREATE TABLE nutrition_recipe_ingredients (version_id TEXT NOT NULL REFERENCES nutrition_recipe_versions(id), position INTEGER NOT NULL, food_id TEXT NOT NULL REFERENCES nutrition_foods(id), quantity INTEGER NOT NULL CHECK(quantity>0), optional INTEGER NOT NULL DEFAULT 0, food_snapshot_json TEXT NOT NULL, PRIMARY KEY(version_id,position))",
        "CREATE TABLE nutrition_recipe_steps (version_id TEXT NOT NULL REFERENCES nutrition_recipe_versions(id), position INTEGER NOT NULL, instruction TEXT NOT NULL, PRIMARY KEY(version_id,position))",
    ])


def migration_6(db: sqlite3.Connection) -> None:
    create(db, [
        "CREATE TABLE nutrition_prep_batches (id TEXT PRIMARY KEY, recipe_version_id TEXT NOT NULL REFERENCES nutrition_recipe_versions(id), operation_id TEXT NOT NULL UNIQUE REFERENCES nutrition_operations(id), portions INTEGER NOT NULL CHECK(portions>0), cooked_mass INTEGER CHECK(cooked_mass>0), snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL)",
        "CREATE TABLE nutrition_prepared_portions (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES nutrition_prep_batches(id), lot_id TEXT NOT NULL UNIQUE REFERENCES nutrition_inventory_lots(id))",
        "CREATE TABLE nutrition_food_log_entries (id TEXT PRIMARY KEY, entry_date TEXT NOT NULL, meal TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), unit TEXT NOT NULL, snapshot_json TEXT NOT NULL, operation_id TEXT UNIQUE REFERENCES nutrition_operations(id), voided INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
        "CREATE TABLE nutrition_food_log_nutrients (entry_id TEXT NOT NULL REFERENCES nutrition_food_log_entries(id), nutrient TEXT NOT NULL, value INTEGER NOT NULL CHECK(value>=0), PRIMARY KEY(entry_id,nutrient))",
        "CREATE TABLE nutrition_diary_days (entry_date TEXT PRIMARY KEY, complete INTEGER NOT NULL CHECK(complete IN (0,1)))",
        "CREATE INDEX nutrition_log_date ON nutrition_food_log_entries(entry_date)",
    ])


def migration_7(db: sqlite3.Connection) -> None:
    create(db, [
        "CREATE TABLE nutrition_meal_plan_entries (id TEXT PRIMARY KEY, entry_date TEXT NOT NULL, meal TEXT NOT NULL, recipe_version_id TEXT NOT NULL REFERENCES nutrition_recipe_versions(id), portions INTEGER NOT NULL CHECK(portions>0), status TEXT NOT NULL DEFAULT 'planned', version INTEGER NOT NULL DEFAULT 1)",
        "CREATE INDEX nutrition_plan_date ON nutrition_meal_plan_entries(entry_date)",
        "CREATE TABLE nutrition_inventory_reservations (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES nutrition_meal_plan_entries(id) ON DELETE CASCADE, lot_id TEXT NOT NULL REFERENCES nutrition_inventory_lots(id), quantity INTEGER NOT NULL CHECK(quantity>0))",
        "CREATE TABLE nutrition_shopping_lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE nutrition_shopping_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES nutrition_shopping_lists(id), food_id TEXT NOT NULL REFERENCES nutrition_foods(id), required INTEGER NOT NULL CHECK(required>=0), quantity INTEGER NOT NULL CHECK(quantity>=0), package_size INTEGER CHECK(package_size>0), checked INTEGER NOT NULL DEFAULT 0, received INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, UNIQUE(list_id,food_id))",
        "CREATE TABLE nutrition_shopping_sources (item_id TEXT NOT NULL REFERENCES nutrition_shopping_items(id), plan_id TEXT NOT NULL REFERENCES nutrition_meal_plan_entries(id), PRIMARY KEY(item_id,plan_id))",
    ])


def migration_8(db: sqlite3.Connection) -> None:
    create(db, [
        "CREATE TABLE nutrition_ai_requests (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, tokens_reserved INTEGER NOT NULL, result_json TEXT, error TEXT)",
        "CREATE TABLE nutrition_ai_drafts (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES nutrition_ai_requests(id), proposal_json TEXT NOT NULL, saved_recipe_id TEXT REFERENCES nutrition_recipes(id))",
    ])


def migration_9(db: sqlite3.Connection) -> None:
    db.execute("CREATE TABLE nutrition_prep_schedule (id TEXT PRIMARY KEY, planned_date TEXT NOT NULL, recipe_version_id TEXT NOT NULL REFERENCES nutrition_recipe_versions(id), portions INTEGER NOT NULL CHECK(portions>0), status TEXT NOT NULL DEFAULT 'planned', operation_id TEXT REFERENCES nutrition_operations(id))")
    db.execute('CREATE INDEX nutrition_prep_schedule_date ON nutrition_prep_schedule(planned_date,status)')


def migration_10(db: sqlite3.Connection) -> None:
    db.execute('ALTER TABLE nutrition_nutrition_versions ADD COLUMN metadata_json TEXT')


def migration_11(db: sqlite3.Connection) -> None:
    db.execute('ALTER TABLE nutrition_inventory_lots ADD COLUMN available_on TEXT')
    db.execute('ALTER TABLE nutrition_inventory_transactions ADD COLUMN event_date TEXT')


MIGRATIONS = {4: migration_4, 5: migration_5, 6: migration_6, 7: migration_7, 8: migration_8, 9:migration_9, 10:migration_10, 11:migration_11}
