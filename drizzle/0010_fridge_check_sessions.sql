-- Kitchen does two checks a day (morning and afternoon), each tracked and
-- completed separately rather than one reading overwriting the day's status.
ALTER TABLE fridge_readings ADD COLUMN session TEXT NOT NULL DEFAULT 'morning';

CREATE INDEX idx_fridge_readings_unit_date_session
ON fridge_readings(unit_id, reading_date, session, logged_at);

PRAGMA optimize;
