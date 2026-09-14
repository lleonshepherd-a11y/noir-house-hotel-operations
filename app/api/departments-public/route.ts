import { getDatabase } from '@/lib/backend/runtime';

// Public and unauthenticated on purpose, same reasoning as /api/hotels: a
// department name isn't sensitive, and staff need to see the real list to
// sign in at all - there's no session yet to gate this behind.
//
// Names are deduplicated because the dropdown itself has no concept of
// "which hotel" (see the login flow's own comment on that). Once two
// hotels genuinely share a department name, signing in with it correctly
// refuses with a clear error (see startDepartmentSession) rather than
// guessing which hotel to sign into - this list just can't tell them apart
// visually yet.
export async function GET() {
  try {
    const db = await getDatabase();
    const rows = await db.prepare('SELECT DISTINCT name FROM departments ORDER BY name').all<{ name: string }>();
    // Different hotels can end up with the same department name in different
    // casing (e.g. a test hotel's "kitchen" next to the real "Kitchen") -
    // collapse those together instead of showing both, preferring whichever
    // casing starts with a capital letter.
    const byKey = new Map<string, string>();
    for (const row of rows.results) {
      const key = row.name.trim().toLowerCase();
      const existing = byKey.get(key);
      if (!existing || (/^[a-z]/.test(existing) && !/^[a-z]/.test(row.name))) byKey.set(key, row.name);
    }
    const departments = Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
    return Response.json({ departments });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load departments' }, { status: 500 });
  }
}
