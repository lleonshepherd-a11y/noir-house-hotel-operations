export type ChecklistGroup = 'Opening' | 'Service prep' | 'Closing';

export interface ChecklistItemDef {
  key: string;
  label: string;
  group: ChecklistGroup;
}

// Fixed per-department daily routines. No authoring UI yet — only completion
// state is dynamic (stored in checklist_completions, one row per item per day).
export const CHECKLIST_CATALOG: Record<string, ChecklistItemDef[]> = {
  'general-manager': [
    { key: 'gm-incidents', label: 'Review overnight incident log', group: 'Opening' },
    { key: 'gm-occupancy', label: "Check occupancy & arrivals forecast", group: 'Opening' },
    { key: 'gm-handover-read', label: 'Read overnight handover notes', group: 'Opening' },
    { key: 'gm-floor-walk', label: 'Walk the floor & guest areas', group: 'Service prep' },
    { key: 'gm-overtime', label: 'Approve pending overtime requests', group: 'Service prep' },
    { key: 'gm-handover-write', label: 'Sign off GM handover for next shift', group: 'Closing' },
    { key: 'gm-vip-tomorrow', label: "Confirm tomorrow's VIP arrivals", group: 'Closing' },
  ],
  'front-of-house': [
    { key: 'foh-unlock', label: 'Unlock front desk & test PMS', group: 'Opening' },
    { key: 'foh-arrivals', label: 'Check overnight arrivals list', group: 'Opening' },
    { key: 'foh-brief', label: 'Brief team on VIPs & special requests', group: 'Opening' },
    { key: 'foh-allocations', label: "Confirm room allocations for today's arrivals", group: 'Service prep' },
    { key: 'foh-amenities', label: 'Prepare welcome amenities', group: 'Service prep' },
    { key: 'foh-reconcile', label: "Reconcile day's check-ins & check-outs", group: 'Closing' },
    { key: 'foh-outstanding', label: 'Hand over outstanding guest requests', group: 'Closing' },
    { key: 'foh-lock', label: 'Lock front desk & secure cash float', group: 'Closing' },
  ],
  concierge: [
    { key: 'con-reservations', label: "Check today's reservations & bookings", group: 'Opening' },
    { key: 'con-overnight', label: 'Review guest requests from overnight', group: 'Opening' },
    { key: 'con-transport', label: 'Confirm transport & restaurant bookings', group: 'Service prep' },
    { key: 'con-recommendations', label: 'Prepare local recommendations for VIPs', group: 'Service prep' },
    { key: 'con-outstanding', label: 'Log outstanding guest requests', group: 'Closing' },
    { key: 'con-departures', label: "Confirm tomorrow's early departures", group: 'Closing' },
  ],
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
  kitchen: [
    { key: 'k-delivery', label: 'Check delivery & stock levels', group: 'Opening' },
    { key: 'k-equipment', label: 'Turn on equipment & pre-heat', group: 'Opening' },
    { key: 'k-allergen', label: 'Review allergen board', group: 'Opening' },
    { key: 'k-mise', label: 'Prep mise en place', group: 'Service prep' },
    { key: 'k-specials', label: 'Confirm daily specials with front of house', group: 'Service prep' },
    { key: 'k-clean', label: 'Deep clean stations', group: 'Closing' },
    { key: 'k-wastage', label: 'Log wastage & stock for tomorrow', group: 'Closing' },
    { key: 'k-fridge', label: 'Store food safely & set fridge temps', group: 'Closing' },
  ],
  housekeeping: [
    { key: 'hk-report', label: 'Collect room status report', group: 'Opening' },
    { key: 'hk-trolleys', label: 'Stock trolleys for the day', group: 'Opening' },
    { key: 'hk-lost-property', label: 'Check lost property log', group: 'Opening' },
    { key: 'hk-vip-rooms', label: 'Prioritise VIP & late checkout rooms', group: 'Service prep' },
    { key: 'hk-linen', label: 'Restock linen store', group: 'Service prep' },
    { key: 'hk-rooms-ready', label: 'Confirm all rooms marked ready', group: 'Closing' },
    { key: 'hk-maintenance-log', label: 'Report maintenance issues found', group: 'Closing' },
    { key: 'hk-lock-store', label: 'Return trolleys & lock supply room', group: 'Closing' },
  ],
  maintenance: [
    { key: 'm-fault-log', label: 'Check overnight fault log', group: 'Opening' },
    { key: 'm-safety', label: 'Test fire & safety systems', group: 'Opening' },
    { key: 'm-ppm', label: 'Review scheduled maintenance tasks', group: 'Opening' },
    { key: 'm-urgent-rooms', label: 'Action urgent guest room repairs', group: 'Service prep' },
    { key: 'm-plant-room', label: 'Check plant room readings', group: 'Service prep' },
    { key: 'm-jobs-log', label: 'Log completed jobs', group: 'Closing' },
    { key: 'm-workshop', label: 'Secure tools & workshop', group: 'Closing' },
    { key: 'm-handover', label: 'Hand over outstanding repairs', group: 'Closing' },
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
