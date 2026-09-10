import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireOwnerSession } from '@/lib/backend/ownerSessions';

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const hotel = await db.prepare('SELECT name, logo_object_key FROM hotels WHERE id = ?')
      .bind(identity.hotelId).first<{ name: string; logo_object_key: string | null }>();
    return Response.json({ name: hotel?.name ?? '', hasLogo: !!hotel?.logo_object_key, hotelId: identity.hotelId });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load hotel profile' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: 'A hotel name is required' }, { status: 400 });
    await db.prepare('UPDATE hotels SET name = ? WHERE id = ?').bind(name, identity.hotelId).run();
    return Response.json({ name });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to update the hotel name' }, { status: 500 });
  }
}
