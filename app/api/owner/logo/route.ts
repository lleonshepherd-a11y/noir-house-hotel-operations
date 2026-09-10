import { bearerToken, getDatabase, getFileStorage } from '@/lib/backend/runtime';
import { requireOwnerSession } from '@/lib/backend/ownerSessions';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const data = await request.formData();
    const file = data.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'Choose an image to upload' }, { status: 400 });
    if (!allowedTypes.has(file.type)) return Response.json({ error: 'Use a PNG, JPEG, WEBP or SVG image' }, { status: 400 });
    if (file.size > MAX_LOGO_BYTES) return Response.json({ error: 'Logo must be under 2 MB' }, { status: 400 });

    const objectKey = `logos/${identity.hotelId}`;
    await getFileStorage().put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { hotelId: identity.hotelId },
    });
    await db.prepare('UPDATE hotels SET logo_object_key = ? WHERE id = ?').bind(objectKey, identity.hotelId).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to upload the logo' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const hotel = await db.prepare('SELECT logo_object_key FROM hotels WHERE id = ?')
      .bind(identity.hotelId).first<{ logo_object_key: string | null }>();
    if (hotel?.logo_object_key) await getFileStorage().delete(hotel.logo_object_key);
    await db.prepare('UPDATE hotels SET logo_object_key = NULL WHERE id = ?').bind(identity.hotelId).run();
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to remove the logo' }, { status: 500 });
  }
}
