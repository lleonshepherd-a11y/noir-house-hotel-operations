import { appendAuditEvent } from '@/lib/backend/audit';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';

type BoardType = 'housekeeping_room' | 'restaurant_table';
type BoardStatus = 'pending' | 'ready' | 'away';

const allowedStatuses: Record<BoardType, BoardStatus[]> = {
  housekeeping_room: ['pending', 'ready'],
  restaurant_table: ['pending', 'away'],
};

function boardType(value: string | null): BoardType | null {
  return value === 'housekeeping_room' || value === 'restaurant_table' ? value : null;
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const type = boardType(new URL(request.url).searchParams.get('type'));
    if (!type) return Response.json({ error: 'A valid board type is required' }, { status: 400 });

    const rows = await db.prepare(`SELECT item_number, status, updated_at
      FROM operational_statuses
      WHERE hotel_id = ? AND department_id = ? AND board_type = ?
      ORDER BY item_number`).bind(identity.hotelId, identity.departmentId, type).all();
    return Response.json({ results: rows.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load the status board' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const body = (await request.json()) as Record<string, unknown>;
    const type = boardType(typeof body.type === 'string' ? body.type : null);
    const itemNumber = Number(body.itemNumber);
    const status = typeof body.status === 'string' ? body.status as BoardStatus : null;

    if (!type || !Number.isInteger(itemNumber) || itemNumber < 1 || !status || !allowedStatuses[type].includes(status)) {
      return Response.json({ error: 'A valid board item and status are required' }, { status: 400 });
    }

    const sourceDepartment = await db.prepare('SELECT name, slug FROM departments WHERE id = ? AND hotel_id = ?')
      .bind(identity.departmentId, identity.hotelId).first<{ name: string; slug: string }>();
    const permittedSource = type === 'housekeeping_room' ? 'housekeeping' : 'restaurant';
    if (!sourceDepartment || sourceDepartment.slug !== permittedSource) return new Response('Forbidden', { status: 403 });

    const existing = await db.prepare(`SELECT id, status FROM operational_statuses
      WHERE hotel_id = ? AND department_id = ? AND board_type = ? AND item_number = ?`)
      .bind(identity.hotelId, identity.departmentId, type, itemNumber).first<{ id: string; status: BoardStatus }>();
    const id = existing?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    await db.prepare(`INSERT INTO operational_statuses
      (id, hotel_id, department_id, board_type, item_number, status, changed_by_staff_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hotel_id, department_id, board_type, item_number)
      DO UPDATE SET status = excluded.status, changed_by_staff_id = excluded.changed_by_staff_id, updated_at = excluded.updated_at`)
      .bind(id, identity.hotelId, identity.departmentId, type, itemNumber, status, identity.staffId, now, now).run();

    const targetSlug = type === 'housekeeping_room' ? 'front-of-house' : 'kitchen';
    const target = await db.prepare('SELECT id FROM departments WHERE hotel_id = ? AND slug = ?')
      .bind(identity.hotelId, targetSlug).first<{ id: string }>();
    let conversationId: string | null = null;
    let messageId: string | null = null;
    if (target) {
      const subject = type === 'housekeeping_room' ? `Room ${itemNumber} status` : `Table ${itemNumber} food status`;
      const openConversation = await db.prepare(`SELECT id FROM conversations
        WHERE hotel_id = ? AND subject = ? AND status = 'open' ORDER BY updated_at DESC LIMIT 1`)
        .bind(identity.hotelId, subject).first<{ id: string }>();
      conversationId = openConversation?.id ?? crypto.randomUUID();
      if (!openConversation) {
        await db.batch([
          db.prepare(`INSERT INTO conversations
            (id, hotel_id, kind, subject, status, created_by_staff_id, created_at, updated_at)
            VALUES (?, ?, 'department', ?, 'open', ?, ?, ?)`).bind(conversationId, identity.hotelId, subject, identity.staffId, now, now),
          db.prepare('INSERT INTO conversation_departments (conversation_id, department_id) VALUES (?, ?)').bind(conversationId, identity.departmentId),
          db.prepare('INSERT INTO conversation_departments (conversation_id, department_id) VALUES (?, ?)').bind(conversationId, target.id),
        ]);
      }
      messageId = crypto.randomUUID();
      const message = type === 'housekeeping_room'
        ? status === 'ready' ? `Room ${itemNumber} has been cleaned and is ready.` : `Correction: room ${itemNumber} is not ready. Please wait for a new confirmation.`
        : status === 'away' ? `Food is away for table ${itemNumber}.` : `Correction: the food-away status for table ${itemNumber} has been withdrawn.`;
      await db.batch([
        db.prepare(`INSERT INTO messages
          (id, conversation_id, sender_staff_id, body, urgency, message_type, created_at)
          VALUES (?, ?, ?, ?, 'normal', 'message', ?)`).bind(messageId, conversationId, identity.staffId, message, now),
        db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId),
        db.prepare(`INSERT INTO message_receipts (message_id, department_id, delivered_at)
          VALUES (?, ?, ?)`).bind(messageId, target.id, now),
      ]);
    }

    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: status === 'pending' ? `${type}.undone` : `${type}.updated`,
      entityType: type,
      entityId: id,
      metadata: { itemNumber, previousStatus: existing?.status ?? null, status, conversationId, messageId },
    });

    return Response.json({ id, itemNumber, status, conversationId, messageId, updatedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update the status board' }, { status: 500 });
  }
}
