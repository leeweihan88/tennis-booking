-- Profile pictures (256×256 WebP, re-encoded on upload). Idempotent.
CREATE TABLE IF NOT EXISTS avatars (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image      BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Upload log for the per-member daily limit (each upload uses an Images transformation).
CREATE TABLE IF NOT EXISTS photo_uploads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS photo_uploads_user_at ON photo_uploads(user_id, at);
