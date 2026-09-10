import { appendAuditEvent } from '@/lib/backend/audit';
import { assertDepartmentInHotel } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { fridgeReadingInRange, fridgeUnitsForSlug } from '@/lib/backend/foodSafety';
import { isManagement, type StaffIdentity } from '@/lib/backend/types';

interface LatestRow {
  unit_key: string;
  reading_c: number;
  in_range: number;
  corrective_action: string | null;
  logged_at: string;
  display_name: string;
}

interface RecentRow extends LatestRow {
  id: string;
}

async function resolveDepartment(db: D1Database, request: Request, identity: StaffIdentity) {
  const url = new URL(request.url);
  const departmentId = url.searchParams.get('departmentId') ?? identity.departmentId;
  if (departmentId !== identity.departmentId) {
    if (!isManagement(identity)) throw new Response('Forbidden', { status: 403 });
    await assertDepartmentInHotel(db, departmentId, identity.hotelId);
  }
  const department = await db.prepare('SELECT slug FROM departments WHERE id = ? AND hotel_id = ?')
    .bind(departmentId, identity.hotelId).first<{ slug: string }>();
  if (!department) throw new Response('Not found', { status: 404 });
  return { departmentId, slug: department.slug };
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const { departmentId, slug } = await resolveDepartment(db, request, identity);
    const units = fridgeUnitsForSlug(slug);
    const today = new Date().toISOString().slice(0, 10);

    const latestRows = units.length
      ? (await db.prepare(`SELECT f.unit_key, f.reading_c, f.in_range, f.corrective_action, f.logged_at, s.display_name
          FROM fridge_temperature_logs f
          JOIN staff s ON s.id = f.logged_by_staff_id
          WHERE f.department_id = ? AND f.logged_at LIKE ? || '%'
          AND f.id IN (
            SELECT id FROM fridge_temperature_logs
            WHERE department_id = ? AND logged_at LIKE ? || '%'
            GROUP BY unit_key HAVING MAX(logged_at)
          )`)
          .bind(departmentId, today, departmentId, today).all<LatestRow>()).results
      : [];
    const latestByUnit = new Map(latestRows.map((row) => [row.unit_key, row]));

    const recent = (await db.prepare(`SELECT f.id, f.unit_key, f.reading_c, f.in_range, f.corrective_action, f.logged_at, s.display_name
        FROM fridge_temperature_logs f JOIN staff s ON s.id = f.logged_by_staff_id
        WHERE f.department_id = ? ORDER BY f.logged_at DESC LIMIT 20`)
      .bind(departmentId).all<RecentRow>()).results;

    const results = units.map((unit) => {
      const latest = latestByUnit.get(unit.key);
      return {
        ...unit,
        checkedToday: Boolean(latest),
        readingC: latest?.reading_c ?? null,
        inRange: latest ? Boolean(latest.in_range) : null,
        loggedAt: latest?.logged_at ?? null,
        loggedByName: latest?.display_name ?? null,
        correctiveAction: latest?.corrective_action ?? null,
      };
    });

    return Response.json({ date: today, units: results, recent });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load fridge temperatures' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const { departmentId, slug } = await resolveDepartment(db, request, identity);
    const body = (await request.json()) as { unitKey?: string; readingC?: number; correctiveAction?: string };
    const unit = fridgeUnitsForSlug(slug).find((candidate) => candidate.key === body.unitKey);
    if (!unit) return Response.json({ error: 'Unknown fridge or freezer unit' }, { status: 400 });
    if (typeof body.readingC !== 'number' || Number.isNaN(body.readingC)) {
      return Response.json({ error: 'A numeric reading is required' }, { status: 400 });
    }

    const inRange = fridgeReadingInRange(unit, body.readingC);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO fridge_temperature_logs
        (id, hotel_id, department_id, unit_key, reading_c, in_range, corrective_action, logged_by_staff_id, logged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, identity.hotelId, departmentId, unit.key, body.readingC, inRange ? 1 : 0,
        body.correctiveAction?.trim() || null, identity.staffId, now)
      .run();

    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'fridge_temperature.logged',
      entityType: 'fridge_temperature_log',
      entityId: id,
      metadata: { unitKey: unit.key, readingC: body.readingC, inRange },
    });

    return Response.json({ id, unitKey: unit.key, readingC: body.readingC, inRange, loggedAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to log reading' }, { status: 500 });
  }
}
