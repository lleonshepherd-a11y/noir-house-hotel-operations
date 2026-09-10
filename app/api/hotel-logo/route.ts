import { getDatabase, getFileStorage } from '@/lib/backend/runtime';

// Public and unauthenticated on purpose: a hotel's logo needs to render on
// every department's dashboard, and showing it isn't a privacy concern the
// way an attachment or a guest's details would be.
export async function GET(request: Request) {
  try {
    const hotelId = new URL(request.url).searchParams.get('hotelId');
    if (!hotelId) return new Response('hotelId is required', { status: 400 });
    const db = await getDatabase();
    const hotel = await db.prepare('SELECT logo_object_key FROM hotels WHERE id = ?')
      .bind(hotelId).first<{ logo_object_key: string | null }>();
    if (!hotel?.logo_object_key) return new Response('Not found', { status: 404 });
    const object = await getFileStorage().get(hotel.logo_object_key);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('cache-control', 'public, max-age=300');
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response('Unable to load logo', { status: 500 });
  }
}
