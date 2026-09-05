import { appendAuditEvent } from '@/lib/backend/audit';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';

const PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const cursorValue = Number(new URL(request.url).searchParams.get('cursor') ?? 0);
    const cursor = Number.isSafeInteger(cursorValue) && cursorValue >= 0 ? cursorValue : 0;
    const now = new Date().toISOString();

    await escalateOverdueMessages(db, identity.hotelId, now);
    const events = await db.prepare(`SELECT sequence, event_type, entity_type, entity_id, payload_json, created_at
      FROM realtime_events
      WHERE hotel_id = ? AND sequence > ? AND (department_id = ? OR department_id IS NULL)
      ORDER BY sequence ASC LIMIT ?`).bind(identity.hotelId, cursor, identity.departmentId, PAGE_SIZE).all<{
        sequence: number; event_type: string; entity_type: string; entity_id: string; payload_json: string; created_at: string;
      }>();

    const messageIds = events.results.filter((event) => event.entity_type === 'message' && event.event_type === 'message.queued').map((event) => event.entity_id);
    if (messageIds.length) {
      await db.batch(messageIds.flatMap((messageId) => [
        db.prepare(`UPDATE message_deliveries SET state = 'delivered', attempts = attempts + 1,
          last_attempt_at = ?, updated_at = ?, last_error = NULL WHERE message_id = ? AND department_id = ?`)
          .bind(now, now, messageId, identity.departmentId),
        db.prepare(`INSERT INTO message_receipts (message_id, department_id, delivered_at)
          VALUES (?, ?, ?) ON CONFLICT(message_id, department_id) DO UPDATE SET delivered_at = COALESCE(message_receipts.delivered_at, excluded.delivered_at)`)
          .bind(messageId, identity.departmentId, now),
      ]));
    }

    return Response.json({
      events: events.results.map((event) => ({ ...event, payload: safeJson(event.payload_json), payload_json: undefined })),
      cursor: events.results.at(-1)?.sequence ?? cursor,
      hasMore: events.results.length === PAGE_SIZE,
      serverTime: now,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to synchronise messages' }, { status: 500 });
  }
}

async function escalateOverdueMessages(db: D1Database, hotelId: string, now: string) {
  const overdue = await db.prepare(`SELECT ue.id, ue.message_id, ue.escalation_department_id, m.conversation_id, m.urgency
    FROM urgent_escalations ue
    JOIN messages m ON m.id = ue.message_id
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.hotel_id = ? AND ue.due_at <= ? AND ue.escalated_at IS NULL AND ue.cancelled_at IS NULL
    LIMIT 50`).bind(hotelId, now).all<{ id: string; message_id: string; escalation_department_id: string; conversation_id: string; urgency: string }>();
  for (const item of overdue.results) {
    const update = await db.prepare(`UPDATE urgent_escalations SET escalated_at = ?
      WHERE id = ? AND escalated_at IS NULL AND cancelled_at IS NULL`).bind(now, item.id).run();
    if (!update.meta.changes) continue;
    await db.prepare(`INSERT INTO realtime_events
      (hotel_id, department_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, 'message.escalated', 'message', ?, ?, ?)`).bind(
        hotelId, item.escalation_department_id, item.message_id,
        JSON.stringify({ conversationId: item.conversation_id, urgency: item.urgency, reason: 'Unacknowledged urgent message' }), now,
      ).run();
    await appendAuditEvent(db, {
      hotelId,
      actorStaffId: null,
      actorDepartmentId: null,
      action: 'message.escalated',
      entityType: 'message',
      entityId: item.message_id,
      metadata: { conversationId: item.conversation_id, reason: 'unacknowledged' },
    });
  }
}

function safeJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return {}; }
}
