import { getDatabase } from '@/lib/backend/runtime';

interface EntryRow {
  id: string;
  entry_date: string;
  entry_time: string;
  title: string;
  category_id: string;
  category_label: string;
  category_color: string;
}

interface DeptLinkRow {
  entry_id: string;
  department_name: string;
}

function mapRow(row: EntryRow, departments: string[]) {
  return {
    id: row.id,
    date: row.entry_date,
    time: row.entry_time,
    title: row.title,
    category: { id: row.category_id, label: row.category_label, color: row.category_color },
    departments,
  };
}

// No department scoping on read - this calendar is deliberately shared
// across the whole hotel, unlike the checklist/fridge/food-temp pages which
// each belong to one department.
export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month')); // 1-indexed
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return Response.json({ error: 'A valid year and month are required' }, { status: 400 });
    }
    const hotel = await db.prepare('SELECT id FROM hotels LIMIT 1').first<{ id: string }>();
    if (!hotel) return Response.json({ entries: [] });

    // Pad a week either side of the month so the leading/trailing days shown
    // on the grid (from the previous/next month) still carry their entries.
    const from = new Date(Date.UTC(year, month - 2, 24)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(year, month, 7)).toISOString().slice(0, 10);

    // Category label/colour is joined in at read time rather than looked up
    // client-side against a fixed list, so an entry still renders correctly
    // even after its type has since been renamed, recoloured, or removed.
    const rows = await db.prepare(`SELECT w.id, w.entry_date, w.entry_time, w.title,
        c.id AS category_id, c.label AS category_label, c.color AS category_color
        FROM wall_planner_entries w
        JOIN wall_planner_categories c ON c.id = w.category_id
        WHERE w.hotel_id = ? AND w.entry_date >= ? AND w.entry_date <= ?
        ORDER BY w.entry_date, w.entry_time`)
      .bind(hotel.id, from, to).all<EntryRow>();

    if (!rows.results.length) return Response.json({ entries: [] });

    const ids = rows.results.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const deptLinks = await db.prepare(`SELECT ed.entry_id, d.name AS department_name
        FROM wall_planner_entry_departments ed JOIN departments d ON d.id = ed.department_id
        WHERE ed.entry_id IN (${placeholders}) ORDER BY d.name`)
      .bind(...ids).all<DeptLinkRow>();

    const deptsByEntry = new Map<string, string[]>();
    for (const link of deptLinks.results) {
      const list = deptsByEntry.get(link.entry_id) ?? [];
      list.push(link.department_name);
      deptsByEntry.set(link.entry_id, list);
    }

    return Response.json({ entries: rows.results.map((row) => mapRow(row, deptsByEntry.get(row.id) ?? [])) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load the operations calendar' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const body = (await request.json()) as {
      departments?: string[];
      date?: string;
      time?: string;
      title?: string;
      categoryId?: string;
    };

    const departmentNames = [...new Set((body.departments ?? []).map((name) => name.trim()).filter(Boolean))];
    if (!departmentNames.length) return Response.json({ error: 'At least one department is required' }, { status: 400 });
    const placeholders = departmentNames.map(() => '?').join(',');
    const departmentRows = await db.prepare(`SELECT id, name, hotel_id FROM departments WHERE name IN (${placeholders})`)
      .bind(...departmentNames).all<{ id: string; name: string; hotel_id: string }>();
    if (departmentRows.results.length !== departmentNames.length) {
      return Response.json({ error: 'Unknown department' }, { status: 404 });
    }
    const hotelId = departmentRows.results[0].hotel_id;

    const date = body.date?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'A valid date is required' }, { status: 400 });
    const time = body.time?.trim() || '00:00';
    const title = body.title?.trim();
    if (!title) return Response.json({ error: 'A title is required' }, { status: 400 });
    const categoryId = body.categoryId?.trim();
    if (!categoryId) return Response.json({ error: 'A type is required' }, { status: 400 });
    const category = await db.prepare('SELECT id FROM wall_planner_categories WHERE id = ? AND active = 1')
      .bind(categoryId).first<{ id: string }>();
    if (!category) return Response.json({ error: 'Unknown type' }, { status: 404 });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO wall_planner_entries
          (id, hotel_id, entry_date, entry_time, title, category_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, hotelId, date, time, title, categoryId, now),
      ...departmentRows.results.map((dept) =>
        db.prepare('INSERT INTO wall_planner_entry_departments (entry_id, department_id) VALUES (?, ?)').bind(id, dept.id),
      ),
    ]);

    return Response.json({ id, date, time, title }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to add that entry' }, { status: 500 });
  }
}
