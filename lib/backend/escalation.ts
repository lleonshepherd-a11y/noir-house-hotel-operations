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

const TASK_OVERDUE_MS = 2 * 24 * 3600 * 1000;

// A task with no explicit due date that's sat open for more than two days
// (the default staff actually asked for), or one that's simply past its own
// due_at, gets promoted to urgent priority. That single write is the whole
// mechanism: urgent tasks already surface in the topbar notification ring
// and sort to the top of every task feed, so nothing else needs to know this
// promotion happened for the alert to actually show up somewhere.
export async function escalateOverdueTasks(db: D1Database, hotelId: string, now: string) {
  const cutoff = new Date(new Date(now).getTime() - TASK_OVERDUE_MS).toISOString();
  const overdue = await db.prepare(`SELECT id, assigned_department_id, title FROM tasks
    WHERE hotel_id = ? AND status NOT IN ('completed', 'cancelled') AND priority != 'urgent'
      AND ((due_at IS NOT NULL AND due_at <= ?) OR (due_at IS NULL AND created_at <= ?))
    LIMIT 50`).bind(hotelId, now, cutoff).all<{ id: string; assigned_department_id: string; title: string }>();
  for (const item of overdue.results) {
    const update = await db.prepare(`UPDATE tasks SET priority = 'urgent', updated_at = ?
      WHERE id = ? AND priority != 'urgent'`).bind(now, item.id).run();
    if (!update.meta.changes) continue;
    await db.prepare(`INSERT INTO realtime_events
      (hotel_id, department_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, 'task.escalated', 'task', ?, ?, ?)`).bind(
        hotelId, item.assigned_department_id, item.id,
        JSON.stringify({ title: item.title, reason: 'Open for more than 2 days with no due date, or past its due date' }), now,
      ).run();
    await appendAuditEvent(db, {
      hotelId,
      actorStaffId: null,
      actorDepartmentId: item.assigned_department_id,
      action: 'task.escalated',
      entityType: 'task',
      entityId: item.id,
      metadata: { reason: 'overdue', title: item.title },
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
    total += await escalateOverdueTasks(db, hotel.id, now);
  }
  return total;
}
