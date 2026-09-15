import { appendAuditEvent } from '@/lib/backend/audit';
import { getDatabase } from '@/lib/backend/runtime';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface ShiftEventRow {
  id: string;
  event: 'start' | 'end';
  shift_label: string | null;
  staff_label: string;
  created_at: string;
}

async function resolveDepartment(db: D1Database, name: string) {
  const department = await db.prepare('SELECT id, hotel_id FROM departments WHERE name = ?')
    .bind(name).first<DepartmentRow>();
  if (!department) throw new Response('Unknown department', { status: 404 });
  return department;
}

function mapRow(row: ShiftEventRow) {
  return {
    id: row.id,
    event: row.event,
    shiftLabel: row.shift_label,
    staffLabel: row.staff_label,
    createdAt: row.created_at,
  };
}

// No sign-in on this board (same convention as maintenance tickets,
// approval requests and every other department page here) - whoever is
// on shift just taps Start or End, no PIN session needed.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const departmentName = url.searchParams.get('department');
    if (!departmentName) return Response.json({ error: 'department is required' }, { status: 400 });
    const department = await resolveDepartment(db, departmentName);
    const rows = await db.prepare(`SELECT id, event, shift_label, staff_label, created_at
        FROM shift_events WHERE department_id = ? ORDER BY created_at DESC LIMIT 20`)
      .bind(department.id).all<ShiftEventRow>();
    const events = rows.results.map(mapRow);
    return Response.json({ current: events[0] ?? null, events });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load shift status' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const body = (await request.json()) as { department?: string; event?: 'start' | 'end'; shiftLabel?: string; staffLabel?: string };
    if (!body.department) return Response.json({ error: 'Department is required' }, { status: 400 });
    if (body.event !== 'start' && body.event !== 'end') return Response.json({ error: 'event must be start or end' }, { status: 400 });
    const department = await resolveDepartment(db, body.department);

    const last = await db.prepare(`SELECT event FROM shift_events WHERE department_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(department.id).first<{ event: string }>();
    if (last?.event === body.event) {
      return Response.json({ error: body.event === 'start' ? 'Shift already started' : 'Shift already ended' }, { status: 409 });
    }

    const staffLabel = body.staffLabel?.trim() || body.department.trim();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO shift_events (id, hotel_id, department_id, event, shift_label, staff_label, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, department.hotel_id, department.id, body.event, body.shiftLabel?.trim() || null, staffLabel, now)
      .run();
    await appendAuditEvent(db, {
      hotelId: department.hotel_id, actorStaffId: null, actorDepartmentId: department.id,
      action: `shift.${body.event}`, entityType: 'shift_event', entityId: id,
      metadata: { shiftLabel: body.shiftLabel, staffLabel },
    });

    return Response.json({ id, event: body.event, createdAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to record that shift change' }, { status: 500 });
  }
}
