-- Connects the ops calendar to Hotel Ping's event/group feature: an
-- entry (a wedding, say) becomes a real group with the same departments
-- as members and a shared conversation thread, instead of the calendar
-- entry and the event team being two disconnected things.

ALTER TABLE wall_planner_entries ADD COLUMN group_id TEXT REFERENCES groups(id);

-- groups.created_by_staff_id was NOT NULL, but a calendar entry can be
-- added with no staff session (same gap as conversations/messages had) -
-- same nullable-plus-label fix. Empty table, safe to rebuild.
CREATE TABLE groups_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  name TEXT NOT NULL,
  description TEXT,
  event_date TEXT,
  guest_count INTEGER,
  location TEXT,
  created_by_staff_id TEXT REFERENCES staff(id),
  created_by_label TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  CHECK (created_by_staff_id IS NOT NULL OR created_by_label IS NOT NULL)
);
INSERT INTO groups_new SELECT id, hotel_id, name, description, event_date, guest_count, location, created_by_staff_id, NULL, created_at, archived_at, deleted_at FROM groups;
DROP TABLE groups;
ALTER TABLE groups_new RENAME TO groups;

-- 'group' added to conversations.kind for an event team's shared thread,
-- distinct from a plain department-to-department one. Still empty, safe
-- to rebuild.
CREATE TABLE conversations_new (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  kind TEXT NOT NULL CHECK(kind IN ('department','direct','guest_request','approval','system','group')),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','archived')),
  created_by_staff_id TEXT REFERENCES staff(id),
  created_by_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id),
  CHECK (created_by_staff_id IS NOT NULL OR created_by_label IS NOT NULL)
);
INSERT INTO conversations_new (id, hotel_id, kind, subject, status, created_by_staff_id, created_by_label, created_at, updated_at)
  SELECT id, hotel_id, kind, subject, status, created_by_staff_id, created_by_label, created_at, updated_at FROM conversations;
DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;
