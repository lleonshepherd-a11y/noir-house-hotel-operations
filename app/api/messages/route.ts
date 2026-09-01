import { appendAuditEvent } from '@/lib/backend/audit';
import { assertAccess } from '@/lib/backend/policy';
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
    };
    if (!body.message?.trim()) return Response.json({ error: 'Message is required' }, { status: 400 });
    const now = new Date().toISOString();
    const conversationId = body.conversationId ?? crypto.randomUUID();
    if (!body.conversationId) {
      if (!body.recipientDepartmentIds?.length) return Response.json({ error: 'Choose a recipient department' }, { status: 400 });
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
        ...body.recipientDepartmentIds.map((departmentId) =>
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
    await db
      .prepare(`INSERT INTO messages (id, conversation_id, sender_staff_id, body, urgency, message_type, reply_to_message_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`) 
      .bind(
        messageId,
        conversationId,
        identity.staffId,
        body.message.trim(),
        body.urgency ?? 'normal',
        body.messageType ?? 'message',
        body.replyToMessageId ?? null,
        now,
      )
      .run();
    await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId).run();
    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'message.sent',
      entityType: 'message',
      entityId: messageId,
      metadata: { conversationId, urgency: body.urgency ?? 'normal' },
    });
    return Response.json({ conversationId, messageId, createdAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to send message' }, { status: 500 });
  }
}
