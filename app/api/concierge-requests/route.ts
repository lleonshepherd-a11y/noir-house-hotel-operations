import { getDatabase } from '@/lib/backend/runtime';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface RequestRow {
  id: string;
  room_number: string | null;
  guest_name: string | null;
  request_type: string;
  details: string;
  status: 'open' | 'arranged' | 'confirmed';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

async function resolveDepartment(db: D1Database, request: Request) {
  const url = new URL(request.url);
  const departmentName = url.searchParams.get('department');
  if (!departmentName) throw new Response('department is required', { status: 400 });
  const department = await db.prepare('SELECT id, hotel_id FROM departments WHERE name = ?')
    .bind(departmentName).first<DepartmentRow>();
  if (!department) throw new Response('Unknown department', { status: 404 });
  return department;
}

function mapRow(row: RequestRow) {
  return {
    id: row.id,
    roomNumber: row.room_number,
    guestName: row.guest_name,
    requestType: row.request_type,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

// No sign-in on this board (same convention as maintenance tickets,
// fridge readings, guest requests) - the concierge desk raises and
// advances a request without a PIN.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const includeConfirmed = url.searchParams.get('includeConfirmed') === '1';
    const rows = await db.prepare(`SELECT id, room_number, guest_name, request_type, details, status,
        created_at, updated_at, resolved_at
      FROM concierge_requests
      WHERE department_id = ? ${includeConfirmed ? '' : "AND status != 'confirmed'"}
      ORDER BY created_at DESC LIMIT 100`)
      .bind(department.id).all<RequestRow>();
    return Response.json({ requests: rows.results.map(mapRow) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load concierge requests' }, { status: 500 });
  }
}

const VALID_TYPES = new Set(['restaurant', 'transport', 'tickets', 'recommendation', 'luggage', 'other']);

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const body = (await request.json()) as {
      roomNumber?: string;
      guestName?: string;
      requestType?: string;
      details?: string;
    };
    const details = body.details?.trim();
    if (!details) return Response.json({ error: 'A description is required' }, { status: 400 });
    const requestType = body.requestType && VALID_TYPES.has(body.requestType) ? body.requestType : 'other';

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO concierge_requests
        (id, hotel_id, department_id, room_number, guest_name, request_type, details, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
      .bind(id, department.hotel_id, department.id, body.roomNumber?.trim() || null, body.guestName?.trim() || null, requestType, details, now, now)
      .run();

    return Response.json({ id, status: 'open', createdAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to log that request' }, { status: 500 });
  }
}

const NEXT_STATUS: Record<string, 'arranged' | 'confirmed'> = { open: 'arranged', arranged: 'confirmed' };

// Advances a request through its one straight line (open -> arranged ->
// confirmed), same "nothing to choose" pattern as maintenance tickets.
export async function PATCH(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
    const existing = await db.prepare('SELECT status FROM concierge_requests WHERE id = ?').bind(id).first<{ status: string }>();
    if (!existing) return Response.json({ error: 'Unknown request' }, { status: 404 });
    const nextStatus = NEXT_STATUS[existing.status];
    if (!nextStatus) return Response.json({ error: 'Request is already confirmed' }, { status: 400 });
    const now = new Date().toISOString();
    await db.prepare(`UPDATE concierge_requests SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?`)
      .bind(nextStatus, now, nextStatus === 'confirmed' ? now : null, id).run();
    return Response.json({ id, status: nextStatus });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update that request' }, { status: 500 });
  }
}
