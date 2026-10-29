-- Configurable schedule, per-session times, multiple admins.
-- ALTER TABLE ... ADD COLUMN cannot be made idempotent in SQLite: apply this file ONCE per database.

-- Key/value settings; 'schedule' holds the weekly default as JSON.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Each session keeps its own times (minutes from the session day's midnight, Manila).
-- Defaults are the original schedule: 7:30–9:30 PM, opens 5 days before at 10:00, closes at 12:00.
ALTER TABLE events ADD COLUMN start_min INTEGER NOT NULL DEFAULT 1170;
ALTER TABLE events ADD COLUMN end_min INTEGER NOT NULL DEFAULT 1290;
ALTER TABLE events ADD COLUMN opens_offset INTEGER NOT NULL DEFAULT -6600;
ALTER TABLE events ADD COLUMN closes_offset INTEGER NOT NULL DEFAULT 720;

-- Extra admins (the ADMIN_EMAIL account is always the owner and admin).
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
