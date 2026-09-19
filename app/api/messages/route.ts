import { appendAuditEvent } from '@/lib/backend/audit';
import { notifyHotelPing } from '@/lib/backend/hotelPingNotify';
import { assertAccess, assertDepartmentInHotel, canAccessGuestRequestByRole } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { isManagement, type StaffIdentity } from '@/lib/backend/types';

const creatableConversationKinds = new Set(['department', 'direct', 'approval']);

async function assertConversationMembership(db: D1Database, conversationId: string, departmentId: string) {
  const membership = await db.prepare(`SELECT 1 AS allowed FROM conversation_departments
    WHERE conversation_id = ? AND department_id = ?`).bind(conversationId, departmentId).first();
  if (!membership) throw new Response('Forbidden', { status: 403 });
}

async function assertGuestRequestAccess(db: D1Database, identity: StaffIdentity, conversationId: string, hotelId: string) {
  assertAccess(identity, 'read', 'guest_request', { hotelId });
  if (isManagement(identity) || canAccessGuestRequestByRole(identity)) return;
  await assertConversationMembership(db, conversationId, identity.departmentId);
}

function attachmentType(contentType: string): 'photo' | 'voice' | 'file' {
  if (contentType.startsWith('image/')) return 'photo';
  if (contentType.startsWith('audio/')) return 'voice';
  return 'file';
}

