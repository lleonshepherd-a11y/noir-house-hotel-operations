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
    client_message_id TEXT,
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
  `CREATE TABLE IF NOT EXISTS conversation_watchers (
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    staff_id TEXT NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY(conversation_id, staff_id)
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_participation (
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    staff_id TEXT NOT NULL REFERENCES staff(id),
    joined_at TEXT NOT NULL,
    left_at TEXT,
    PRIMARY KEY(conversation_id, staff_id, joined_at)
  )`,
  `CREATE TABLE IF NOT EXISTS management_decisions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    requested_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    decided_by_staff_id TEXT REFERENCES staff(id),
    category TEXT NOT NULL CHECK(category IN ('guest_refund','room_upgrade','table_allocation','overtime','emergency_maintenance','other')),
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','approved','declined','more_information','resolved')),
    decision_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS planner_entries (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    department_id TEXT REFERENCES departments(id),
    conversation_id TEXT REFERENCES conversations(id),
    created_by_staff_id TEXT NOT NULL REFERENCES staff(id),
    title TEXT NOT NULL,
    details TEXT,
    category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('urgent','important','information','completed','general')),
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS operational_statuses (
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
  )`,
  `CREATE TABLE IF NOT EXISTS message_deliveries (
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
  )`,
  `CREATE TABLE IF NOT EXISTS realtime_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id TEXT NOT NULL REFERENCES hotels(id),
    department_id TEXT REFERENCES departments(id),
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS urgent_escalations (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    recipient_department_id TEXT NOT NULL REFERENCES departments(id),
    escalation_department_id TEXT NOT NULL REFERENCES departments(id),
    due_at TEXT NOT NULL,
    escalated_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(message_id, recipient_department_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sender_client_id ON messages(sender_staff_id, client_message_id) WHERE client_message_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_department_viewed ON message_receipts(department_id, viewed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_department_status ON tasks(assigned_department_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_pins_department_active ON department_pins(department_id, active, position)`,
  `CREATE INDEX IF NOT EXISTS idx_handovers_department_date ON shift_handovers(department_id, shift_date)`,
  `CREATE INDEX IF NOT EXISTS idx_guest_requests_hotel_status ON guest_requests(hotel_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_hotel_created ON audit_events(hotel_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_watchers_staff ON conversation_watchers(staff_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_decisions_status ON management_decisions(status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_planner_hotel_start ON planner_entries(hotel_id, starts_at)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_statuses_board ON operational_statuses(hotel_id, department_id, board_type, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_message_deliveries_department_state ON message_deliveries(department_id, state, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_realtime_events_department_sequence ON realtime_events(hotel_id, department_id, sequence)`,
  `CREATE INDEX IF NOT EXISTS idx_urgent_escalations_due ON urgent_escalations(due_at, escalated_at, cancelled_at)`,
] as const;

export async function ensureSchema(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.prepare('PRAGMA optimize').run();
}
