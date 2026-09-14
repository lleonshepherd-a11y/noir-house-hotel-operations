import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { endManagerSession, loginManager, requireManagerSession } from '@/lib/backend/managerSessions';

// The mobile app's own login for named individuals (department heads),
// separate from the dashboard's shared per-department PIN console
// (see /api/staff-session). No signup here - an owner creates the
// account via /api/owner/managers, this only authenticates against it.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireManagerSession(db, bearerToken(request));
    const [hotel, department, manager] = await Promise.all([
      db.prepare('SELECT name FROM hotels WHERE id = ?').bind(identity.hotelId).first<{ name: string }>(),
      db.prepare('SELECT name FROM departments WHERE id = ?').bind(identity.departmentId).first<{ name: string }>(),
      db.prepare('SELECT name FROM managers WHERE id = ?').bind(identity.managerId).first<{ name: string }>(),
    ]);
    return Response.json({
      identity,
      hotelName: hotel?.name ?? null,
      departmentName: department?.name ?? null,
      managerName: manager?.name ?? null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to read manager session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) return Response.json({ error: 'Email and password are required' }, { status: 400 });
    const db = getDatabase();
    return Response.json(await loginManager(db, body.email, body.password));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('manager-session error', error instanceof Error ? error.stack : error);
    return Response.json({ error: 'Unable to start manager session' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: 'Manager session required' }, { status: 401 });
  await endManagerSession(await getDatabase(), token);
  return new Response(null, { status: 204 });
}
