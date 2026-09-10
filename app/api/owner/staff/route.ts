import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireOwnerSession } from '@/lib/backend/ownerSessions';
import { hashPin, validatePin } from '@/lib/backend/security';

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  department_name: string;
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const rows = await db.prepare(`SELECT s.id, s.display_name, s.role, d.name AS department_name
        FROM staff s JOIN departments d ON d.id = s.department_id
        WHERE s.hotel_id = ? AND s.active = 1 ORDER BY d.name, s.display_name`)
      .bind(identity.hotelId).all<StaffRow>();
    return Response.json({
      staff: rows.results.map((row) => ({ id: row.id, displayName: row.display_name, role: row.role, department: row.department_name })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load staff' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const body = (await request.json()) as { displayName?: string; departmentId?: string; pin?: string; role?: string };
    const displayName = body.displayName?.trim();
    if (!displayName) return Response.json({ error: 'A name is required' }, { status: 400 });
    if (!body.departmentId) return Response.json({ error: 'A department is required' }, { status: 400 });
    if (!body.pin || !validatePin(body.pin)) return Response.json({ error: 'PIN must be 4 to 8 digits' }, { status: 400 });

    const department = await db.prepare('SELECT id FROM departments WHERE id = ? AND hotel_id = ?')
      .bind(body.departmentId, identity.hotelId).first<{ id: string }>();
    if (!department) return Response.json({ error: 'Unknown department' }, { status: 404 });

    const allowedRoles = new Set(['staff', 'supervisor', 'front_of_house', 'duty_manager', 'general_manager', 'admin']);
    const role = body.role && allowedRoles.has(body.role) ? body.role : 'staff';

    const { hash, salt } = await hashPin(body.pin);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO staff (id, hotel_id, department_id, display_name, role, pin_hash, pin_salt, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(id, identity.hotelId, body.departmentId, displayName, role, hash, salt, now, now).run();

    return Response.json({ id, displayName, role }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to add that staff member' }, { status: 500 });
  }
}
