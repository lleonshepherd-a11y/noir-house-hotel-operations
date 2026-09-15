-- Shift start/end tracking, one department at a time: the Handover card
-- already asks "who's on now and what do they need to know", and this
-- answers the other half, "is anyone actually on shift right now, and
-- since when". No PIN needed to raise one (same convention as every
-- other department board), an append-only log rather than one row that
-- gets overwritten, so the history of a day's shift changes is never lost.

CREATE TABLE IF NOT EXISTS shift_events (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  event TEXT NOT NULL CHECK(event IN ('start','end')),
  shift_label TEXT,
  staff_label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_events_department_created ON shift_events(department_id, created_at);
