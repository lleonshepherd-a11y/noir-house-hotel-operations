import { env } from 'cloudflare:workers';
import { escalateAllHotels } from '@/lib/backend/escalation';
import { getDatabase } from '@/lib/backend/runtime';

// Called on a schedule by a separate tiny cron Worker (see cron-worker/ at
// the repo root) rather than by any staff session, since a scheduled trigger
// has no PIN to sign in with. Guarded by a shared secret instead of
// requireStaffSession - CRON_SECRET must match between this Worker and the
// cron Worker's own secret of the same name.
// Hashes both sides to a fixed-length digest and compares with a constant-time
// XOR rather than `===`, so a wrong guess can't be narrowed down by how long
// the comparison took to fail.
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

export async function POST(request: Request) {
  try {
    const secret = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!secret || !(await safeEqual(auth ?? '', `Bearer ${secret}`))) return new Response('Forbidden', { status: 403 });
    const db = getDatabase();
    const now = new Date().toISOString();
    const escalated = await escalateAllHotels(db, now);
    return Response.json({ ok: true, escalated, ranAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Escalation run failed' }, { status: 500 });
  }
}
