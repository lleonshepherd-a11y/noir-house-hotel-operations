-- Individual named manager accounts for Hotel Ping (the mobile app),
-- separate from the dashboard's shared per-department staff PIN login.
-- A manager belongs to one department but is a real named person with
-- their own email+password, mirroring the owner account pattern.

CREATE TABLE managers (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE manager_sessions (
  id TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES managers(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL
);
