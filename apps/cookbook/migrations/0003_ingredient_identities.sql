ALTER TABLE ingredients ADD COLUMN canonical_name TEXT;

CREATE TABLE ingredient_aliases (
  alias_normalised TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ingredients_canonical_name ON ingredients(canonical_name);

INSERT OR IGNORE INTO ingredient_aliases(alias_normalised, canonical_name) VALUES
  ('apple', 'apple'), ('apfel', 'apple'), ('äpfel', 'apple'),
  ('beef', 'beef'), ('rindfleisch', 'beef'),
  ('bread', 'bread'), ('brot', 'bread'),
  ('butter', 'butter'),
  ('carrot', 'carrot'), ('karotte', 'carrot'), ('karotten', 'carrot'), ('möhre', 'carrot'), ('möhren', 'carrot'),
  ('cheese', 'cheese'), ('käse', 'cheese'),
  ('chicken', 'chicken'), ('hähnchen', 'chicken'), ('hühnerfleisch', 'chicken'),
  ('cream', 'cream'), ('sahne', 'cream'),
  ('egg', 'egg'), ('ei', 'egg'), ('eier', 'egg'),
  ('flour', 'flour'), ('mehl', 'flour'),
  ('garlic', 'garlic'), ('knoblauch', 'garlic'),
  ('lemon', 'lemon'), ('zitrone', 'lemon'), ('zitronen', 'lemon'),
  ('milk', 'milk'), ('milch', 'milk'),
  ('oil', 'oil'), ('öl', 'oil'),
  ('onion', 'onion'), ('zwiebel', 'onion'), ('zwiebeln', 'onion'),
  ('pepper', 'pepper'), ('pfeffer', 'pepper'),
  ('potato', 'potato'), ('kartoffel', 'potato'), ('kartoffeln', 'potato'),
  ('rice', 'rice'), ('reis', 'rice'),
  ('salt', 'salt'), ('salz', 'salt'),
  ('sugar', 'sugar'), ('zucker', 'sugar'),
  ('tomato', 'tomato'), ('tomate', 'tomato'), ('tomaten', 'tomato'),
  ('water', 'water'), ('wasser', 'water');

INSERT OR IGNORE INTO ingredient_facts(name_normalised, aisle, grams_per_cup) VALUES
  ('mehl', 'Pantry', 120), ('zucker', 'Pantry', 200),
  ('butter', 'Dairy & Eggs', 227), ('kakao', 'Pantry', 85),
  ('milch', 'Dairy & Eggs', NULL), ('ei', 'Dairy & Eggs', NULL), ('eier', 'Dairy & Eggs', NULL),
  ('zwiebel', 'Produce', NULL), ('zwiebeln', 'Produce', NULL),
  ('knoblauch', 'Produce', NULL), ('kartoffel', 'Produce', NULL), ('kartoffeln', 'Produce', NULL),
  ('tomate', 'Produce', NULL), ('tomaten', 'Produce', NULL),
  ('salz', 'Spices', NULL), ('pfeffer', 'Spices', NULL), ('öl', 'Pantry', NULL), ('reis', 'Pantry', NULL);
