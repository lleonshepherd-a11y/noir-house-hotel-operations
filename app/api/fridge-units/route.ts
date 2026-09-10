import { getDatabase } from '@/lib/backend/runtime';
import { currentSession, todayKey } from '@/lib/backend/fridge';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface UnitRow {
  id: string;
  name: string;
  kind: string;
  position: number;
}

interface LatestReadingRow {
  unit_id: string;
  reading_c: number;
  status: string;
  logged_at: string;
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
    const session = currentSession();

    const units = (await db.prepare(`SELECT id, name, kind, position FROM fridge_units
        WHERE department_id = ? AND active = 1 ORDER BY kind, position, name`)
      .bind(department.id).all<UnitRow>()).results;

    const latest = units.length
      ? (await db.prepare(`SELECT r.unit_id, r.reading_c, r.status, r.logged_at
          FROM fridge_readings r
          WHERE r.department_id = ? AND r.reading_date = ? AND r.session = ?
            AND r.logged_at = (
              SELECT MAX(r2.logged_at) FROM fridge_readings r2
              WHERE r2.unit_id = r.unit_id AND r2.reading_date = ? AND r2.session = ?
            )`)
          .bind(department.id, date, session, date, session).all<LatestReadingRow>()).results
      : [];
    const byUnit = new Map(latest.map((row) => [row.unit_id, row]));

    const results = units.map((unit) => {
      const reading = byUnit.get(unit.id);
      return {
        id: unit.id,
        name: unit.name,
        kind: unit.kind,
        checkedToday: Boolean(reading),
        readingC: reading?.reading_c ?? null,
        status: reading?.status ?? null,
        loggedAt: reading?.logged_at ?? null,
      };
    });

    return Response.json({
      date,
      session,
      units: results,
      doneCount: latest.length,
      totalCount: units.length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load fridge units' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const body = (await request.json()) as { name?: string; kind?: string };
    const name = (body.name || '').trim();
    const kind = body.kind === 'freezer' ? 'freezer' : body.kind === 'fridge' ? 'fridge' : null;
    if (!name || !kind) return Response.json({ error: 'name and kind are required' }, { status: 400 });

    const maxPositionRow = await db.prepare(`SELECT MAX(position) AS maxPos FROM fridge_units WHERE department_id = ? AND kind = ?`)
      .bind(department.id, kind).first<{ maxPos: number | null }>();
    const position = (maxPositionRow?.maxPos ?? -1) + 1;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO fridge_units (id, hotel_id, department_id, name, kind, position, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(id, department.hotel_id, department.id, name, kind, position, now).run();

    return Response.json({ id, name, kind, checkedToday: false, readingC: null, status: null, loggedAt: null }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to add unit' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const unitId = url.searchParams.get('unitId');
    if (!unitId) return Response.json({ error: 'unitId is required' }, { status: 400 });
    const body = (await request.json()) as { name?: string };
    const name = (body.name || '').trim();
    if (!name) return Response.json({ error: 'name is required' }, { status: 400 });

    await db.prepare('UPDATE fridge_units SET name = ? WHERE id = ? AND department_id = ?')
      .bind(name, unitId, department.id).run();

    return Response.json({ id: unitId, name });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to rename unit' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const unitId = url.searchParams.get('unitId');
    if (!unitId) return Response.json({ error: 'unitId is required' }, { status: 400 });

    await db.prepare('UPDATE fridge_units SET active = 0 WHERE id = ? AND department_id = ?')
      .bind(unitId, department.id).run();

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to remove unit' }, { status: 500 });
  }
}
