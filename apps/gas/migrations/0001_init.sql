-- One row per station per poll. Small enough that we never prune it:
-- 3 stations x 24 polls x 365 days is about 26k rows a year.
CREATE TABLE IF NOT EXISTS readings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT    NOT NULL,
  e10        REAL    NOT NULL,
  observed_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS readings_station_time
  ON readings (station_id, observed_at DESC);

-- Labels live in the database rather than in config so you can rename a
-- station without redeploying.
CREATE TABLE IF NOT EXISTS stations (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
