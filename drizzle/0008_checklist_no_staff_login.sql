-- The checklist is meant to be tapped straight from the dashboard, without a
-- staff PIN sign-in gate first, so completion can no longer be tied to a
-- specific staff_sessions identity. The table was created but never written
-- to (writes required a session nobody had), so it is safe to recreate here
-- rather than migrate data.
DROP TABLE IF EXISTS checklist_completions;

CREATE TABLE checklist_completions (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  item_key TEXT NOT NULL,
  checklist_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE(department_id, item_key, checklist_date)
);

CREATE INDEX idx_checklist_completions_department_date
ON checklist_completions(department_id, checklist_date);

PRAGMA optimize;
