import { appendAuditEvent } from '@/lib/backend/audit';
import { assertAccess } from '@/lib/backend/policy';
import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';
import type { Resource } from '@/lib/backend/types';

type OperationName = 'tasks' | 'handovers' | 'pins' | 'announcements' | 'guest-requests';

const resourcePolicy: Record<OperationName, Resource> = {
  tasks: 'task',
  handovers: 'shift_handover',
  pins: 'department_pin',
  announcements: 'announcement',
  'guest-requests': 'guest_request',
};

function operationName(value: string): OperationName | null {
  return value in resourcePolicy ? (value as OperationName) : null;
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const name = operationName((await context.params).resource);
    if (!name) return new Response('Not found', { status: 404 });
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const url = new URL(request.url);
    const departmentId = url.searchParams.get('departmentId') ?? identity.departmentId;
    assertAccess(identity, 'read', resourcePolicy[name], { hotelId: identity.hotelId, departmentId });
    const rows = await listOperation(db, name, identity.hotelId, departmentId);
    return Response.json({ results: rows });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load records' }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const name = operationName((await context.params).resource);
    if (!name) return new Response('Not found', { status: 404 });
    const db = await getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const body = (await request.json()) as Record<string, unknown>;
    const departmentId = typeof body.departmentId === 'string' ? body.departmentId : identity.departmentId;
    assertAccess(identity, 'create', resourcePolicy[name], { hotelId: identity.hotelId, departmentId });
    const created = await createOperation(db, name, identity, departmentId, body);
    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: `${name}.created`,
      entityType: resourcePolicy[name],
      entityId: created.id,
      metadata: { departmentId },
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to create record' }, { status: 400 });
  }
}

async function listOperation(db: D1Database, name: OperationName, hotelId: string, departmentId: string) {
  if (name === 'tasks') {
    return (await db.prepare(`SELECT * FROM tasks WHERE hotel_id = ? AND assigned_department_id = ?
      ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`).bind(hotelId, departmentId).all()).results;
  }
  if (name === 'handovers') {
    return (await db.prepare('SELECT * FROM shift_handovers WHERE department_id = ? ORDER BY created_at DESC LIMIT 100').bind(departmentId).all()).results;
  }
  if (name === 'pins') {
    return (await db.prepare('SELECT * FROM department_pins WHERE department_id = ? AND active = 1 ORDER BY position, created_at DESC LIMIT 6').bind(departmentId).all()).results;
  }
  if (name === 'announcements') {
    return (await db.prepare(`SELECT * FROM announcements WHERE hotel_id = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 20`).bind(hotelId, new Date().toISOString()).all()).results;
  }
  return (await db.prepare('SELECT * FROM guest_requests WHERE hotel_id = ? AND status != ? ORDER BY created_at DESC LIMIT 100').bind(hotelId, 'archived').all()).results;
}

async function createOperation(
  db: D1Database,
  name: OperationName,
  identity: { staffId: string; hotelId: string; departmentId: string },
  departmentId: string,
  body: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  if (name === 'tasks') {
    const title = requiredText(body.title, 'Task title');
    await db.prepare(`INSERT INTO tasks
      (id, hotel_id, assigned_department_id, created_by_staff_id, title, details, priority, status, due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`).bind(
        id, identity.hotelId, departmentId, identity.staffId, title, optionalText(body.details),
        body.priority === 'urgent' ? 'urgent' : 'normal', optionalText(body.dueAt), now, now,
      ).run();
  } else if (name === 'handovers') {
    await db.prepare(`INSERT INTO shift_handovers
      (id, department_id, created_by_staff_id, body, shift_date, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, departmentId, identity.staffId, requiredText(body.body, 'Handover'), requiredText(body.shiftDate, 'Shift date'), now).run();
  } else if (name === 'pins') {
    const count = await db.prepare('SELECT COUNT(*) AS total FROM department_pins WHERE department_id = ? AND active = 1').bind(departmentId).first<{ total: number }>();
    if ((count?.total ?? 0) >= 6) throw new Error('This department already has six active pins');
    await db.prepare(`INSERT INTO department_pins
      (id, department_id, created_by_staff_id, body, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, departmentId, identity.staffId, requiredText(body.body, 'Pin note'), Number(body.position ?? count?.total ?? 0), now).run();
  } else if (name === 'announcements') {
    await db.prepare(`INSERT INTO announcements
      (id, hotel_id, created_by_staff_id, body, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, identity.hotelId, identity.staffId, requiredText(body.body, 'Announcement'), optionalText(body.expiresAt), now).run();
  } else {
    const subject = requiredText(body.subject, 'Subject');
    const requestBody = requiredText(body.body, 'Guest request');
    await db.prepare(`INSERT INTO guest_requests
      (id, hotel_id, assigned_department_id, guest_reference, subject, body, status, urgency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`).bind(
        id, identity.hotelId, departmentId, optionalText(body.guestReference), subject, requestBody,
        body.urgency === 'urgent' ? 'urgent' : 'normal', now, now,
      ).run();
  }
  return { id, createdAt: now };
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
