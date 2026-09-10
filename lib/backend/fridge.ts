export type FridgeKind = 'fridge' | 'freezer';
export type FridgeStatus = 'in_range' | 'above_range' | 'below_range';

// Fridges: 1-5C. Freezers: -18C or below. Simple, fixed thresholds - no
// per-unit customisation yet, matching the "Safe range" note on the page.
export function statusForReading(kind: FridgeKind, readingC: number): FridgeStatus {
  if (kind === 'fridge') {
    if (readingC < 1) return 'below_range';
    if (readingC > 5) return 'above_range';
    return 'in_range';
  }
  if (readingC > -18) return 'above_range';
  return 'in_range';
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export type CheckSession = 'morning' | 'afternoon';

// Kitchen runs two checks a day. No per-hotel timezone wiring yet (same
// simplification as todayKey), so this is a fixed UTC-hour cutoff rather
// than a real local-time boundary - a placeholder, not a design decision.
export function currentSession(date = new Date()): CheckSession {
  return date.getUTCHours() < 14 ? 'morning' : 'afternoon';
}
