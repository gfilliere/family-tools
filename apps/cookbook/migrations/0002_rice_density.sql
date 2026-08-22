-- Dry rice is commonly measured by volume on US recipe sites. Keep specific
-- aliases so a cup converts to a kitchen-useful weight without a model call.
INSERT OR REPLACE INTO ingredient_facts(name_normalised, aisle, grams_per_cup, updated_at) VALUES
  ('uncooked short-grain white rice', 'Pantry', 200, datetime('now')),
  ('short-grain white rice', 'Pantry', 200, datetime('now')),
  ('uncooked white rice', 'Pantry', 190, datetime('now'));
