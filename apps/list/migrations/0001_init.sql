CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  aisle TEXT,
  checked_at TEXT,
  source_kind TEXT CHECK (source_kind IN ('manual', 'recipe')),
  source_id INTEGER,
  source_title TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  added_by TEXT
);

CREATE TABLE ingredient_aisles (
  name_normalised TEXT PRIMARY KEY,
  aisle TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX items_open ON items(checked_at, aisle, added_at);

INSERT OR IGNORE INTO ingredient_aisles(name_normalised, aisle) VALUES
  ('milk', 'Dairy & Eggs'), ('egg', 'Dairy & Eggs'), ('butter', 'Dairy & Eggs'),
  ('bread', 'Bakery'), ('flour', 'Pantry'), ('sugar', 'Pantry'),
  ('onion', 'Produce'), ('apple', 'Produce'), ('banana', 'Produce'),
  ('chicken', 'Meat & Seafood'), ('beef', 'Meat & Seafood');
