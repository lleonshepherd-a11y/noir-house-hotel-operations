import { getDatabase } from '@/lib/backend/runtime';

interface CategoryRow {
  id: string;
  label: string;
  color: string;
  position: number;
}

function mapRow(row: CategoryRow) {
  return { id: row.id, label: row.label, color: row.color };
}

async function resolveHotel(db: D1Database) {
  return db.prepare('SELECT id FROM hotels LIMIT 1').first<{ id: string }>();
}

function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// No sign-in on this page (same as the operations calendar itself), so
// anyone from any department can manage the shared list of event types.
export async function GET() {
  try {
    const db = await getDatabase();
    const hotel = await resolveHotel(db);
    if (!hotel) return Response.json({ categories: [] });
    const rows = await db.prepare(`SELECT id, label, color, position FROM wall_planner_categories
      WHERE hotel_id = ? AND active = 1 ORDER BY position, created_at`).bind(hotel.id).all<CategoryRow>();
    return Response.json({ categories: rows.results.map(mapRow) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load event types' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const hotel = await resolveHotel(db);
    if (!hotel) return Response.json({ error: 'No hotel configured' }, { status: 500 });
    const body = (await request.json()) as { label?: string; color?: string };
    const label = body.label?.trim();
    if (!label) return Response.json({ error: 'A name is required' }, { status: 400 });
    if (!isValidColor(body.color)) return Response.json({ error: 'A valid colour is required' }, { status: 400 });

    const count = await db.prepare('SELECT COUNT(*) AS total FROM wall_planner_categories WHERE hotel_id = ? AND active = 1')
      .bind(hotel.id).first<{ total: number }>();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO wall_planner_categories (id, hotel_id, label, color, position, active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)`)
      .bind(id, hotel.id, label, body.color, count?.total ?? 0, now).run();

    return Response.json({ id, label, color: body.color }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to add that type' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
    const body = (await request.json()) as { label?: string; color?: string };
    const label = body.label?.trim();
    if (!label) return Response.json({ error: 'A name is required' }, { status: 400 });
    if (!isValidColor(body.color)) return Response.json({ error: 'A valid colour is required' }, { status: 400 });

    const result = await db.prepare('UPDATE wall_planner_categories SET label = ?, color = ? WHERE id = ?')
      .bind(label, body.color, id).run();
    if (!result.meta.changes) return Response.json({ error: 'Unknown type' }, { status: 404 });
    return Response.json({ id, label, color: body.color });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update that type' }, { status: 500 });
  }
}

// Soft delete: past entries keep their own copy of the label/colour (see
// the wall-planner GET route's join), so removing a type here never
// changes how already-logged entries look on the calendar - it only stops
// the type appearing in the legend and the add-entry form.
export async function DELETE(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
    await db.prepare('UPDATE wall_planner_categories SET active = 0 WHERE id = ?').bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to remove that type' }, { status: 500 });
  }
}
