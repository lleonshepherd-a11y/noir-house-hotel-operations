import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { endOwnerSession, loginOwner, requireOwnerSession, signUpOwner } from '@/lib/backend/ownerSessions';

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const hotel = await db.prepare('SELECT name FROM hotels WHERE id = ?').bind(identity.hotelId).first<{ name: string }>();
    return Response.json({ identity, hotelName: hotel?.name ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to read owner session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mode?: 'signup' | 'login'; email?: string; password?: string; hotelName?: string };
    if (!body.email || !body.password) return Response.json({ error: 'Email and password are required' }, { status: 400 });
    const db = getDatabase();
    if (body.mode === 'signup') {
      if (!body.hotelName) return Response.json({ error: 'A hotel name is required' }, { status: 400 });
      return Response.json(await signUpOwner(db, body.email, body.password, body.hotelName), { status: 201 });
    }
    return Response.json(await loginOwner(db, body.email, body.password));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('owner-session error', error instanceof Error ? error.stack : error);
    return Response.json({ error: 'Unable to start owner session' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: 'Owner session required' }, { status: 401 });
  await endOwnerSession(await getDatabase(), token);
  return new Response(null, { status: 204 });
}
