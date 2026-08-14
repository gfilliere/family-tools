-- Template for seeding the initial administrator account into your D1 database.
-- Copy this file to seed.local.sql and replace the example email and display name
-- with your real Cloudflare Access email.
-- seed.local.sql is gitignored so personal identity data is never committed.

INSERT INTO users (email, display_name, is_admin) VALUES
  ('admin@example.com', 'Admin', 1)
ON CONFLICT(email) DO UPDATE SET
  display_name = excluded.display_name,
  is_admin = excluded.is_admin;
