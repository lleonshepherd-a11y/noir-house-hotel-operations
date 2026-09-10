-- Lets a hotel set itself up without anyone hand-running SQL: an owner
-- signs up (which creates the hotel in the same step), then adds
-- departments and staff PINs from their own admin session. This is a
-- separate identity from staff PIN sessions - an owner authenticates with
-- an email and a real password, not a shared 4-8 digit department PIN.
CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE owner_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE hotels ADD COLUMN owner_id TEXT REFERENCES owners(id);

PRAGMA optimize;
