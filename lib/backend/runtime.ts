import { env } from 'cloudflare:workers';

interface HotelBindings {
  DB: D1Database;
  FILES: R2Bucket;
}

export function getDatabase() {
  const db = (env as unknown as HotelBindings).DB;
  if (!db) throw new Response('Database binding is unavailable', { status: 503 });
  return db;
}

export function getFileStorage() {
  const files = (env as unknown as HotelBindings).FILES;
  if (!files) throw new Response('File storage binding is unavailable', { status: 503 });
  return files;
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}
