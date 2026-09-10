export type ChecklistGroup = 'Opening' | 'Service prep' | 'Closing';

export interface ChecklistItemDef {
  key: string;
  label: string;
  group: ChecklistGroup;
}

// Fixed per-department daily routines. No authoring UI yet — only completion
// state is dynamic (stored in checklist_completions, one row per item per day).
export const CHECKLIST_CATALOG: Record<string, ChecklistItemDef[]> = {
  restaurant: [
    { key: 'r-unlock', label: 'Unlock & disarm alarm', group: 'Opening' },
    { key: 'r-lights', label: 'Turn on lights & music', group: 'Opening' },
    { key: 'r-polish', label: 'Polish cutlery & glassware', group: 'Opening' },
    { key: 'r-tables', label: 'Set table settings', group: 'Opening' },
    { key: 'r-reservations', label: "Check today's reservations", group: 'Service prep' },
    { key: 'r-restock-napkins', label: 'Restock napkins & condiments', group: 'Service prep' },
    { key: 'r-pos', label: 'Test POS & card machine', group: 'Service prep' },
    { key: 'r-wipe', label: 'Wipe down all tables', group: 'Closing' },
    { key: 'r-bins', label: 'Empty bins & recycling', group: 'Closing' },
    { key: 'r-restock-tomorrow', label: 'Restock for tomorrow', group: 'Closing' },
    { key: 'r-lock', label: 'Lock up & arm alarm', group: 'Closing' },
  ],
};

export function checklistForSlug(slug: string | null): ChecklistItemDef[] {
  return (slug && CHECKLIST_CATALOG[slug]) || [];
}

// Server date the checklist resets on. Hotels are single-timezone in this
// schema (hotels.timezone), but the catalog has no per-hotel wiring yet, so
// this uses UTC date for now — deliberately simple, not a design decision.
export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
