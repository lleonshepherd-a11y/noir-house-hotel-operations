import { appendAuditEvent } from '@/lib/backend/audit';
import { assertDepartmentInHotel } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { checklistForSlug, todayKey } from '@/lib/backend/checklist';
import { isManagement, type StaffIdentity } from '@/lib/backend/types';

interface CompletionRow {
  item_key: string;
  completed_at: string;
  display_name: string;
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
    const items = checklistForSlug(slug);
    const date = todayKey();

    const completions = items.length
      ? (await db.prepare(`SELECT cc.item_key, cc.completed_at, s.display_name
          FROM checklist_completions cc JOIN staff s ON s.id = cc.completed_by_staff_id
          WHERE cc.department_id = ? AND cc.checklist_date = ?`)
          .bind(departmentId, date).all<CompletionRow>()).results
      : [];
    const byKey = new Map(completions.map((row) => [row.item_key, row]));

    const results = items.map((item) => {
      const completion = byKey.get(item.key);
      return {
        ...item,
        done: Boolean(completion),
        completedAt: completion?.completed_at ?? null,
        completedByName: completion?.display_name ?? null,
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
    const identity = await requireStaffSession(db, bearerToken(request));
    const { departmentId, slug } = await resolveDepartment(db, request, identity);
    const body = (await request.json()) as { itemKey?: string };
    const itemKey = body.itemKey;
    const item = checklistForSlug(slug).find((candidate) => candidate.key === itemKey);
    if (!item) return Response.json({ error: 'Unknown checklist item' }, { status: 400 });

    const date = todayKey();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO checklist_completions
        (id, hotel_id, department_id, item_key, checklist_date, completed_by_staff_id, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(department_id, item_key, checklist_date) DO NOTHING`)
      .bind(id, identity.hotelId, departmentId, item.key, date, identity.staffId, now).run();

    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'checklist.completed',
      entityType: 'checklist_completion',
      entityId: `${departmentId}:${item.key}:${date}`,
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
    const identity = await requireStaffSession(db, bearerToken(request));
    const { departmentId } = await resolveDepartment(db, request, identity);
    const url = new URL(request.url);
    const itemKey = url.searchParams.get('itemKey');
    if (!itemKey) return Response.json({ error: 'itemKey is required' }, { status: 400 });

    const date = todayKey();
    await db.prepare('DELETE FROM checklist_completions WHERE department_id = ? AND item_key = ? AND checklist_date = ?')
      .bind(departmentId, itemKey, date).run();

    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'checklist.reopened',
      entityType: 'checklist_completion',
      entityId: `${departmentId}:${itemKey}:${date}`,
      metadata: { itemKey, date },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update checklist' }, { status: 500 });
  }
}
