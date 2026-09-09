import { appendAuditEvent } from './audit';

// Fires any urgent/emergency message escalation whose due_at has passed and
// hasn't already fired or been cancelled (cancelled happens when the
// recipient department acknowledges the message first). This used to only
// run as a side effect of a client polling /api/sync, so a department with
// no screen open would never see its overdue escalations actually escalate.
// It's now also called on a schedule (see app/api/cron/escalate) so it runs
// independently of anyone watching.
export async function escalateOverdueMessages(db: D1Database, hotelId: string, now: string) {
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
  return overdue.results.length;
}

// Escalation rows are per-hotel-scoped by joining through conversations, but
// there's no cheap "distinct hotel ids with any pending escalation" index -
// with a small number of hotels this direct scan is simpler and fine.
export async function escalateAllHotels(db: D1Database, now: string) {
  const hotels = await db.prepare('SELECT id FROM hotels').all<{ id: string }>();
  let total = 0;
  for (const hotel of hotels.results) {
    total += await escalateOverdueMessages(db, hotel.id, now);
  }
  return total;
}
