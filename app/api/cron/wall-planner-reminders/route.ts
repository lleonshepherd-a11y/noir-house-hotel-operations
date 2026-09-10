import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/backend/runtime';

// Same shared-secret pattern as /api/cron/escalate - a scheduled trigger has
// no PIN to sign in with, so this checks a secret instead of a staff
// session. Hashes both sides and compares in constant time so a wrong guess
// can't be narrowed down by how long the comparison took to fail.
async function safeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

// How far ahead of an operations-calendar entry's date to warn the
// department that's down to handle it - a week out, then again a few days
// closer, then the day before, so it's never a same-day surprise.
const REMINDER_OFFSETS_DAYS = [7, 3, 1];

interface DueEntryRow {
  id: string;
  hotel_id: string;
  entry_date: string;
  entry_time: string;
  title: string;
  category_label: string;
}

export async function POST(request: Request) {
  try {
    const secret = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!secret || !(await safeEqual(auth ?? '', `Bearer ${secret}`))) return new Response('Forbidden', { status: 403 });

    const db = getDatabase();
    const now = new Date();
    let created = 0;

    for (const offsetDays of REMINDER_OFFSETS_DAYS) {
      const targetDate = new Date(now);
      targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);
      const targetDateKey = targetDate.toISOString().slice(0, 10);

      const due = await db.prepare(`SELECT w.id, w.hotel_id, w.entry_date, w.entry_time, w.title, c.label AS category_label
          FROM wall_planner_entries w
          JOIN wall_planner_categories c ON c.id = w.category_id
          WHERE w.entry_date = ?
          AND NOT EXISTS (SELECT 1 FROM wall_planner_reminder_log r WHERE r.entry_id = w.id AND r.offset_days = ?)`)
        .bind(targetDateKey, offsetDays).all<DueEntryRow>();

      for (const entry of due.results) {
        // An entry can involve several departments (e.g. a buffet needing
        // Kitchen, Restaurant and Conference) - every one of them gets its
        // own reminder task, not just whichever was picked first.
        const departments = await db.prepare('SELECT department_id FROM wall_planner_entry_departments WHERE entry_id = ?')
          .bind(entry.id).all<{ department_id: string }>();
        const nowIso = new Date().toISOString();
        const whenLabel = offsetDays === 1 ? 'tomorrow' : `in ${offsetDays} days`;
        const statements = departments.results.map((dept) =>
          db.prepare(`INSERT INTO tasks
              (id, hotel_id, assigned_department_id, created_by_staff_id, title, details, priority, status, created_at, updated_at)
              VALUES (?, ?, ?, NULL, ?, ?, 'normal', 'open', ?, ?)`)
            .bind(
              crypto.randomUUID(),
              entry.hotel_id,
              dept.department_id,
              `${entry.title} is ${whenLabel}`,
              `${entry.category_label}, ${entry.entry_time} on ${entry.entry_date}. From the operations calendar.`,
              nowIso,
              nowIso,
            ),
        );
        statements.push(
          db.prepare('INSERT INTO wall_planner_reminder_log (entry_id, offset_days, sent_at) VALUES (?, ?, ?)')
            .bind(entry.id, offsetDays, nowIso),
        );
        await db.batch(statements);
        created += departments.results.length;
      }
    }

    return Response.json({ ok: true, created, ranAt: now.toISOString() });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Wall planner reminder run failed' }, { status: 500 });
  }
}
