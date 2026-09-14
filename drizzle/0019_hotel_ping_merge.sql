-- Tables Hotel Ping needs that don't exist here yet, added ahead of
-- pointing its Worker at this database. Follows this schema's own
-- conventions (TEXT ids, hotel_id scoping, REFERENCES departments/staff)
-- rather than copying Hotel Ping's single-tenant shapes verbatim, since
-- everything here is already multi-hotel.

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE typing_status (
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  from_department_id TEXT NOT NULL REFERENCES departments(id),
  to_department_id TEXT NOT NULL REFERENCES departments(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_department_id, to_department_id)
);

CREATE TABLE muted_conversations (
  department_id TEXT NOT NULL REFERENCES departments(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  muted_at TEXT NOT NULL,
  PRIMARY KEY (department_id, conversation_id)
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  name TEXT NOT NULL,
  description TEXT,
  event_date TEXT,
  guest_count INTEGER,
  location TEXT,
  created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, department_id)
);

CREATE TABLE group_reads (
  group_id TEXT NOT NULL REFERENCES groups(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (group_id, department_id)
);

-- An event's staffing plan (who's covering what) and its run of timed
-- items - both scoped to a group (the event itself), same idea as Hotel
-- Ping's event_stations/event_runsheet_items.
CREATE TABLE event_stations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  icon TEXT,
  assigned_department_id TEXT REFERENCES departments(id),
  confirmed_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE event_runsheet_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  time_label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  team_label TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE maintenance_tickets (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  room_number TEXT,
  description TEXT NOT NULL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','in_progress','fixed')),
  priority TEXT NOT NULL DEFAULT 'problem',
  guest_present INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  owner_staff_id TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE maintenance_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES maintenance_tickets(id),
  from_department_id TEXT NOT NULL REFERENCES departments(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE quick_replies (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  text TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  staff_name TEXT,
  photo_path TEXT NOT NULL,
  caption TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE story_views (
  story_id TEXT NOT NULL REFERENCES stories(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (story_id, department_id)
);

CREATE TABLE asset_requests (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id),
  item_name TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','borrowed','returned')),
  requested_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  returned_at TEXT
);

CREATE TABLE blockers (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  waiting_on TEXT NOT NULL,
  reason TEXT,
  created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
