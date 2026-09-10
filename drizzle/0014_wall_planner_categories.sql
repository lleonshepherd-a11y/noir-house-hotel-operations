-- Makes the operations calendar's event types (Wedding, Banquet, ...) a
-- real, editable list instead of a fixed set baked into a CHECK constraint,
-- so any department can add, rename, recolour or remove a type. Existing
-- types are seeded here with their current colours so nothing changes
-- visually for anyone until someone edits the list.
CREATE TABLE wall_planner_categories (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

INSERT INTO wall_planner_categories (id, hotel_id, label, color, position, active, created_at)
SELECT 'wedding', id, 'Wedding', '#d1488a', 0, 1, datetime('now') FROM hotels
UNION ALL SELECT 'banquet', id, 'Banquet', '#b8860f', 1, 1, datetime('now') FROM hotels
UNION ALL SELECT 'buffet', id, 'Buffet', '#1a9c68', 2, 1, datetime('now') FROM hotels
UNION ALL SELECT 'tea', id, 'Afternoon tea', '#7266ea', 3, 1, datetime('now') FROM hotels
UNION ALL SELECT 'function', id, 'Function', '#2f6fd1', 4, 1, datetime('now') FROM hotels;

-- Rebuild wall_planner_entries to point at a category row instead of a
-- fixed enum string (SQLite has no ALTER to drop a CHECK constraint).
CREATE TABLE wall_planner_entries_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  entry_date TEXT NOT NULL,
  entry_time TEXT NOT NULL,
  title TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES wall_planner_categories(id),
  created_at TEXT NOT NULL
);

INSERT INTO wall_planner_entries_new (id, hotel_id, department_id, entry_date, entry_time, title, category_id, created_at)
SELECT id, hotel_id, department_id, entry_date, entry_time, title, category, created_at FROM wall_planner_entries;

DROP TABLE wall_planner_entries;
ALTER TABLE wall_planner_entries_new RENAME TO wall_planner_entries;
CREATE INDEX idx_wall_planner_entries_hotel_date ON wall_planner_entries(hotel_id, entry_date);

PRAGMA optimize;
