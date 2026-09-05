import { appendAuditEvent } from '@/lib/backend/audit';
import { assertAccess, assertDepartmentInHotel } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { isManagement } from '@/lib/backend/types';

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    if (!conversationId) return Response.json({ error: 'Conversation is required' }, { status: 400 });
    const conversation = await db
      .prepare('SELECT id, hotel_id, kind, subject, status, created_at, updated_at FROM conversations WHERE id = ?')
      .bind(conversationId)
      .first<{ id: string; hotel_id: string; kind: string }>();
    if (!conversation || conversation.hotel_id !== identity.hotelId) return new Response('Not found', { status: 404 });
    if (conversation.kind === 'guest_request') {
      assertAccess(identity, 'read', 'guest_request', { hotelId: conversation.hotel_id });
    } else if (!isManagement(identity)) {
      const membership = await db.prepare(`SELECT 1 AS allowed FROM conversation_departments
        WHERE conversation_id = ? AND department_id = ?`).bind(conversationId, identity.departmentId).first();
      if (!membership) return new Response('Forbidden', { status: 403 });
    }
    const messages = await db
      .prepare(`SELECT m.id, m.body, m.urgency, m.message_type, m.reply_to_message_id, m.created_at,
          s.display_name AS sender_name, d.name AS sender_department
        FROM messages m JOIN staff s ON s.id = m.sender_staff_id
        JOIN departments d ON d.id = s.department_id
        WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 250`)
      .bind(conversationId)
      .all();
    return Response.json({ conversation, messages: messages.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load messages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const body = (await request.json()) as {
      conversationId?: string;
      recipientDepartmentIds?: string[];
      subject?: string;
      message?: string;
      urgency?: 'normal' | 'urgent' | 'emergency';
      messageType?: 'message' | 'request' | 'approval' | 'decision' | 'completion';
      replyToMessageId?: string;
      kind?: 'department' | 'direct' | 'approval';
      clientMessageId?: string;
    };
    if (!body.message?.trim()) return Response.json({ error: 'Message is required' }, { status: 400 });
    if (!body.clientMessageId?.trim()) return Response.json({ error: 'A client message ID is required for reliable delivery' }, { status: 400 });
    const duplicate = await db.prepare(`SELECT id, conversation_id, created_at FROM messages
      WHERE sender_staff_id = ? AND client_message_id = ?`).bind(identity.staffId, body.clientMessageId.trim())
      .first<{ id: string; conversation_id: string; created_at: string }>();
    if (duplicate) return Response.json({ conversationId: duplicate.conversation_id, messageId: duplicate.id, createdAt: duplicate.created_at, duplicate: true });
    const now = new Date().toISOString();
    const conversationId = body.conversationId ?? crypto.randomUUID();
    if (!body.conversationId) {
      if (!body.recipientDepartmentIds?.length) return Response.json({ error: 'Choose a recipient department' }, { status: 400 });
      for (const departmentId of body.recipientDepartmentIds) {
        await assertDepartmentInHotel(db, departmentId, identity.hotelId);
      }
      const members = [...new Set([identity.departmentId, ...body.recipientDepartmentIds])];
      await db.batch([
        db.prepare(`INSERT INTO conversations (id, hotel_id, kind, subject, status, created_by_staff_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`).bind(
          conversationId,
          identity.hotelId,
          body.kind ?? 'department',
          body.subject?.trim() || null,
          identity.staffId,
          now,
          now,
        ),
        ...members.map((departmentId) =>
          db.prepare('INSERT INTO conversation_departments (conversation_id, department_id) VALUES (?, ?)').bind(conversationId, departmentId),
        ),
      ]);
    } else {
      const conversation = await db.prepare('SELECT hotel_id, kind FROM conversations WHERE id = ?').bind(conversationId).first<{ hotel_id: string; kind: string }>();
      if (!conversation || conversation.hotel_id !== identity.hotelId) return new Response('Not found', { status: 404 });
      if (conversation.kind === 'guest_request') assertAccess(identity, 'update', 'guest_request', { hotelId: conversation.hotel_id });
      else if (!isManagement(identity)) {
        const membership = await db.prepare(`SELECT 1 AS allowed FROM conversation_departments
          WHERE conversation_id = ? AND department_id = ?`).bind(conversationId, identity.departmentId).first();
        if (!membership) return new Response('Forbidden', { status: 403 });
      }
    }
    const messageId = crypto.randomUUID();
    const recipientDepartments = await db.prepare('SELECT department_id FROM conversation_departments WHERE conversation_id = ? AND department_id != ?')
      .bind(conversationId, identity.departmentId).all<{ department_id: string }>();
    const urgency = body.urgency ?? 'normal';
    const eventPayload = JSON.stringify({ conversationId, urgency, senderDepartmentId: identity.departmentId });
    const deliveryStatements = recipientDepartments.results.flatMap(({ department_id: departmentId }) => {
      const statements = [
        db.prepare(`INSERT INTO message_deliveries
          (message_id, department_id, state, attempts, created_at, updated_at) VALUES (?, ?, 'queued', 0, ?, ?)`)
          .bind(messageId, departmentId, now, now),
        db.prepare(`INSERT INTO realtime_events
          (hotel_id, department_id, event_type, entity_type, entity_id, payload_json, created_at)
          VALUES (?, ?, 'message.queued', 'message', ?, ?, ?)`).bind(identity.hotelId, departmentId, messageId, eventPayload, now),
      ];
      if (urgency === 'urgent' || urgency === 'emergency') {
        statements.push(db.prepare(`INSERT INTO urgent_escalations
          (id, message_id, recipient_department_id, escalation_department_id, due_at, created_at)
          SELECT ?, ?, ?, id, ?, ? FROM departments WHERE hotel_id = ? AND slug = 'general-manager'`)
          .bind(crypto.randomUUID(), messageId, departmentId, new Date(Date.now() + (urgency === 'emergency' ? 60_000 : 5 * 60_000)).toISOString(), now, identity.hotelId));
      }
      return statements;
    });
    await db.batch([
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_staff_id, body, urgency, message_type, reply_to_message_id, created_at, client_message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        messageId,
        conversationId,
        identity.staffId,
        body.message.trim(),
        urgency,
        body.messageType ?? 'message',
        body.replyToMessageId ?? null,
        now,
        body.clientMessageId.trim(),
      ),
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId),
      ...deliveryStatements,
    ]);
    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'message.sent',
      entityType: 'message',
      entityId: messageId,
      metadata: { conversationId, urgency, clientMessageId: body.clientMessageId.trim(), recipients: recipientDepartments.results.map((row) => row.department_id) },
    });
    return Response.json({ conversationId, messageId, createdAt: now, delivery: 'queued' }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to send message' }, { status: 500 });
  }
}
