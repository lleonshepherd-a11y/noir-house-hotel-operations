import { appendAuditEvent } from './audit';
import { createSessionToken, hashToken, verifyPin } from './security';
import type { StaffIdentity, StaffRole } from './types';

// Department consoles stay signed in on a shared screen for a whole shift (or
// longer) rather than a personal account timing out after a short idle gap,
// so this is deliberately long rather than a typical 30-minute session. Every
// authenticated request still slides the expiry forward (see
// requireStaffSession below), so an in-use console effectively never expires;
// this cap only matters for a console left completely untouched.
const SESSION_MINUTES = 60 * 24 * 30;

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
  const matches = await db.prepare(`SELECT s.id, s.hotel_id FROM staff s
    JOIN departments d ON d.id = s.department_id
    WHERE lower(d.name) = lower(?) AND s.active = 1
    ORDER BY s.created_at ASC`).bind(departmentName).all<{ id: string; hotel_id: string }>();
  if (!matches.results.length) throw new Response('This department account has not been provisioned', { status: 401 });
  // A department name is only guaranteed unique within one hotel. If staff in
  // more than one hotel share this department name, picking one arbitrarily
  // would risk authenticating into the wrong hotel's tenant, so refuse rather
  // than guess — this deployment needs staff-ID login (or a hotel-scoped
  // department login) until departments carry a globally-unique identifier.
  const distinctHotels = new Set(matches.results.map((row) => row.hotel_id));
  if (distinctHotels.size > 1) {
    throw new Response('This department name exists in more than one hotel; sign in with a staff PIN instead', { status: 409 });
  }
  return startStaffSession(db, matches.results[0].id, pin);
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
  const now = new Date();
  const slidingExpiry = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  await db.prepare('UPDATE staff_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .bind(now.toISOString(), slidingExpiry, row.session_id).run();
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
