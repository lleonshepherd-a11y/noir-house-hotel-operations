import { appendAuditEvent } from '@/lib/backend/audit';
import { assertDepartmentInHotel } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { FOOD_TEMP_LIMITS, foodReadingInRange, type FoodCheckType } from '@/lib/backend/foodSafety';
import { isManagement, type StaffIdentity } from '@/lib/backend/types';

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
  display_name: string;
}

async function resolveDepartment(db: D1Database, request: Request, identity: StaffIdentity) {
  const url = new URL(request.url);
  const departmentId = url.searchParams.get('departmentId') ?? identity.departmentId;
  if (departmentId !== identity.departmentId) {
    if (!isManagement(identity)) throw new Response('Forbidden', { status: 403 });
    await assertDepartmentInHotel(db, departmentId, identity.hotelId);
  }
  return departmentId;
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
    loggedByName: row.display_name,
  };
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const departmentId = await resolveDepartment(db, request, identity);

    const rows = (await db.prepare(`SELECT f.id, f.check_type, f.item_name, f.supplier, f.reading_c, f.in_range,
        f.packaging_ok, f.use_by_ok, f.quantity_ok, f.corrective_action, f.logged_at, s.display_name
        FROM food_temperature_logs f JOIN staff s ON s.id = f.logged_by_staff_id
        WHERE f.department_id = ? ORDER BY f.logged_at DESC LIMIT 50`)
      .bind(departmentId).all<LogRow>()).results;

    const limits = Object.fromEntries(
      (Object.entries(FOOD_TEMP_LIMITS) as [FoodCheckType, typeof FOOD_TEMP_LIMITS[FoodCheckType]][]).map(([key, value]) => [key, value]),
    );

    return Response.json({ entries: rows.map(mapRow), limits });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load food temperature log' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const departmentId = await resolveDepartment(db, request, identity);
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
    await db.prepare(`INSERT INTO food_temperature_logs
        (id, hotel_id, department_id, check_type, item_name, supplier, reading_c, in_range, packaging_ok, use_by_ok, quantity_ok, corrective_action, logged_by_staff_id, logged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        identity.hotelId,
        departmentId,
        checkType,
        itemName,
        isDelivery ? body.supplier?.trim() || null : null,
        body.readingC,
        inRange ? 1 : 0,
        isDelivery && typeof body.packagingOk === 'boolean' ? (body.packagingOk ? 1 : 0) : null,
        isDelivery && typeof body.useByOk === 'boolean' ? (body.useByOk ? 1 : 0) : null,
        isDelivery && typeof body.quantityOk === 'boolean' ? (body.quantityOk ? 1 : 0) : null,
        body.correctiveAction?.trim() || null,
        identity.staffId,
        now,
      )
      .run();

    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'food_temperature.logged',
      entityType: 'food_temperature_log',
      entityId: id,
      metadata: { checkType, itemName, readingC: body.readingC, inRange },
    });

    return Response.json({ id, checkType, itemName, readingC: body.readingC, inRange, loggedAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to log reading' }, { status: 500 });
  }
}
