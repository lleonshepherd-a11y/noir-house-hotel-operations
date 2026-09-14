import { appendAuditEvent } from '@/lib/backend/audit';
import { getDatabase } from '@/lib/backend/runtime';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface RequestRow {
  id: string;
  hotel_id: string;
  department_id: string;
  department_name: string;
  requested_by_label: string;
  title: string;
  details: string | null;
  status: 'pending' | 'approved' | 'declined';
  decided_by_label: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

async function resolveDepartment(db: D1Database, name: string) {
  const department = await db.prepare('SELECT id, hotel_id FROM departments WHERE name = ?')
    .bind(name).first<DepartmentRow>();
  if (!department) throw new Response('Unknown department', { status: 404 });
  return department;
}

// No explicit hotel to scope to when listing hotel-wide pending requests
// (the General Manager board has no sign-in, same as every other board
// here) - "the oldest hotel" is the deterministic stand-in for "the real
// one" now that test/onboarding hotels can also exist in this database.
async function resolveHotel(db: D1Database) {
  return db.prepare('SELECT id FROM hotels ORDER BY created_at ASC LIMIT 1').first<{ id: string }>();
}

function mapRow(row: RequestRow) {
  return {
    id: row.id,
    department: row.department_name,
    requestedBy: row.requested_by_label,
    title: row.title,
    details: row.details,
    status: row.status,
    decidedBy: row.decided_by_label,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

const SELECT = `SELECT ar.id, ar.hotel_id, ar.department_id, d.name AS department_name,
    ar.requested_by_label, ar.title, ar.details, ar.status, ar.decided_by_label,
    ar.decision_note, ar.created_at, ar.decided_at
  FROM approval_requests ar JOIN departments d ON d.id = ar.department_id`;

// No sign-in on this board (same as maintenance tickets / fridge readings /
// guest requests) - any department can raise a request, and the General
// Manager board can see every pending one, without a PIN session.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const departmentName = url.searchParams.get('department');
    const pendingOnly = url.searchParams.get('pending') === '1';

    if (departmentName) {
      const department = await resolveDepartment(db, departmentName);
      const rows = await db.prepare(`${SELECT} WHERE ar.department_id = ? ORDER BY ar.created_at DESC LIMIT 50`)
        .bind(department.id).all<RequestRow>();
      return Response.json({ requests: rows.results.map(mapRow) });
    }

    const hotel = await resolveHotel(db);
    if (!hotel) return Response.json({ requests: [] });
    const statusClause = pendingOnly ? "AND ar.status = 'pending'" : '';
    const rows = await db.prepare(`${SELECT} WHERE ar.hotel_id = ? ${statusClause} ORDER BY ar.created_at ASC LIMIT 100`)
      .bind(hotel.id).all<RequestRow>();
    return Response.json({ requests: rows.results.map(mapRow) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load approval requests' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const body = (await request.json()) as {
      department?: string;
      title?: string;
      details?: string;
      requestedBy?: string;
    };
    if (!body.department) return Response.json({ error: 'Department is required' }, { status: 400 });
    const title = body.title?.trim();
    if (!title) return Response.json({ error: 'A title is required' }, { status: 400 });
    const requestedBy = body.requestedBy?.trim() || body.department.trim();
    const department = await resolveDepartment(db, body.department);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO approval_requests
        (id, hotel_id, department_id, requested_by_label, title, details, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(id, department.hotel_id, department.id, requestedBy, title, body.details?.trim() || null, now)
      .run();
    await appendAuditEvent(db, {
      hotelId: department.hotel_id, actorStaffId: null, actorDepartmentId: department.id,
      action: 'approval_request.requested', entityType: 'approval_request', entityId: id,
      metadata: { title, requestedBy },
    });

    return Response.json({ id, status: 'pending', createdAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to raise that request' }, { status: 500 });
  }
}

// One tap, one outcome: the UPDATE only takes effect while the request is
// still 'pending', so a second approve/decline (or a retried request) can't
// silently overwrite the first decision - it comes back as a 409 instead.
// The decision is also written to the existing tamper-evident audit_events
// hash chain, so who decided it, when, and what they decided is preserved
// even if the row itself were ever edited directly.
export async function PATCH(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
    const body = (await request.json()) as { decision?: 'approved' | 'declined'; decidedBy?: string; note?: string };
    if (body.decision !== 'approved' && body.decision !== 'declined') {
      return Response.json({ error: 'decision must be approved or declined' }, { status: 400 });
    }
    const existing = await db.prepare('SELECT hotel_id, department_id, title, status FROM approval_requests WHERE id = ?')
      .bind(id).first<{ hotel_id: string; department_id: string; title: string; status: string }>();
    if (!existing) return Response.json({ error: 'Unknown request' }, { status: 404 });

    const decidedBy = body.decidedBy?.trim() || 'General Manager';
    const note = body.note?.trim() || null;
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE approval_requests
        SET status = ?, decided_by_label = ?, decision_note = ?, decided_at = ?
        WHERE id = ? AND status = 'pending'`)
      .bind(body.decision, decidedBy, note, now, id).run();
    if (!result.meta.changes) return Response.json({ error: 'This request was already decided' }, { status: 409 });

    await appendAuditEvent(db, {
      hotelId: existing.hotel_id, actorStaffId: null, actorDepartmentId: existing.department_id,
      action: `approval_request.${body.decision}`, entityType: 'approval_request', entityId: id,
      metadata: { title: existing.title, decidedBy, note },
    });

    return Response.json({ id, status: body.decision, decidedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to record that decision' }, { status: 500 });
  }
}
