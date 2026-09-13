-- Every catalog attribute can be corrected at runtime from the list UI.
-- NULL means "use the built-in value".
ALTER TABLE ingredient_overrides ADD COLUMN name TEXT;
ALTER TABLE ingredient_overrides ADD COLUMN measure TEXT CHECK (measure IN ('g', 'ml', 'piece') OR measure IS NULL);
ALTER TABLE ingredient_overrides ADD COLUMN density REAL;
ALTER TABLE ingredient_overrides ADD COLUMN piece_grams REAL;
ALTER TABLE ingredient_overrides ADD COLUMN piece_unit TEXT;
