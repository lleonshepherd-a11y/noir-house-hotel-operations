import { getDatabase } from '@/lib/backend/runtime';
import { todayKey } from '@/lib/backend/foodSafety';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

async function resolveDepartment(db: D1Database, request: Request) {
  const url = new URL(request.url);
  const departmentName = url.searchParams.get('department');
  if (!departmentName) throw new Response('department is required', { status: 400 });
  const department = await db.prepare('SELECT id, hotel_id FROM departments WHERE name = ?')
    .bind(departmentName).first<DepartmentRow>();
  if (!department) throw new Response('Unknown department', { status: 404 });
  return department;
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const date = todayKey();
    const row = await db.prepare('SELECT checked_at FROM probe_checks WHERE department_id = ? AND checked_date = ?')
      .bind(department.id, date).first<{ checked_at: string }>();
    return Response.json({ checkedToday: !!row, checkedAt: row?.checked_at ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load probe check status' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const date = todayKey();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO probe_checks (id, hotel_id, department_id, checked_date, checked_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(department_id, checked_date) DO UPDATE SET checked_at = excluded.checked_at`)
      .bind(crypto.randomUUID(), department.hotel_id, department.id, date, now).run();
    return Response.json({ checkedToday: true, checkedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to log probe check' }, { status: 500 });
  }
}
