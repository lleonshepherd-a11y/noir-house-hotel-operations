-- Automated alerts (a wall-planner reminder, an out-of-range fridge
-- reading) have no staff session to attribute a message to, so they've
-- only ever been able to raise a plain task, invisible to anything that
-- reads real messages/conversations (including, eventually, Hotel Ping).
-- Rebuilding both tables (SQLite can't just drop a NOT NULL constraint)
-- with a nullable sender plus a sender_label for the automated case.
-- Both tables are empty in production at the time of this migration.

CREATE TABLE conversations_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  kind TEXT NOT NULL CHECK(kind IN ('department','direct','guest_request','approval','system')),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','archived')),
  created_by_staff_id TEXT REFERENCES staff(id),
  created_by_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (created_by_staff_id IS NOT NULL OR created_by_label IS NOT NULL)
);
INSERT INTO conversations_new (id, hotel_id, kind, subject, status, created_by_staff_id, created_at, updated_at)
  SELECT id, hotel_id, kind, subject, status, created_by_staff_id, created_at, updated_at FROM conversations;
DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

CREATE TABLE messages_new (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_staff_id TEXT REFERENCES staff(id),
  sender_label TEXT,
  body TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent','emergency')),
  message_type TEXT NOT NULL DEFAULT 'message' CHECK(message_type IN ('message','request','approval','decision','completion')),
  reply_to_message_id TEXT REFERENCES messages(id),
  created_at TEXT NOT NULL,
  client_message_id TEXT,
  CHECK (sender_staff_id IS NOT NULL OR sender_label IS NOT NULL)
);
INSERT INTO messages_new (id, conversation_id, sender_staff_id, body, urgency, message_type, reply_to_message_id, created_at, client_message_id)
  SELECT id, conversation_id, sender_staff_id, body, urgency, message_type, reply_to_message_id, created_at, client_message_id FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
