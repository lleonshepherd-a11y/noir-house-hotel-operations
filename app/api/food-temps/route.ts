import { appendAuditEvent } from '@/lib/backend/audit';
import { getDatabase } from '@/lib/backend/runtime';
import { FOOD_TEMP_LIMITS, foodReadingInRange, type FoodCheckType } from '@/lib/backend/foodSafety';

interface DepartmentRow {
  id: string;
  hotel_id: string;
}

interface LogRow {
  id: string;
  check_type: FoodCheckType;
  item_name: string;
  supplier: string | null;
  reading_c: number;
  in_range: number;
  packaging_ok: number | null;
  use_by_ok: number | null;
  quantity_ok: number | null;
  corrective_action: string | null;
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

function mapRow(row: LogRow) {
  return {
    id: row.id,
    checkType: row.check_type,
    itemName: row.item_name,
    supplier: row.supplier,
    readingC: row.reading_c,
    inRange: Boolean(row.in_range),
    packagingOk: row.packaging_ok === null ? null : Boolean(row.packaging_ok),
    useByOk: row.use_by_ok === null ? null : Boolean(row.use_by_ok),
    quantityOk: row.quantity_ok === null ? null : Boolean(row.quantity_ok),
    correctiveAction: row.corrective_action,
    loggedAt: row.logged_at,
  };
}

// No staff sign-in on this page, same as the fridge/freezer checks and daily
// checklist, so history is a plain append-only log rather than anything
// scoped to who logged it.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const days = Math.min(Number(url.searchParams.get('days') || 1), 90);
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
    const checkType = url.searchParams.get('type');

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const since = sinceDate.toISOString();

    const rows = checkType
      ? (await db.prepare(`SELECT id, check_type, item_name, supplier, reading_c, in_range, packaging_ok, use_by_ok, quantity_ok, corrective_action, logged_at
            FROM food_temperature_logs WHERE department_id = ? AND check_type = ? AND logged_at >= ?
            ORDER BY logged_at DESC LIMIT ?`)
          .bind(department.id, checkType, since, limit).all<LogRow>()).results
      : (await db.prepare(`SELECT id, check_type, item_name, supplier, reading_c, in_range, packaging_ok, use_by_ok, quantity_ok, corrective_action, logged_at
            FROM food_temperature_logs WHERE department_id = ? AND logged_at >= ?
            ORDER BY logged_at DESC LIMIT ?`)
          .bind(department.id, since, limit).all<LogRow>()).results;

    return Response.json({ entries: rows.map(mapRow), limits: FOOD_TEMP_LIMITS });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load food temperature log' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const body = (await request.json()) as {
      checkType?: string;
      itemName?: string;
      supplier?: string;
      readingC?: number;
      packagingOk?: boolean;
      useByOk?: boolean;
      quantityOk?: boolean;
      correctiveAction?: string;
    };

    const checkType = body.checkType as FoodCheckType;
    if (!checkType || !(checkType in FOOD_TEMP_LIMITS)) {
      return Response.json({ error: 'Unknown check type' }, { status: 400 });
    }
    const itemName = body.itemName?.trim();
    if (!itemName) return Response.json({ error: 'An item or delivery name is required' }, { status: 400 });
    if (typeof body.readingC !== 'number' || Number.isNaN(body.readingC)) {
      return Response.json({ error: 'A numeric reading is required' }, { status: 400 });
    }

    const isDelivery = checkType === 'delivery_chilled' || checkType === 'delivery_frozen';
    const inRange = foodReadingInRange(checkType, body.readingC);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const correctiveAction = body.correctiveAction?.trim() || null;

    await db.prepare(`INSERT INTO food_temperature_logs
        (id, hotel_id, department_id, check_type, item_name, supplier, reading_c, in_range, packaging_ok, use_by_ok, quantity_ok, corrective_action, logged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        department.hotel_id,
        department.id,
        checkType,
        itemName,
        isDelivery ? body.supplier?.trim() || null : null,
        body.readingC,
        inRange ? 1 : 0,
        isDelivery && typeof body.packagingOk === 'boolean' ? (body.packagingOk ? 1 : 0) : null,
        isDelivery && typeof body.useByOk === 'boolean' ? (body.useByOk ? 1 : 0) : null,
        isDelivery && typeof body.quantityOk === 'boolean' ? (body.quantityOk ? 1 : 0) : null,
        correctiveAction,
        now,
      )
      .run();

    if (!inRange) {
      // Same pattern as the fridge alert: nobody is signed in on this page,
      // so raise a real urgent task straight on Kitchen's own board instead
      // of only a silent audit-log entry.
      const limit = FOOD_TEMP_LIMITS[checkType];
      const ruleText = limit.compare === 'min' ? `${limit.limitC}C or above` : `${limit.limitC}C or below`;
      const taskId = crypto.randomUUID();
      await db.prepare(`INSERT INTO tasks
          (id, hotel_id, assigned_department_id, created_by_staff_id, title, details, priority, status, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?, 'urgent', 'open', ?, ?)`)
        .bind(
          taskId,
          department.hotel_id,
          department.id,
          `${itemName} out of limit: ${body.readingC}C (${limit.label})`,
          `Required: ${ruleText}.${correctiveAction ? ` Note logged: ${correctiveAction}` : ''}`,
          now,
          now,
        ).run();

      await appendAuditEvent(db, {
        hotelId: department.hotel_id,
        actorStaffId: null,
        actorDepartmentId: department.id,
        action: 'food_temperature.out_of_range',
        entityType: 'food_temperature_log',
        entityId: id,
        metadata: { checkType, itemName, readingC: body.readingC, taskId },
      });
    }

    return Response.json({ id, checkType, itemName, readingC: body.readingC, inRange, loggedAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to log reading' }, { status: 500 });
  }
}
