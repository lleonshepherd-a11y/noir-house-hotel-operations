import { bearerToken, getDatabase } from '@/lib/backend/runtime';
import { requireOwnerSession } from '@/lib/backend/ownerSessions';

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'department';
}

export async function GET(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const rows = await db.prepare('SELECT id, name, slug FROM departments WHERE hotel_id = ? ORDER BY created_at')
      .bind(identity.hotelId).all<{ id: string; name: string; slug: string }>();
    return Response.json({ departments: rows.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to load departments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    const identity = await requireOwnerSession(db, bearerToken(request));
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: 'A department name is required' }, { status: 400 });

    const slugBase = slugify(name);
    let slug = slugBase;
    let attempt = 1;
    // Two departments with the same name (or names that slugify the same
    // way) are realistic - "Restaurant" and "Restaurant " - so make the slug
    // unique instead of failing the whole request over it.
    while (await db.prepare('SELECT 1 FROM departments WHERE hotel_id = ? AND slug = ?').bind(identity.hotelId, slug).first()) {
      attempt += 1;
      slug = `${slugBase}-${attempt}`;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO departments (id, hotel_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, identity.hotelId, name, slug, now).run();
    return Response.json({ id, name, slug }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Unable to add that department' }, { status: 500 });
  }
}
