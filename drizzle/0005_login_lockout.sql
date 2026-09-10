CREATE TABLE login_failures (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_login_failures_identifier_created
ON login_failures(identifier, created_at);
