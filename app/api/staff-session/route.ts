import { getDatabase, bearerToken } from '@/lib/backend/runtime';
import { endStaffSession, requireStaffSession, startDepartmentSession, startStaffSession } from '@/lib/backend/sessions';

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const department = await db.prepare('SELECT name FROM departments WHERE id = ? AND hotel_id = ?')
      .bind(identity.departmentId, identity.hotelId)
      .first<{ name: string }>();
    const hotel = await db.prepare('SELECT name, logo_object_key FROM hotels WHERE id = ?')
      .bind(identity.hotelId).first<{ name: string; logo_object_key: string | null }>();
    return Response.json({
      identity,
      departmentName: department?.name ?? null,
      hotelName: hotel?.name ?? null,
      hasLogo: !!hotel?.logo_object_key,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to read staff session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { staffId?: string; department?: string; pin?: string; hotelId?: string };
    if (!body.pin || (!body.staffId && !body.department)) return Response.json({ error: 'Department and PIN are required' }, { status: 400 });
    const db = getDatabase();
    return Response.json(body.department
      ? await startDepartmentSession(db, body.department, body.pin, body.hotelId)
      : await startStaffSession(db, body.staffId!, body.pin));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('staff-session error', error instanceof Error ? error.stack : error);
    return Response.json({ error: 'Unable to start staff session' }, { status: 500 });
  }

}

export async function DELETE(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: 'Staff session required' }, { status: 401 });
  await endStaffSession(await getDatabase(), token);
  return new Response(null, { status: 204 });
}
