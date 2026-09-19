CREATE TABLE checklist_completions (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  item_key TEXT NOT NULL,
  checklist_date TEXT NOT NULL,
  completed_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  completed_at TEXT NOT NULL,
  UNIQUE(department_id, item_key, checklist_date)
);

CREATE INDEX idx_checklist_completions_department_date
ON checklist_completions(department_id, checklist_date);

PRAGMA optimize;
