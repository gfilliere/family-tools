PRAGMA foreign_keys = ON;

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  instructions_md TEXT,
  cook_minutes INTEGER,
  servings INTEGER,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  source_url TEXT,
  image_url TEXT,
  notes TEXT,
  last_cooked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  qty REAL,
  unit TEXT CHECK (unit IN ('g', 'ml', 'tsp', 'tbsp') OR unit IS NULL),
  original TEXT NOT NULL CHECK (length(trim(original)) > 0),
  conversion_note TEXT
);

CREATE TABLE tags (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);

CREATE TABLE ingredient_facts (
  name_normalised TEXT PRIMARY KEY,
  aisle TEXT,
  grams_per_cup REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX recipes_last_cooked ON recipes(last_cooked_at);
CREATE INDEX ingredients_recipe ON ingredients(recipe_id, position);
CREATE INDEX tags_tag ON tags(tag);

INSERT OR IGNORE INTO ingredient_facts(name_normalised, aisle, grams_per_cup) VALUES
  ('flour', 'Pantry', 120), ('all-purpose flour', 'Pantry', 120),
  ('sugar', 'Pantry', 200), ('brown sugar', 'Pantry', 220),
  ('butter', 'Dairy & Eggs', 227), ('cocoa', 'Pantry', 85);
