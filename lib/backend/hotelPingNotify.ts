const HOTEL_PING_URL = process.env.HOTEL_PING_URL ?? 'https://hotelping.co.uk';

// Hotel Ping (the separate department-head messaging app) has 8 fixed
// department ids. A hotel's own dashboard department list is free-form and
// owner-defined, so this maps the common slugs a hotel would realistically
// use onto those fixed ids. Anything unrecognized is skipped rather than
// guessed at - see PRODUCT_REQUIREMENTS.md / ask the owner before widening
// this if a hotel's real department names don't match.
const ALIASES: Record<string, string> = {
  'general-manager': 'gm', gm: 'gm', management: 'gm', manager: 'gm',
  'front-of-house': 'foh', 'front-desk': 'foh', reception: 'foh', foh: 'foh',
  concierge: 'concierge',
  restaurant: 'restaurant', 'restaurant-manager': 'restaurant', 'food-and-beverage': 'restaurant', 'f-and-b': 'restaurant',
  kitchen: 'kitchen', 'head-chef': 'kitchen', chef: 'kitchen',
  bar: 'bar', 'bar-manager': 'bar',
  housekeeping: 'housekeeping', 'head-housekeeper': 'housekeeping',
  maintenance: 'maintenance', engineering: 'maintenance',
};

export function hotelPingDepartmentIdFor(slug: string): string | null {
  return ALIASES[slug.toLowerCase()] ?? null;
}

// Delivers one message to a Hotel Ping department head. `idempotencyKey`
// should be the dashboard's own message id (already deduped there via
// client_message_id) so a retry on either side never produces a second
// notification - see app/api/messages/route.ts.
export async function notifyHotelPing(params: { idempotencyKey: string; departmentSlug: string; message: string }) {
  const apiKey = process.env.HOTEL_PING_API_KEY;
  if (!apiKey) return; // integration not configured for this environment - no-op, not an error
  const departmentId = hotelPingDepartmentIdFor(params.departmentSlug);
  if (!departmentId) return; // no confident match to a Hotel Ping department - don't guess

  try {
    const res = await fetch(`${HOTEL_PING_URL}/api/external/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ idempotencyKey: params.idempotencyKey, departmentId, message: params.message }),
    });
    if (!res.ok) {
      console.error('notifyHotelPing: non-OK response', res.status, await res.text().catch(() => ''));
    }
  } catch (error) {
    // Best-effort: Hotel Ping being briefly unreachable must never fail the
    // dashboard's own message send.
    console.error('notifyHotelPing failed', error);
  }
}
