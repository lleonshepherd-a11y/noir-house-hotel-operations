CREATE TABLE operational_statuses (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  board_type TEXT NOT NULL CHECK(board_type IN ('housekeeping_room','restaurant_table')),
  item_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','away')),
  changed_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(hotel_id, department_id, board_type, item_number)
);

CREATE INDEX idx_operational_statuses_board
ON operational_statuses(hotel_id, department_id, board_type, updated_at);

PRAGMA optimize;
