ALTER TABLE messages ADD COLUMN client_message_id TEXT;

CREATE UNIQUE INDEX idx_messages_sender_client_id
ON messages(sender_staff_id, client_message_id)
WHERE client_message_id IS NOT NULL;

CREATE TABLE message_deliveries (
  message_id TEXT NOT NULL REFERENCES messages(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(message_id, department_id)
);

CREATE TABLE realtime_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT REFERENCES departments(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE urgent_escalations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  recipient_department_id TEXT NOT NULL REFERENCES departments(id),
  escalation_department_id TEXT NOT NULL REFERENCES departments(id),
  due_at TEXT NOT NULL,
  escalated_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(message_id, recipient_department_id)
);

CREATE INDEX idx_message_deliveries_department_state
ON message_deliveries(department_id, state, created_at);

CREATE INDEX idx_realtime_events_department_sequence
ON realtime_events(hotel_id, department_id, sequence);

CREATE INDEX idx_urgent_escalations_due
ON urgent_escalations(due_at, escalated_at, cancelled_at);

PRAGMA optimize;
