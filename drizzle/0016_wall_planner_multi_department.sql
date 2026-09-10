-- Lets one calendar entry involve several departments (e.g. a buffet that
-- needs Kitchen, Restaurant and Conference all in on it) instead of just
-- one, so every department involved gets its own reminder rather than only
-- whoever happened to be in the dropdown when it was first added.
CREATE TABLE wall_planner_entry_departments (
  entry_id TEXT NOT NULL REFERENCES wall_planner_entries(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  PRIMARY KEY (entry_id, department_id)
);

INSERT INTO wall_planner_entry_departments (entry_id, department_id)
SELECT id, department_id FROM wall_planner_entries;

CREATE INDEX idx_wall_planner_entry_departments_department ON wall_planner_entry_departments(department_id);

-- Rebuild wall_planner_entries without the single department_id column
-- (SQLite has no ALTER to drop a column with a foreign key on it).
CREATE TABLE wall_planner_entries_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  entry_date TEXT NOT NULL,
  entry_time TEXT NOT NULL,
  title TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES wall_planner_categories(id),
  created_at TEXT NOT NULL
);

INSERT INTO wall_planner_entries_new (id, hotel_id, entry_date, entry_time, title, category_id, created_at)
SELECT id, hotel_id, entry_date, entry_time, title, category_id, created_at FROM wall_planner_entries;

DROP TABLE wall_planner_entries;
ALTER TABLE wall_planner_entries_new RENAME TO wall_planner_entries;
CREATE INDEX idx_wall_planner_entries_hotel_date ON wall_planner_entries(hotel_id, entry_date);

PRAGMA optimize;