// Attachments are fetched in a second query keyed by message id rather than
// joined into the main SELECT - a message can carry more than one file, and
// a JOIN there would multiply each message row per attachment.
async function attachmentsByMessageId(db: D1Database, messageIds: string[]) {
  const byMessage = new Map<string, { id: string; type: string; fileName: string; contentType: string; sizeBytes: number }[]>();
  if (!messageIds.length) return byMessage;
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT id, message_id, file_name, content_type, size_bytes FROM attachments WHERE message_id IN (${placeholders})`)
    .bind(...messageIds)
    .all<{ id: string; message_id: string; file_name: string; content_type: string; size_bytes: number }>();
  for (const row of rows.results) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push({ id: row.id, type: attachmentType(row.content_type), fileName: row.file_name, contentType: row.content_type, sizeBytes: row.size_bytes });
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

// A flat, most-recent-first feed across every conversation a department
// belongs to - what a department's message panel actually shows, since it
// displays "everything involving us" rather than one conversation at a time.
// Management can pass departmentId to view another department's feed; a
// regular department account is fixed to its own.
async function departmentFeed(db: D1Database, identity: StaffIdentity, requestedDepartmentId: string | null) {
  const departmentId = requestedDepartmentId ?? identity.departmentId;
  if (departmentId !== identity.departmentId) {
    if (!isManagement(identity)) throw new Response('Forbidden', { status: 403 });
    await assertDepartmentInHotel(db, departmentId, identity.hotelId);
  }
  const messages = await db
    .prepare(`SELECT m.id, m.body, m.urgency, m.message_type, m.created_at, m.conversation_id,
        s.display_name AS sender_name, d.name AS sender_department
      FROM messages m
      JOIN conversation_departments cd ON cd.conversation_id = m.conversation_id
      JOIN staff s ON s.id = m.sender_staff_id
      JOIN departments d ON d.id = s.department_id
      WHERE cd.department_id = ?
      ORDER BY m.created_at DESC LIMIT 100`)
    .bind(departmentId)
    .all<{ id: string }>();
  const attachmentsByMessage = await attachmentsByMessageId(db, messages.results.map((row) => row.id));
  const withAttachments = messages.results.map((row) => ({ ...row, attachments: attachmentsByMessage.get(row.id) ?? [] }));
  return Response.json({ messages: withAttachments });
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    if (!conversationId) return departmentFeed(db, identity, url.searchParams.get('departmentId'));
    const conversation = await db
      .prepare('SELECT id, hotel_id, kind, subject, status, created_at, updated_at FROM conversations WHERE id = ?')
      .bind(conversationId)
      .first<{ id: string; hotel_id: string; kind: string }>();
    if (!conversation || conversation.hotel_id !== identity.hotelId) return new Response('Not found', { status: 404 });
    if (conversation.kind === 'guest_request') {
      await assertGuestRequestAccess(db, identity, conversationId, conversation.hotel_id);
    } else if (!isManagement(identity)) {
      await assertConversationMembership(db, conversationId, identity.departmentId);
    }
    const messages = await db
      .prepare(`SELECT m.id, m.body, m.urgency, m.message_type, m.reply_to_message_id, m.created_at,
          s.display_name AS sender_name, d.name AS sender_department
        FROM messages m JOIN staff s ON s.id = m.sender_staff_id
        JOIN departments d ON d.id = s.department_id
        WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 250`)
      .bind(conversationId)
      .all<{ id: string }>();
    const attachmentsByMessage = await attachmentsByMessageId(db, messages.results.map((row) => row.id));
    const withAttachments = messages.results.map((row) => ({ ...row, attachments: attachmentsByMessage.get(row.id) ?? [] }));
    return Response.json({ conversation, messages: withAttachments });
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
    if (body.kind && !creatableConversationKinds.has(body.kind)) {
      return Response.json({ error: 'Invalid conversation kind' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const conversationId = body.conversationId ?? crypto.randomUUID();
    if (!body.conversationId) {
      if (!body.recipientDepartmentIds?.length) return Response.json({ error: 'Choose a recipient department' }, { status: 400 });
      const uniqueRecipients = [...new Set(body.recipientDepartmentIds)];
      const placeholders = uniqueRecipients.map(() => '?').join(',');
      const validRecipients = await db.prepare(`SELECT id FROM departments WHERE hotel_id = ? AND id IN (${placeholders})`)
        .bind(identity.hotelId, ...uniqueRecipients).all<{ id: string }>();
      if (validRecipients.results.length !== uniqueRecipients.length) throw new Response('Forbidden', { status: 403 });
      const members = [...new Set([identity.departmentId, ...uniqueRecipients])];
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
      if (conversation.kind === 'guest_request') await assertGuestRequestAccess(db, identity, conversationId, conversation.hotel_id);
      else if (!isManagement(identity)) await assertConversationMembership(db, conversationId, identity.departmentId);
    }
    if (body.replyToMessageId) {
      const replyTarget = await db.prepare('SELECT conversation_id FROM messages WHERE id = ?').bind(body.replyToMessageId).first<{ conversation_id: string }>();
      if (!replyTarget || replyTarget.conversation_id !== conversationId) {
        return Response.json({ error: 'Invalid reply target' }, { status: 400 });
      }
    }
    const messageId = crypto.randomUUID();
    const recipientDepartments = await db.prepare(`SELECT cd.department_id, d.slug FROM conversation_departments cd
        JOIN departments d ON d.id = cd.department_id
        WHERE cd.conversation_id = ? AND cd.department_id != ?`)
      .bind(conversationId, identity.departmentId).all<{ department_id: string; slug: string }>();
    const urgency = body.urgency ?? 'normal';
    const eventPayload = JSON.stringify({ conversationId, urgency, senderDepartmentId: identity.departmentId });
    const allStatements = [
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
    ];
    // The urgent_escalations insert below depends on a 'general-manager'
    // department existing for this hotel (its SELECT ... WHERE just matches
    // zero rows otherwise) - track where each one lands in the batch so a
    // silent no-op can be caught and reported instead of quietly dropping
    // the escalation.
    const escalationChecks: { index: number; departmentId: string }[] = [];
    recipientDepartments.results.forEach(({ department_id: departmentId }) => {
      allStatements.push(
        db.prepare(`INSERT INTO message_deliveries
          (message_id, department_id, state, attempts, created_at, updated_at) VALUES (?, ?, 'queued', 0, ?, ?)`)
          .bind(messageId, departmentId, now, now),
        db.prepare(`INSERT INTO realtime_events
          (hotel_id, department_id, event_type, entity_type, entity_id, payload_json, created_at)
          VALUES (?, ?, 'message.queued', 'message', ?, ?, ?)`).bind(identity.hotelId, departmentId, messageId, eventPayload, now),
      );
      if (urgency === 'urgent' || urgency === 'emergency') {
        escalationChecks.push({ index: allStatements.length, departmentId });
        allStatements.push(db.prepare(`INSERT INTO urgent_escalations
          (id, message_id, recipient_department_id, escalation_department_id, due_at, created_at)
          SELECT ?, ?, ?, id, ?, ? FROM departments WHERE hotel_id = ? AND slug = 'general-manager'`)
          .bind(crypto.randomUUID(), messageId, departmentId, new Date(Date.now() + (urgency === 'emergency' ? 60_000 : 5 * 60_000)).toISOString(), now, identity.hotelId));
      }
    });
    const batchResults = await db.batch(allStatements);
    for (const check of escalationChecks) {
      if (!batchResults[check.index]?.meta?.changes) {
        console.error('urgent escalation not created: no general-manager department for hotel', identity.hotelId, 'message', messageId);
        await appendAuditEvent(db, {
          hotelId: identity.hotelId,
          actorStaffId: null,
          actorDepartmentId: null,
          action: 'escalation.misconfigured',
          entityType: 'message',
          entityId: messageId,
          metadata: { departmentId: check.departmentId, reason: 'No general-manager department configured for this hotel' },
        });
      }
    }
    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'message.sent',
      entityType: 'message',
      entityId: messageId,
      metadata: { conversationId, urgency, clientMessageId: body.clientMessageId.trim(), recipients: recipientDepartments.results.map((row) => row.department_id) },
    });
    // Best-effort bridge to Hotel Ping (the department heads' own messaging
    // app) - keyed on this message's own id, which is already deduped above
    // via client_message_id, so a retry here never sends a department head
    // the same notification twice.
    await Promise.all(recipientDepartments.results.map((recipient) =>
      notifyHotelPing({ idempotencyKey: messageId, departmentSlug: recipient.slug, message: body.message!.trim() }),
    ));
    return Response.json({ conversationId, messageId, createdAt: now, delivery: 'queued' }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to send message' }, { status: 500 });
  }
}
