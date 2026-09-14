-- Maintenance tickets need a department (this dashboard is multi-
-- department, unlike Hotel Ping's original single-department-per-hotel
-- assumption), and created_by_staff_id needs to be nullable - a ticket
-- can be raised from the department's own page with no staff PIN
-- session, same as fridge readings and guest requests already are.
-- Empty table, safe to rebuild.

ALTER TABLE maintenance_tickets ADD COLUMN department_id TEXT REFERENCES departments(id);

CREATE TABLE maintenance_tickets_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT REFERENCES departments(id),
  room_number TEXT,
  description TEXT NOT NULL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','in_progress','fixed')),
  priority TEXT NOT NULL DEFAULT 'problem',
  guest_present INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  created_by_staff_id TEXT REFERENCES staff(id),
  owner_staff_id TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
INSERT INTO maintenance_tickets_new SELECT id, hotel_id, department_id, room_number, description, photo_path, status, priority, guest_present, deadline, created_by_staff_id, owner_staff_id, created_at, updated_at, resolved_at FROM maintenance_tickets;
DROP TABLE maintenance_tickets;
ALTER TABLE maintenance_tickets_new RENAME TO maintenance_tickets;
