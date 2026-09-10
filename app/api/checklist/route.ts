import { appendAuditEvent } from '@/lib/backend/audit';
import { getDatabase } from '@/lib/backend/runtime';
import { checklistForSlug, todayKey } from '@/lib/backend/checklist';

interface CompletionRow {
  item_key: string;
  completed_at: string;
}

interface DepartmentRow {
  id: string;
  slug: string;
  hotel_id: string;
}

// The checklist is meant to be tapped straight from the dashboard by whoever
// is on shift, with no PIN sign-in first (unlike the rest of this app) - so
// there is no staff identity here, only the department the client says it's
// showing. Single-hotel deployment, so the department name alone is enough
// to find the right row.
async function resolveDepartment(db: D1Database, request: Request) {
  const url = new URL(request.url);
  const departmentName = url.searchParams.get('department');
  if (!departmentName) throw new Response('department is required', { status: 400 });
  const department = await db.prepare('SELECT id, slug, hotel_id FROM departments WHERE name = ?')
    .bind(departmentName).first<DepartmentRow>();
  if (!department) throw new Response('Unknown department', { status: 404 });
  return department;
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const { id: departmentId, slug } = await resolveDepartment(db, request);
    const items = checklistForSlug(slug);
    const date = todayKey();

    const completions = items.length
      ? (await db.prepare(`SELECT item_key, completed_at FROM checklist_completions
          WHERE department_id = ? AND checklist_date = ?`)
          .bind(departmentId, date).all<CompletionRow>()).results
      : [];
    const byKey = new Map(completions.map((row) => [row.item_key, row]));

    const results = items.map((item) => {
      const completion = byKey.get(item.key);
      return {
        ...item,
        done: Boolean(completion),
        completedAt: completion?.completed_at ?? null,
      };
    });

    return Response.json({
      date,
      items: results,
      doneCount: completions.length,
      totalCount: items.length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load checklist' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const body = (await request.json()) as { itemKey?: string };
    const itemKey = body.itemKey;
    const item = checklistForSlug(department.slug).find((candidate) => candidate.key === itemKey);
    if (!item) return Response.json({ error: 'Unknown checklist item' }, { status: 400 });

    const date = todayKey();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO checklist_completions
        (id, hotel_id, department_id, item_key, checklist_date, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(department_id, item_key, checklist_date) DO NOTHING`)
      .bind(id, department.hotel_id, department.id, item.key, date, now).run();

    await appendAuditEvent(db, {
      hotelId: department.hotel_id,
      actorStaffId: null,
      actorDepartmentId: department.id,
      action: 'checklist.completed',
      entityType: 'checklist_completion',
      entityId: `${department.id}:${item.key}:${date}`,
      metadata: { itemKey: item.key, date },
    });

    return Response.json({ itemKey: item.key, completedAt: now }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update checklist' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await getDatabase();
    const department = await resolveDepartment(db, request);
    const url = new URL(request.url);
    const itemKey = url.searchParams.get('itemKey');
    if (!itemKey) return Response.json({ error: 'itemKey is required' }, { status: 400 });

    const date = todayKey();
    await db.prepare('DELETE FROM checklist_completions WHERE department_id = ? AND item_key = ? AND checklist_date = ?')
      .bind(department.id, itemKey, date).run();

    await appendAuditEvent(db, {
      hotelId: department.hotel_id,
      actorStaffId: null,
      actorDepartmentId: department.id,
      action: 'checklist.reopened',
      entityType: 'checklist_completion',
      entityId: `${department.id}:${itemKey}:${date}`,
      metadata: { itemKey, date },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update checklist' }, { status: 500 });
  }
}
