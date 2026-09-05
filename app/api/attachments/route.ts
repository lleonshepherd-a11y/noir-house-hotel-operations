import { appendAuditEvent } from '@/lib/backend/audit';
import { bearerToken, getDatabase, getFileStorage } from '@/lib/backend/runtime';
import { requireStaffSession } from '@/lib/backend/sessions';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const data = await request.formData();
    const file = data.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'Choose a file to upload' }, { status: 400 });
    if (!allowedTypes.has(file.type) || file.size > MAX_FILE_BYTES) {
      return Response.json({ error: 'Use a photo, PDF or voice note up to 25 MB' }, { status: 400 });
    }

    const messageId = text(data.get('messageId'));
    const taskId = text(data.get('taskId'));
    const guestRequestId = text(data.get('guestRequestId'));
    if (![messageId, taskId, guestRequestId].filter(Boolean).length) {
      return Response.json({ error: 'The file must belong to a message, task or guest request' }, { status: 400 });
    }

    const attachmentId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment';
    const objectKey = `${identity.hotelId}/${new Date().toISOString().slice(0, 10)}/${attachmentId}-${safeName}`;
    const createdAt = new Date().toISOString();
    await getFileStorage().put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { hotelId: identity.hotelId, uploadedBy: identity.staffId },
    });
    try {
      await db.prepare(`INSERT INTO attachments
        (id, hotel_id, uploaded_by_staff_id, message_id, task_id, guest_request_id, object_key, file_name, content_type, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          attachmentId, identity.hotelId, identity.staffId, messageId, taskId, guestRequestId,
          objectKey, file.name, file.type, file.size, createdAt,
        ).run();
    } catch (error) {
      await getFileStorage().delete(objectKey);
      throw error;
    }
    await appendAuditEvent(db, {
      hotelId: identity.hotelId,
      actorStaffId: identity.staffId,
      actorDepartmentId: identity.departmentId,
      action: 'attachment.uploaded',
      entityType: 'attachment',
      entityId: attachmentId,
      metadata: { messageId, taskId, guestRequestId, fileName: file.name, sizeBytes: file.size },
    });
    return Response.json({ id: attachmentId, fileName: file.name, contentType: file.type, sizeBytes: file.size, createdAt }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to upload the file' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const identity = await requireStaffSession(db, bearerToken(request));
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Attachment is required' }, { status: 400 });
    const record = await db.prepare(`SELECT object_key, file_name, content_type FROM attachments
      WHERE id = ? AND hotel_id = ?`).bind(id, identity.hotelId).first<{ object_key: string; file_name: string; content_type: string }>();
    if (!record) return new Response('Not found', { status: 404 });
    const object = await getFileStorage().get(record.object_key);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(record.file_name)}`);
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to open the file' }, { status: 500 });
  }
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
