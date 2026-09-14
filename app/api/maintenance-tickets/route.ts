import { getDatabase } from '@/lib/backend/runtime';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface TicketRow {
  id: string;
  room_number: string | null;
  description: string;
  photo_path: string | null;
  status: 'reported' | 'in_progress' | 'fixed';
  priority: string;
  guest_present: number;
  deadline: string | null;
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

function mapRow(row: TicketRow) {
  return {
    id: row.id,
    roomNumber: row.room_number,
    description: row.description,
    photoPath: row.photo_path,
    status: row.status,
    priority: row.priority,
    guestPresent: !!row.guest_present,
    deadline: row.deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

// No sign-in on this page (same as fridge/food-temp/checklist) - the
// engineer at the board raises and updates tickets without a PIN.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const includeFixed = url.searchParams.get('includeFixed') === '1';
    const rows = await db.prepare(`SELECT id, room_number, description, photo_path, status, priority,
        guest_present, deadline, created_at, updated_at, resolved_at
      FROM maintenance_tickets
      WHERE department_id = ? ${includeFixed ? '' : "AND status != 'fixed'"}
      ORDER BY (priority = 'urgent') DESC, created_at DESC LIMIT 100`)
      .bind(department.id).all<TicketRow>();
    return Response.json({ tickets: rows.results.map(mapRow) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load maintenance tickets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const body = (await request.json()) as {
      roomNumber?: string;
      description?: string;
      priority?: 'problem' | 'urgent';
      guestPresent?: boolean;
    };
    const description = body.description?.trim();
    if (!description) return Response.json({ error: 'A description is required' }, { status: 400 });
    const priority = body.priority === 'urgent' ? 'urgent' : 'problem';

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO maintenance_tickets
        (id, hotel_id, department_id, room_number, description, status, priority, guest_present, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'reported', ?, ?, ?, ?)`)
      .bind(id, department.hotel_id, department.id, body.roomNumber?.trim() || null, description, priority, body.guestPresent ? 1 : 0, now, now)
      .run();

    return Response.json({ id, status: 'reported', createdAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to raise that ticket' }, { status: 500 });
  }
}

const NEXT_STATUS: Record<string, 'in_progress' | 'fixed'> = { reported: 'in_progress', in_progress: 'fixed' };

// Advances a ticket to its next status (reported -> in_progress ->
// fixed) - a maintenance ticket's whole lifecycle is that one straight
// line, so there's nothing to pick, just "move it on".
export async function PATCH(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
    const ticket = await db.prepare('SELECT status FROM maintenance_tickets WHERE id = ?').bind(id).first<{ status: string }>();
    if (!ticket) return Response.json({ error: 'Unknown ticket' }, { status: 404 });
    const nextStatus = NEXT_STATUS[ticket.status];
    if (!nextStatus) return Response.json({ error: 'Ticket is already fixed' }, { status: 400 });
    const now = new Date().toISOString();
    await db.prepare(`UPDATE maintenance_tickets SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?`)
      .bind(nextStatus, now, nextStatus === 'fixed' ? now : null, id).run();
    return Response.json({ id, status: nextStatus });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update that ticket' }, { status: 500 });
  }
}
