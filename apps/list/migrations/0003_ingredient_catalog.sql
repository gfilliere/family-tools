-- Items keep one row per source line. Identity comes from the shared ingredient catalog
-- (@family-tools/pantry); aggregation happens when the list is read, never on insert.
ALTER TABLE items ADD COLUMN ingredient_id TEXT;
ALTER TABLE items ADD COLUMN display_name TEXT;
ALTER TABLE items ADD COLUMN original TEXT;
ALTER TABLE items ADD COLUMN base_qty REAL;
ALTER TABLE items ADD COLUMN base_unit TEXT CHECK (base_unit IN ('g', 'ml', 'piece') OR base_unit IS NULL);
ALTER TABLE items ADD COLUMN flags TEXT;

-- Corrections made in the list UI. Checked before the built-in catalog.
CREATE TABLE learned_aliases (
  alias_normalised TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-ingredient overrides: "we buy tofu in the produce aisle", "soy sauce is not a staple here".
CREATE TABLE ingredient_overrides (
  ingredient_id TEXT PRIMARY KEY,
  aisle TEXT,
  staple INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ingredients the catalog does not know, created by a model or by hand. Ids are prefixed "custom:".
CREATE TABLE custom_ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aisle TEXT NOT NULL,
  measure TEXT NOT NULL CHECK (measure IN ('g', 'ml', 'piece')),
  density REAL,
  piece_grams REAL,
  piece_unit TEXT,
  staple INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX items_open_ingredient ON items(checked_at, ingredient_id);

-- ingredient_aisles and ingredient_aliases are no longer read. They stay for now because the
-- deploy applies migrations before the new Worker is live; drop them in a later migration.
