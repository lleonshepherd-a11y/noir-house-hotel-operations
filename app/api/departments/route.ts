import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const departments = await db.prepare(`SELECT id, name, slug FROM departments
      WHERE hotel_id = ? ORDER BY name`).bind(identity.hotelId).all();
    return Response.json({ departments: departments.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load departments' }, { status: 500 });
  }
}
