-- Fridge/freezer units are staff-managed (added and removed from the
-- checks page itself), so the list lives in the database rather than a
-- fixed catalog like the daily checklist. Soft-deleted (active flag) so a
-- removed unit's past readings stay intact for inspection history.
CREATE TABLE fridge_units (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('fridge','freezer')),
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_fridge_units_department_active
ON fridge_units(department_id, active, position);

-- Append-only: every reading is kept for inspections, nothing overwritten.
CREATE TABLE fridge_readings (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  unit_id TEXT NOT NULL REFERENCES fridge_units(id),
  reading_c REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('in_range','above_range','below_range')),
  corrective_action TEXT,
  reading_date TEXT NOT NULL,
  logged_at TEXT NOT NULL
);

CREATE INDEX idx_fridge_readings_unit_date
ON fridge_readings(unit_id, reading_date, logged_at);

CREATE INDEX idx_fridge_readings_department_date
ON fridge_readings(department_id, reading_date);

PRAGMA optimize;
