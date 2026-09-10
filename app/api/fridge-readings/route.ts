import { appendAuditEvent } from '@/lib/backend/audit';
import { getDatabase } from '@/lib/backend/runtime';
import { currentSession, statusForReading, todayKey, type FridgeKind } from '@/lib/backend/fridge';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface UnitRow {
  id: string;
  kind: FridgeKind;
  name: string;
}

interface HistoryRow {
  id: string;
  unit_id: string;
  unit_name: string;
  reading_c: number;
  status: string;
  corrective_action: string | null;
  reading_date: string;
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

// History is a plain append-only log, so it just reads back whatever is
// there - the "nothing is ever overwritten" promise on the page is literal.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const unitId = url.searchParams.get('unitId');
    const days = Math.min(Number(url.searchParams.get('days') || 7), 90);
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const since = sinceDate.toISOString().slice(0, 10);

    const rows = unitId
      ? (await db.prepare(`SELECT r.id, r.unit_id, u.name AS unit_name, r.reading_c, r.status, r.corrective_action, r.reading_date, r.logged_at
            FROM fridge_readings r JOIN fridge_units u ON u.id = r.unit_id
            WHERE r.department_id = ? AND r.unit_id = ? AND r.reading_date >= ?
            ORDER BY r.logged_at DESC LIMIT ?`)
          .bind(department.id, unitId, since, limit).all<HistoryRow>()).results
      : (await db.prepare(`SELECT r.id, r.unit_id, u.name AS unit_name, r.reading_c, r.status, r.corrective_action, r.reading_date, r.logged_at
            FROM fridge_readings r JOIN fridge_units u ON u.id = r.unit_id
            WHERE r.department_id = ? AND r.reading_date >= ?
            ORDER BY r.logged_at DESC LIMIT ?`)
          .bind(department.id, since, limit).all<HistoryRow>()).results;

    return Response.json({ readings: rows });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const body = (await request.json()) as { unitId?: string; readingC?: number; correctiveAction?: string };
    const unitId = body.unitId;
    const readingC = typeof body.readingC === 'number' ? body.readingC : Number(body.readingC);
    if (!unitId || Number.isNaN(readingC)) return Response.json({ error: 'unitId and readingC are required' }, { status: 400 });

    const unit = await db.prepare('SELECT id, kind, name FROM fridge_units WHERE id = ? AND department_id = ? AND active = 1')
      .bind(unitId, department.id).first<UnitRow>();
    if (!unit) return Response.json({ error: 'Unknown unit' }, { status: 404 });

    const status = statusForReading(unit.kind, readingC);
    const now = new Date().toISOString();
    const date = todayKey();
    const session = currentSession();
    const id = crypto.randomUUID();
    const correctiveAction = (body.correctiveAction || '').trim() || null;

    await db.prepare(`INSERT INTO fridge_readings
        (id, hotel_id, department_id, unit_id, reading_c, status, corrective_action, reading_date, logged_at, session)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, department.hotel_id, department.id, unit.id, readingC, status, correctiveAction, date, now, session).run();

    if (status !== 'in_range') {
      // No staff is signed in on this page, so this can't go through the
      // normal messaging system (it requires a sender's staff session).
      // Instead it raises a real urgent task straight on Kitchen's own
      // board - the same board its head chef already sees, not the GM's -
      // since a fridge running warm is a kitchen problem, not a management
      // one.
      const safeRange = unit.kind === 'fridge' ? '1-5C' : '-18C or below';
      const direction = status === 'above_range' ? 'above' : 'below';
      const taskId = crypto.randomUUID();
      await db.prepare(`INSERT INTO tasks
          (id, hotel_id, assigned_department_id, created_by_staff_id, title, details, priority, status, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?, 'urgent', 'open', ?, ?)`)
        .bind(
          taskId,
          department.hotel_id,
          department.id,
          `${unit.name} reading ${direction} safe range: ${readingC}C`,
          `Safe range is ${safeRange}.${correctiveAction ? ` Note logged: ${correctiveAction}` : ''}`,
          now,
          now,
        ).run();

      await appendAuditEvent(db, {
        hotelId: department.hotel_id,
        actorStaffId: null,
        actorDepartmentId: department.id,
        action: 'fridge_reading.out_of_range',
        entityType: 'fridge_reading',
        entityId: id,
        metadata: { unitId: unit.id, readingC, status, correctiveAction, taskId },
      });
    }

    return Response.json({ id, readingC, status, loggedAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to log reading' }, { status: 500 });
  }
}
