import { appendAuditEvent } from '@/lib/backend/audit';
import { assertDepartmentInHotel } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { isManagement } from '@/lib/backend/types';

type Command = 'watch' | 'unwatch' | 'step_in' | 'step_back' | 'comment' | 'request_update' | 'thank' | 'reassign' | 'decide' | 'resolve';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    if (!isManagement(identity)) return new Response('Forbidden', { status: 403 });
    const conversationId = (await context.params).id;
    const conversation = await db.prepare('SELECT id, hotel_id, status FROM conversations WHERE id = ?').bind(conversationId).first<{id:string;hotel_id:string;status:string}>();
    if (!conversation || conversation.hotel_id !== identity.hotelId) return new Response('Not found', { status: 404 });
    const body = await request.json() as { command?: Command; note?: string; departmentId?: string; decisionId?: string; outcome?: 'approved'|'declined'|'more_information'|'resolved' };
    if (!body.command) return Response.json({ error: 'Command is required' }, { status: 400 });
    const now = new Date().toISOString();
    let messageId: string | null = null;
    if (body.command === 'watch') await db.prepare('INSERT OR IGNORE INTO conversation_watchers (conversation_id, staff_id, created_at) VALUES (?, ?, ?)').bind(conversationId, identity.staffId, now).run();
    else if (body.command === 'unwatch') await db.prepare('DELETE FROM conversation_watchers WHERE conversation_id = ? AND staff_id = ?').bind(conversationId, identity.staffId).run();
    else if (body.command === 'step_in') await db.prepare('INSERT INTO conversation_participation (conversation_id, staff_id, joined_at) VALUES (?, ?, ?)').bind(conversationId, identity.staffId, now).run();
    else if (body.command === 'step_back') await db.prepare('UPDATE conversation_participation SET left_at = ? WHERE conversation_id = ? AND staff_id = ? AND left_at IS NULL').bind(now, conversationId, identity.staffId).run();
    else if (body.command === 'reassign') {
      if (!body.departmentId) return Response.json({ error: 'Department is required' }, { status: 400 });
      await assertDepartmentInHotel(db, body.departmentId, identity.hotelId);
      await db.prepare('INSERT OR IGNORE INTO conversation_departments (conversation_id, department_id) VALUES (?, ?)').bind(conversationId, body.departmentId).run();
    } else if (body.command === 'decide') {
      if (!body.decisionId || !body.outcome) return Response.json({ error: 'Decision and outcome are required' }, { status: 400 });
      await db.prepare(`UPDATE management_decisions SET status = ?, decision_note = ?, decided_by_staff_id = ?, updated_at = ?, resolved_at = CASE WHEN ? IN ('approved','declined','resolved') THEN ? ELSE NULL END WHERE id = ? AND conversation_id = ?`)
        .bind(body.outcome, body.note?.trim() || null, identity.staffId, now, body.outcome, now, body.decisionId, conversationId).run();
    } else {
      const text = body.note?.trim() || (body.command === 'request_update' ? 'Management requested an update.' : body.command === 'thank' ? 'Management thanked the team.' : body.command === 'resolve' ? 'Management resolved this issue.' : 'Management commented.');
      messageId = crypto.randomUUID();
      const type = body.command === 'resolve' ? 'completion' : body.command === 'request_update' ? 'request' : 'message';
      await db.prepare(`INSERT INTO messages (id, conversation_id, sender_staff_id, body, urgency, message_type, created_at) VALUES (?, ?, ?, ?, 'normal', ?, ?)`)
        .bind(messageId, conversationId, identity.staffId, text, type, now).run();
      if (body.command === 'resolve') await db.prepare("UPDATE conversations SET status = 'resolved', updated_at = ? WHERE id = ?").bind(now, conversationId).run();
      else await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId).run();
    }
    await appendAuditEvent(db, { hotelId: identity.hotelId, actorStaffId: identity.staffId, actorDepartmentId: identity.departmentId,
      action: `conversation.${body.command}`, entityType: 'conversation', entityId: conversationId,
      metadata: { messageId, departmentId: body.departmentId, decisionId: body.decisionId, outcome: body.outcome } });
    return Response.json({ conversationId, command: body.command, messageId, updatedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update conversation' }, { status: 500 });
  }
}
