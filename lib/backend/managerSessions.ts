import { createSessionToken, hashPassword, hashToken, verifyPassword } from './security';
import type { ManagerIdentity } from './types';

// Same reasoning as owner sessions: a manager's phone stays signed in for
// a shift or longer rather than timing out like a personal web login.
const SESSION_MINUTES = 60 * 24 * 30;

const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;

async function recentFailureCount(db: D1Database, identifier: string) {
  const since = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
  await db.prepare('DELETE FROM login_failures WHERE created_at <= ?').bind(since).run();
  const row = await db.prepare('SELECT COUNT(*) AS total FROM login_failures WHERE identifier = ? AND created_at > ?')
    .bind(identifier, since).first<{ total: number }>();
  return row?.total ?? 0;
}

async function recordFailure(db: D1Database, identifier: string) {
  await db.prepare('INSERT INTO login_failures (id, identifier, created_at) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), identifier, new Date().toISOString()).run();
}

async function assertNotLockedOut(db: D1Database, identifier: string) {
  if ((await recentFailureCount(db, identifier)) >= LOGIN_ATTEMPT_LIMIT) {
    throw new Response('Too many incorrect attempts. Try again in 15 minutes.', { status: 429 });
  }
}

interface ManagerRow {
  id: string;
  hotel_id: string;
  department_id: string;
  password_hash: string;
  password_salt: string;
  active: number;
}

async function createSession(db: D1Database, manager: ManagerRow) {
  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  await db.prepare(`INSERT INTO manager_sessions (id, manager_id, token_hash, expires_at, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, manager.id, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  const identity: ManagerIdentity = { managerId: manager.id, hotelId: manager.hotel_id, departmentId: manager.department_id };
  return { token, expiresAt, identity };
}

// Managers don't self-sign-up like owners - an owner (or another admin
// flow) creates the account for a named person, this just authenticates
// against it. Same shape of call as loginOwner deliberately, so the two
// auth systems stay easy to compare.
export async function loginManager(db: D1Database, email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const identifier = `manager:${cleanEmail}`;
  await assertNotLockedOut(db, identifier);

  const manager = await db.prepare(`SELECT id, hotel_id, department_id, password_hash, password_salt, active
      FROM managers WHERE email = ?`).bind(cleanEmail).first<ManagerRow>();
  if (!manager || !manager.active || !(await verifyPassword(password, manager.password_hash, manager.password_salt))) {
    await recordFailure(db, identifier);
    throw new Response('Invalid email or password', { status: 401 });
  }

  return createSession(db, manager);
}

export async function requireManagerSession(db: D1Database, token: string | null): Promise<ManagerIdentity> {
  if (!token) throw new Response('Manager session required', { status: 401 });
  const tokenHash = await hashToken(token);
  const row = await db.prepare(`SELECT ms.id AS session_id, m.id AS manager_id, m.hotel_id, m.department_id
      FROM manager_sessions ms
      JOIN managers m ON m.id = ms.manager_id
      WHERE ms.token_hash = ? AND ms.ended_at IS NULL AND ms.expires_at > ? AND m.active = 1`)
    .bind(tokenHash, new Date().toISOString())
    .first<{ session_id: string; manager_id: string; hotel_id: string; department_id: string }>();
  if (!row) throw new Response('Manager session has expired', { status: 401 });

  const now = new Date();
  const slidingExpiry = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  await db.prepare('UPDATE manager_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .bind(now.toISOString(), slidingExpiry, row.session_id).run();

  return { managerId: row.manager_id, hotelId: row.hotel_id, departmentId: row.department_id };
}

export async function endManagerSession(db: D1Database, token: string) {
  const tokenHash = await hashToken(token);
  await db.prepare('UPDATE manager_sessions SET ended_at = ? WHERE token_hash = ? AND ended_at IS NULL')
    .bind(new Date().toISOString(), tokenHash).run();
}

// Called from an owner-authenticated route (owner or GM creates the
// account for a named person) - never self-serve, since a manager
// account speaks for a real person's identity in every message they send.
export async function createManager(db: D1Database, hotelId: string, departmentId: string, name: string, email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Response('A valid email is required', { status: 400 });
  const cleanName = name.trim();
  if (!cleanName) throw new Response('A name is required', { status: 400 });

  const existing = await db.prepare('SELECT id FROM managers WHERE email = ?').bind(cleanEmail).first<{ id: string }>();
  if (existing) throw new Response('An account with that email already exists', { status: 409 });

  let passwordHash: { hash: string; salt: string };
  try {
    passwordHash = await hashPassword(password);
  } catch {
    throw new Response('Password must be at least 8 characters', { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO managers (id, hotel_id, department_id, name, email, password_hash, password_salt, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .bind(id, hotelId, departmentId, cleanName, cleanEmail, passwordHash.hash, passwordHash.salt, now).run();

  return { id, name: cleanName, email: cleanEmail };
}
