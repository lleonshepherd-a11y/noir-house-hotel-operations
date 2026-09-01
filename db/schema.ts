export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS hotels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Europe/London',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(hotel_id, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('staff','supervisor','front_of_house','duty_manager','general_manager','admin')),
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS staff_sessions (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL REFERENCES staff(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    kind TEXT NOT NULL CHECK(kind IN ('department','direct','guest_request','approval')),
    subject TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','archived')),
    created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_departments (
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    PRIMARY KEY(conversation_id, department_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    sender_staff_id TEXT NOT NULL REFERENCES staff(id),
    body TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent','emergency')),
    message_type TEXT NOT NULL DEFAULT 'message' CHECK(message_type IN ('message','request','approval','decision','completion')),
    reply_to_message_id TEXT REFERENCES messages(id),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS message_receipts (
    message_id TEXT NOT NULL REFERENCES messages(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    delivered_at TEXT,
    viewed_at TEXT,
    acknowledged_at TEXT,
    dismissed_at TEXT,
    acted_by_staff_id TEXT REFERENCES staff(id),
    PRIMARY KEY(message_id, department_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    source_message_id TEXT REFERENCES messages(id),
    assigned_department_id TEXT NOT NULL REFERENCES departments(id),
    created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    completed_by_staff_id TEXT REFERENCES staff(id),
    title TEXT NOT NULL,
    details TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
    due_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS department_pins (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL REFERENCES departments(id),
    created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    body TEXT NOT NULL,
    position INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    archived_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    body TEXT NOT NULL,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    archived_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS shift_handovers (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL REFERENCES departments(id),
    created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    body TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    acknowledged_by_staff_id TEXT REFERENCES staff(id),
    acknowledged_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guest_requests (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    assigned_department_id TEXT REFERENCES departments(id),
    guest_reference TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','archived')),
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    uploaded_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    message_id TEXT REFERENCES messages(id),
    task_id TEXT REFERENCES tasks(id),
    guest_request_id TEXT REFERENCES guest_requests(id),
    object_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    actor_staff_id TEXT REFERENCES staff(id),
    actor_department_id TEXT REFERENCES departments(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    previous_event_hash TEXT,
    event_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_department_viewed ON message_receipts(department_id, viewed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_department_status ON tasks(assigned_department_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_pins_department_active ON department_pins(department_id, active, position)`,
  `CREATE INDEX IF NOT EXISTS idx_handovers_department_date ON shift_handovers(department_id, shift_date)`,
  `CREATE INDEX IF NOT EXISTS idx_guest_requests_hotel_status ON guest_requests(hotel_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_hotel_created ON audit_events(hotel_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, created_at)`,
] as const;

export async function ensureSchema(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.prepare('PRAGMA optimize').run();
}
