import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { createManager } from '@/lib/backend/managerSessions';
import { requireOwnerSession } from '@/lib/backend/ownerSessions';

interface ManagerRow {
  id: string;
  name: string;
  email: string;
  department_name: string;
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const rows = await db.prepare(`SELECT m.id, m.name, m.email, d.name AS department_name
        FROM managers m JOIN departments d ON d.id = m.department_id
        WHERE m.hotel_id = ? AND m.active = 1 ORDER BY d.name, m.name`)
      .bind(identity.hotelId).all<ManagerRow>();
    return Response.json({
      managers: rows.results.map((row) => ({ id: row.id, name: row.name, email: row.email, department: row.department_name })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load managers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const body = (await request.json()) as { name?: string; departmentId?: string; email?: string; password?: string };
    if (!body.departmentId) return Response.json({ error: 'A department is required' }, { status: 400 });
    if (!body.name?.trim()) return Response.json({ error: 'A name is required' }, { status: 400 });
    if (!body.email?.trim()) return Response.json({ error: 'An email is required' }, { status: 400 });
    if (!body.password) return Response.json({ error: 'A password is required' }, { status: 400 });

    const department = await db.prepare('SELECT id FROM departments WHERE id = ? AND hotel_id = ?')
      .bind(body.departmentId, identity.hotelId).first<{ id: string }>();
    if (!department) return Response.json({ error: 'Unknown department' }, { status: 404 });

    const manager = await createManager(db, identity.hotelId, body.departmentId, body.name, body.email, body.password);
    return Response.json(manager, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to add that manager' }, { status: 500 });
  }
}
