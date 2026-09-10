import { getDatabase } from '@/lib/backend/runtime';

// Public and unauthenticated on purpose: staff need to pick their hotel
// before they have any session at all, and a hotel's name is not sensitive
// (the fixed department dropdown on this same screen was already public).
export async function GET() {
  try {
    const db = await getDatabase();
    const rows = await db.prepare('SELECT id, name FROM hotels ORDER BY name').all<{ id: string; name: string }>();
    return Response.json({ hotels: rows.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load hotels' }, { status: 500 });
  }
}
