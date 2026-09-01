import { appendAuditEvent } from '@/lib/backend/audit';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';

const receiptColumns = {
  delivered: 'delivered_at',
  viewed: 'viewed_at',
  acknowledged: 'acknowledged_at',
  dismissed: 'dismissed_at',
} as const;

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const body = (await request.json()) as { messageId?: string; event?: keyof typeof receiptColumns };
    if (!body.messageId || !body.event || !receiptColumns[body.event]) {
      return Response.json({ error: 'Message and receipt event are required' }, { status: 400 });
    }
    const message = await db.prepare(`SELECT c.hotel_id FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ?`).bind(body.messageId).first<{ hotel_id: string }>();
    if (!message || message.hotel_id !== identity.hotelId) return new Response('Not found', { status: 404 });
    const now = new Date().toISOString();
    const column = receiptColumns[body.event];
    await db.prepare(`INSERT INTO message_receipts (message_id, department_id, ${column}, acted_by_staff_id)
      VALUES (?, ?, ?, ?) ON CONFLICT(message_id, department_id) DO UPDATE SET ${column} = excluded.${column}, acted_by_staff_id = excluded.acted_by_staff_id`)
      .bind(body.messageId, identity.departmentId, now, identity.staffId).run();
    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: `message.${body.event}`,
      entityType: 'message',
      entityId: body.messageId,
    });
    return Response.json({ recordedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to record receipt' }, { status: 500 });
  }
}
