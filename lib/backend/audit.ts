import type { AuditInput } from './types';

const encoder = new TextEncoder();

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MAX_CHAIN_RETRIES = 4;

export async function appendAuditEvent(db: D1Database, input: AuditInput, attempt = 0): Promise<{ id: string; eventHash: string; createdAt: string }> {
  const previous = await db
    .prepare('SELECT event_hash FROM audit_events WHERE hotel_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .bind(input.hotelId)
    .first<{ event_hash: string }>();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const metadata = JSON.stringify(input.metadata ?? {});
  const previousHash = previous?.event_hash ?? null;
  const canonical = JSON.stringify({
    id,
    hotelId: input.hotelId,
    actorStaffId: input.actorStaffId,
    actorDepartmentId: input.actorDepartmentId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata,
    previousHash,
    createdAt,
  });
  const eventHash = toHex(await crypto.subtle.digest('SHA-256', encoder.encode(canonical)));
  try {
    await db
      .prepare(`INSERT INTO audit_events
        (id, hotel_id, actor_staff_id, actor_department_id, action, entity_type, entity_id, metadata_json, previous_event_hash, event_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        input.hotelId,
        input.actorStaffId,
        input.actorDepartmentId,
        input.action,
        input.entityType,
        input.entityId,
        metadata,
        previousHash,
        eventHash,
        createdAt,
      )
      .run();
  } catch (error) {
    // A concurrent writer for the same hotel may have chained onto the same
    // previous_event_hash first (see idx_audit_events_hotel_previous_hash);
    // re-read the new latest hash and retry rather than forking the chain.
    const isChainConflict = error instanceof Error && error.message.includes('UNIQUE constraint failed');
    if (isChainConflict && attempt < MAX_CHAIN_RETRIES) {
      return appendAuditEvent(db, input, attempt + 1);
    }
    throw error;
  }
  return { id, eventHash, createdAt };
}
