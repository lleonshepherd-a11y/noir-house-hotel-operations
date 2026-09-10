-- Tracks which (entry, days-before) reminders have already been sent, so
-- the cron job that runs every 5 minutes never raises the same "wedding in
-- 3 days" task twice.
CREATE TABLE wall_planner_reminder_log (
  entry_id TEXT NOT NULL REFERENCES wall_planner_entries(id),
  offset_days INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, offset_days)
);

PRAGMA optimize;
