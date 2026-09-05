import { appendAuditEvent } from './audit';
import { createSessionToken, hashToken, verifyPin } from './security';
import type { StaffIdentity, StaffRole } from './types';

const SESSION_MINUTES = 30;

interface StaffRow {
  id: string;
  hotel_id: string;
  department_id: string;
  role: StaffRole;
  pin_hash: string;
  pin_salt: string;
  active: number;
}

export async function startStaffSession(db: D1Database, staffId: string, pin: string) {
  const staff = await db
    .prepare('SELECT id, hotel_id, department_id, role, pin_hash, pin_salt, active FROM staff WHERE id = ?')
    .bind(staffId)
    .first<StaffRow>();
  if (!staff || !staff.active || !(await verifyPin(pin, staff.pin_hash, staff.pin_salt))) {
    throw new Response('Invalid staff member or PIN', { status: 401 });
  }

  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  await db
    .prepare(`INSERT INTO staff_sessions
      (id, staff_id, department_id, token_hash, expires_at, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, staff.id, staff.department_id, tokenHash, expiresAt, now.toISOString(), now.toISOString())
    .run();
  await appendAuditEvent(db, {
    hotelId: staff.hotel_id,
    actorStaffId: staff.id,
    actorDepartmentId: staff.department_id,
    action: 'session.started',
    entityType: 'staff_session',
    entityId: id,
  });
  return { token, expiresAt, identity: toIdentity(staff) };
}

export async function startDepartmentSession(db: D1Database, departmentName: string, pin: string) {
  const staff = await db.prepare(`SELECT s.id FROM staff s
    JOIN departments d ON d.id = s.department_id
    WHERE lower(d.name) = lower(?) AND s.active = 1
    ORDER BY s.created_at ASC LIMIT 1`).bind(departmentName).first<{ id: string }>();
  if (!staff) throw new Response('This department account has not been provisioned', { status: 401 });
  return startStaffSession(db, staff.id, pin);
}

export async function requireStaffSession(db: D1Database, token: string | null): Promise<StaffIdentity> {
  if (!token) throw new Response('Staff PIN session required', { status: 401 });
  const tokenHash = await hashToken(token);
  const row = await db
    .prepare(`SELECT s.id, s.hotel_id, ss.department_id, s.role, ss.id AS session_id
      FROM staff_sessions ss
      JOIN staff s ON s.id = ss.staff_id
      WHERE ss.token_hash = ? AND ss.ended_at IS NULL AND ss.expires_at > ? AND s.active = 1`)
    .bind(tokenHash, new Date().toISOString())
    .first<StaffRow & { session_id: string }>();
  if (!row) throw new Response('Staff PIN session has expired', { status: 401 });
  await db.prepare('UPDATE staff_sessions SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), row.session_id).run();
  return toIdentity(row);
}

export async function endStaffSession(db: D1Database, token: string) {
  const tokenHash = await hashToken(token);
  await db
    .prepare('UPDATE staff_sessions SET ended_at = ? WHERE token_hash = ? AND ended_at IS NULL')
    .bind(new Date().toISOString(), tokenHash)
    .run();
}

function toIdentity(staff: StaffRow): StaffIdentity {
  return {
    staffId: staff.id,
    hotelId: staff.hotel_id,
    departmentId: staff.department_id,
    role: staff.role,
  };
}
