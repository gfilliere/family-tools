-- "Buy this much instead": a per-card amount that replaces the total computed from recipe lines,
-- for items added by hand or when part of an ingredient is already at home.
-- Keyed by the card key (ingredient id, or ingredient id + name for generic entries).
CREATE TABLE card_buy_overrides (
  card_key TEXT PRIMARY KEY,
  qty REAL NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'piece')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
