import { createSessionToken, hashPassword, hashToken, verifyPassword } from './security';
import type { OwnerIdentity } from './types';

// Owners share the same shared-console session length as staff PINs: this
// account is for setup and occasional admin changes, not something that
// should demand re-entering a password every half hour.
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

interface OwnerRow {
  id: string;
  password_hash: string;
  password_salt: string;
}

async function createSession(db: D1Database, ownerId: string, hotelId: string) {
  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  await db.prepare(`INSERT INTO owner_sessions (id, owner_id, token_hash, expires_at, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, ownerId, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  return { token, expiresAt, identity: { ownerId, hotelId } as OwnerIdentity };
}

// Signing up IS creating the hotel - a prospective hotel's whole
// "onboarding" is this one call, so it has to succeed as a single unit
// (an owner with no hotel, or a hotel with no owner, is a broken account).
export async function signUpOwner(db: D1Database, email: string, password: string, hotelName: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Response('A valid email is required', { status: 400 });
  const cleanHotelName = hotelName.trim();
  if (!cleanHotelName) throw new Response('A hotel name is required', { status: 400 });

  const existing = await db.prepare('SELECT id FROM owners WHERE email = ?').bind(cleanEmail).first<{ id: string }>();
  if (existing) throw new Response('An account with that email already exists', { status: 409 });

  let passwordHash: { hash: string; salt: string };
  try {
    passwordHash = await hashPassword(password);
  } catch {
    throw new Response('Password must be at least 8 characters', { status: 400 });
  }

  const ownerId = crypto.randomUUID();
  const hotelId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO owners (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(ownerId, cleanEmail, passwordHash.hash, passwordHash.salt, now),
    db.prepare('INSERT INTO hotels (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(hotelId, cleanHotelName, ownerId, now),
  ]);

  const session = await createSession(db, ownerId, hotelId);
  return { ...session, hotelName: cleanHotelName };
}

export async function loginOwner(db: D1Database, email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const identifier = `owner:${cleanEmail}`;
  await assertNotLockedOut(db, identifier);

  const owner = await db.prepare('SELECT id, password_hash, password_salt FROM owners WHERE email = ?')
    .bind(cleanEmail).first<OwnerRow>();
  if (!owner || !(await verifyPassword(password, owner.password_hash, owner.password_salt))) {
    await recordFailure(db, identifier);
    throw new Response('Invalid email or password', { status: 401 });
  }

  const hotel = await db.prepare('SELECT id, name FROM hotels WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1')
    .bind(owner.id).first<{ id: string; name: string }>();
  if (!hotel) throw new Response('No hotel is set up for this account yet', { status: 404 });

  const session = await createSession(db, owner.id, hotel.id);
  return { ...session, hotelName: hotel.name };
}

export async function requireOwnerSession(db: D1Database, token: string | null): Promise<OwnerIdentity> {
  if (!token) throw new Response('Owner session required', { status: 401 });
  const tokenHash = await hashToken(token);
  const row = await db.prepare(`SELECT os.id AS session_id, o.id AS owner_id, h.id AS hotel_id
      FROM owner_sessions os
      JOIN owners o ON o.id = os.owner_id
      JOIN hotels h ON h.owner_id = o.id
      WHERE os.token_hash = ? AND os.ended_at IS NULL AND os.expires_at > ?
      ORDER BY h.created_at ASC LIMIT 1`)
    .bind(tokenHash, new Date().toISOString())
    .first<{ session_id: string; owner_id: string; hotel_id: string }>();
  if (!row) throw new Response('Owner session has expired', { status: 401 });

  const now = new Date();
  const slidingExpiry = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  await db.prepare('UPDATE owner_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .bind(now.toISOString(), slidingExpiry, row.session_id).run();

  return { ownerId: row.owner_id, hotelId: row.hotel_id };
}

export async function endOwnerSession(db: D1Database, token: string) {
  const tokenHash = await hashToken(token);
  await db.prepare('UPDATE owner_sessions SET ended_at = ? WHERE token_hash = ? AND ended_at IS NULL')
    .bind(new Date().toISOString(), tokenHash).run();
}
