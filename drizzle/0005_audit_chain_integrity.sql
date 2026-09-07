-- Prevents the audit hash chain from forking under concurrent writes: two
-- events for the same hotel can no longer chain onto the same previous
-- hash. appendAuditEvent() retries on the resulting conflict.
CREATE UNIQUE INDEX idx_audit_events_hotel_previous_hash
ON audit_events(hotel_id, previous_event_hash);

PRAGMA optimize;
