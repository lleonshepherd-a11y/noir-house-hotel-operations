-- One-tap approval flow: a staff member raises a request from their own
-- department board (no PIN needed, same as maintenance tickets / fridge
-- readings / guest requests), it lands in the General Manager's Action
-- Required list, and a single tap approves or declines it. The decision
-- is written once (the UPDATE only succeeds while status is still
-- 'pending') and is additionally recorded in the existing tamper-evident
-- audit_events hash chain, so a decision can't be silently changed later
-- even though nothing here required a PIN session.

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  requested_by_label TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
  decided_by_label TEXT,
  decision_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_hotel_status ON approval_requests(hotel_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_department_created ON approval_requests(department_id, created_at);
