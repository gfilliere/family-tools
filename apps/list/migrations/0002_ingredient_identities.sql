ALTER TABLE items ADD COLUMN canonical_name TEXT;

UPDATE items SET canonical_name = lower(trim(name)) WHERE canonical_name IS NULL;

CREATE TABLE ingredient_aliases (
  alias_normalised TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX items_open_identity ON items(checked_at, canonical_name, unit);

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

UPDATE items
SET canonical_name = (
  SELECT canonical_name
  FROM ingredient_aliases
  WHERE alias_normalised = lower(trim(items.name))
)
WHERE EXISTS (
  SELECT 1
  FROM ingredient_aliases
  WHERE alias_normalised = lower(trim(items.name))
);
