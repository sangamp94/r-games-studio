-- You do NOT need to run this manually: the API creates these tables automatically
-- on the first request. It is here only for reference (SQLite / Turso syntax).

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'owner')),
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Only one owner account can ever exist
CREATE UNIQUE INDEX IF NOT EXISTS one_owner_only ON users (role) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  ip         TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at);
