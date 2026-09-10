-- Shared operations calendar: visible to every department, not scoped to
-- one. Anyone can add an entry on behalf of any department (picked from a
-- dropdown, not inferred from a session), matching the no-sign-in pattern
-- already used for the checklist and fridge/food-temp checks.
CREATE TABLE wall_planner_entries (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  entry_date TEXT NOT NULL,
  entry_time TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('wedding','banquet','buffet','tea','function')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_wall_planner_entries_hotel_date ON wall_planner_entries(hotel_id, entry_date);

PRAGMA optimize;
