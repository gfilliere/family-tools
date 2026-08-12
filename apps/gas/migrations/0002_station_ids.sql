-- Add enabled flag to stations table so database is the single source of truth for polled stations
ALTER TABLE stations ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
