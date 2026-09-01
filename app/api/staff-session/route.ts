import { getDatabase, bearerToken } from '@/lib/backend/runtime';
import { endStaffSession, startStaffSession } from '@/lib/backend/sessions';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { staffId?: string; pin?: string };
    if (!body.staffId || !body.pin) return Response.json({ error: 'Staff member and PIN are required' }, { status: 400 });
    return Response.json(await startStaffSession(await getDatabase(), body.staffId, body.pin));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to start staff session' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: 'Staff session required' }, { status: 401 });
  await endStaffSession(await getDatabase(), token);
  return new Response(null, { status: 204 });
}
