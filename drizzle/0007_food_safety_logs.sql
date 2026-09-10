CREATE TABLE food_temperature_logs (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  check_type TEXT NOT NULL CHECK(check_type IN ('cooking','hot_holding','cold_display','delivery_chilled','delivery_frozen')),
  item_name TEXT NOT NULL,
  supplier TEXT,
  reading_c REAL NOT NULL,
  in_range INTEGER NOT NULL,
  packaging_ok INTEGER,
  use_by_ok INTEGER,
  quantity_ok INTEGER,
  corrective_action TEXT,
  logged_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  logged_at TEXT NOT NULL
);

CREATE INDEX idx_food_temperature_logs_department_logged
ON food_temperature_logs(department_id, logged_at);

PRAGMA optimize;
