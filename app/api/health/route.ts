import { getDatabase } from '@/lib/backend/runtime';

// No auth required - this exists so something outside the app (the cron
// Worker, or a person checking by hand) can ask "is this actually working"
// without needing a staff PIN. It only reports whether the database can be
// reached, since that's the one dependency that would take the whole system
// down if it failed.
export async function GET() {
  try {
    const db = getDatabase();
    await db.prepare('SELECT 1').first();
    return Response.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 503 });
  }
}
