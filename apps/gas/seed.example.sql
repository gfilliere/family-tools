-- Template for seeding Tankerkönig station UUIDs into your D1 database.
-- Copy this file to seed.local.sql and fill in your real station UUIDs and labels.
-- seed.local.sql is gitignored so your personal location data is never committed.

INSERT INTO stations (id, label, enabled) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Aral · Example Street 1', 1),
  ('00000000-0000-0000-0000-000000000002', 'Total · Example Road 42', 1)
ON CONFLICT(id) DO UPDATE SET
  label = excluded.label,
  enabled = excluded.enabled;
