-- CSA Tennis schema. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  pw_hash       TEXT NOT NULL,
  pw_salt       TEXT NOT NULL,
  rating        REAL NOT NULL,
  rated_matches INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS login_failures (
  email TEXT NOT NULL,
  at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_email_at ON login_failures(email, at);

-- One row per Monday session, created lazily. date = 'YYYY-MM-DD' (Manila).
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL UNIQUE,
  courts     INTEGER NOT NULL DEFAULT 2,
  cost_cents INTEGER,
  cancelled  INTEGER NOT NULL DEFAULT 0
);

-- guest_name NULL = the member themselves. Order by id decides confirmed vs waitlist.
CREATE TABLE IF NOT EXISTS registrations (
  id         INTEGER PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id),
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_name TEXT,
  paid       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_self
  ON registrations(event_id, user_id) WHERE guest_name IS NULL;
CREATE INDEX IF NOT EXISTS registrations_event ON registrations(event_id, id);

-- Team 1 = recorder (p1) + partner (p2); team 2 = opponents (p3, p4). p2/p4 NULL for singles.
CREATE TABLE IF NOT EXISTS matches (
  id           INTEGER PRIMARY KEY,
  played_on    TEXT NOT NULL,
  p1           INTEGER NOT NULL REFERENCES users(id),
  p2           INTEGER REFERENCES users(id),
  p3           INTEGER NOT NULL REFERENCES users(id),
  p4           INTEGER REFERENCES users(id),
  winner       INTEGER NOT NULL CHECK (winner IN (1, 2)),
  score        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_by INTEGER REFERENCES users(id),
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_status ON matches(status, id);

-- UNIQUE(match_id, user_id) guarantees a match changes ratings at most once.
CREATE TABLE IF NOT EXISTS rating_history (
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  delta      REAL NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (match_id, user_id)
);
