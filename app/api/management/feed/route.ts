import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import { isManagement } from '@/lib/backend/types';

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    if (!isManagement(identity)) return new Response('Forbidden', { status: 403 });
    const url = new URL(request.url);
    const department = url.searchParams.get('department');
    const priority = url.searchParams.get('priority');
    const status = url.searchParams.get('status');
    const date = url.searchParams.get('date');
    const params: unknown[] = [identity.hotelId];
    const where = ['c.hotel_id = ?'];
    if (department) { where.push('cd.department_id = ?'); params.push(department); }
    if (priority) { where.push('m.urgency = ?'); params.push(priority); }
    if (status) { where.push('c.status = ?'); params.push(status); }
    if (date) { where.push('substr(c.updated_at, 1, 10) = ?'); params.push(date); }
    const results = await db.prepare(`SELECT c.id AS conversation_id, c.kind, c.subject, c.status,
      c.updated_at, m.id AS latest_message_id, m.body AS latest_message, m.urgency AS priority,
      m.created_at AS latest_message_at, s.display_name AS latest_sender,
      GROUP_CONCAT(DISTINCT d.name) AS departments,
      CASE WHEN cw.staff_id IS NULL THEN 0 ELSE 1 END AS watching,
      CASE WHEN cp.staff_id IS NULL THEN 0 ELSE 1 END AS participating
      FROM conversations c
      JOIN messages m ON m.id = (SELECT m2.id FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1)
      JOIN staff s ON s.id = m.sender_staff_id
      LEFT JOIN conversation_departments cd ON cd.conversation_id = c.id
      LEFT JOIN departments d ON d.id = cd.department_id
      LEFT JOIN conversation_watchers cw ON cw.conversation_id = c.id AND cw.staff_id = ?
      LEFT JOIN conversation_participation cp ON cp.conversation_id = c.id AND cp.staff_id = ? AND cp.left_at IS NULL
      WHERE ${where.join(' AND ')} GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 200`)
      .bind(identity.staffId, identity.staffId, ...params).all();
    const awaiting = await db.prepare(`SELECT md.*, c.subject, c.status AS conversation_status,
      s.display_name AS requested_by FROM management_decisions md
      JOIN conversations c ON c.id = md.conversation_id
      JOIN staff s ON s.id = md.requested_by_staff_id
      WHERE c.hotel_id = ? AND md.status IN ('awaiting','more_information')
      ORDER BY md.updated_at ASC LIMIT 100`).bind(identity.hotelId).all();
    return Response.json({ results: results.results, awaitingManagementDecision: awaiting.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load management feed' }, { status: 500 });
  }
}
