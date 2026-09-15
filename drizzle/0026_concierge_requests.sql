-- Concierge's own board, the one thing every other department already had
-- and Concierge didn't: guest requests that aren't complaints (that's
-- Front of House's Guest Issues) but arrangements to make - a restaurant
-- table, a taxi, tickets, a recommendation, luggage. Same no-PIN, single
-- status lifecycle convention as maintenance tickets (one button always
-- moves it to the next stage, nothing to choose).

CREATE TABLE IF NOT EXISTS concierge_requests (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  room_number TEXT,
  guest_name TEXT,
  request_type TEXT NOT NULL DEFAULT 'other' CHECK(request_type IN ('restaurant','transport','tickets','recommendation','luggage','other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','arranged','confirmed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_concierge_requests_department_status ON concierge_requests(department_id, status, created_at);
