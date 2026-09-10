-- Lets a task be created without a signed-in staff member behind it, so an
-- automated check (e.g. an out-of-range fridge reading logged from the
-- sign-in-free fridge/freezer checks page) can raise a real, visible urgent
-- task for a department instead of only a silent audit-log entry.
-- SQLite has no ALTER COLUMN, so the table is rebuilt with the same shape
-- minus the NOT NULL on created_by_staff_id.
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  source_message_id TEXT REFERENCES messages(id),
  assigned_department_id TEXT NOT NULL REFERENCES departments(id),
  created_by_staff_id TEXT REFERENCES staff(id),
  completed_by_staff_id TEXT REFERENCES staff(id),
  title TEXT NOT NULL,
  details TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

INSERT INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

PRAGMA optimize;
