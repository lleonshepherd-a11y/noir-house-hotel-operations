import { appendAuditEvent } from '@/lib/backend/audit';
import { createSessionToken } from '@/lib/backend/security';
import { getDatabase } from '@/lib/backend/runtime';

// Unlike every other route in this app, this one has no staff PIN behind it -
// a hotel guest reaches it straight from a QR code in their room, with no
// account to sign into. The access token returned on POST stands in for
// that: it's the one thing that lets this same guest read back their own
// reply later without being able to see anyone else's request.
const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const body = (await request.json()) as { room?: string; message?: string; urgency?: string; hotel?: string };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return Response.json({ error: 'Message is required' }, { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) return Response.json({ error: 'Message is too long' }, { status: 400 });
    const room = typeof body.room === 'string' && body.room.trim() ? body.room.trim().slice(0, 20) : null;
    const urgency = body.urgency === 'urgent' ? 'urgent' : 'normal';

    const hotel = body.hotel
      ? await db.prepare('SELECT id FROM hotels WHERE id = ?').bind(body.hotel).first<{ id: string }>()
      : await db.prepare('SELECT id FROM hotels ORDER BY created_at ASC LIMIT 1').first<{ id: string }>();
    if (!hotel) return Response.json({ error: 'Unable to reach the hotel team' }, { status: 503 });

    const department = await db.prepare(`SELECT id FROM departments WHERE hotel_id = ? AND slug = 'front-of-house'`)
      .bind(hotel.id).first<{ id: string }>();

    const id = crypto.randomUUID();
    const accessToken = createSessionToken();
    const now = new Date().toISOString();
    const subject = room ? `Guest request, Room ${room}` : 'Guest request';
    await db.prepare(`INSERT INTO guest_requests
      (id, hotel_id, assigned_department_id, guest_reference, subject, body, status, urgency, access_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`).bind(
        id, hotel.id, department?.id ?? null, room, subject, message, urgency, accessToken, now, now,
      ).run();

    if (department) {
      await db.prepare(`INSERT INTO realtime_events
        (hotel_id, department_id, event_type, entity_type, entity_id, payload_json, created_at)
        VALUES (?, ?, 'guest_request.created', 'guest_request', ?, ?, ?)`).bind(
          hotel.id, department.id, id, JSON.stringify({ room, urgency }), now,
        ).run();
    }

    await appendAuditEvent(db, {
      hotelId: hotel.id,
      actorStaffId: null,
      actorDepartmentId: null,
      action: 'guest_request.created',
      entityType: 'guest_request',
      entityId: id,
      metadata: { room, urgency },
    });

    return Response.json({ id, accessToken, createdAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to send your message' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    if (!id || !token) return Response.json({ error: 'id and token are required' }, { status: 400 });
    const record = await db.prepare(`SELECT status, reply_body, replied_at FROM guest_requests
      WHERE id = ? AND access_token = ?`).bind(id, token)
      .first<{ status: string; reply_body: string | null; replied_at: string | null }>();
    if (!record) return new Response('Not found', { status: 404 });
    return Response.json({
      status: record.status,
      reply: record.reply_body,
      repliedAt: record.replied_at,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to check your request' }, { status: 500 });
  }
}
