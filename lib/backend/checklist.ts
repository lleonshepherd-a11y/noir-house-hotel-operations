export type ChecklistGroup = 'Opening' | 'Service prep' | 'Closing';

export interface ChecklistItemDef {
  key: string;
  label: string;
  group: ChecklistGroup;
  // Sub-heading within a group, and a short how-to hint. Only the restaurant
  // catalog uses these so far (its opening/closing lists are long enough to
  // need sectioning) — optional so every other department's flat list is
  // unaffected.
  section?: string;
  method?: string;
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
  // UK restaurant opening/closing practice: High Speed Training's daily
  // opening/closing checklist guide, and Toast POS UK's closing checklist
  // guide (till reconciliation, clock-in checks, lock-up).
  restaurant: [
    { key: 'r-unlock', label: 'Unlock & disarm alarm', group: 'Opening', section: 'Security & premises', method: 'Front and rear entrances' },
    { key: 'r-fire-exits', label: 'Check fire exits are clear and unlocked', group: 'Opening', section: 'Security & premises', method: 'Both exits, no obstructions' },
    { key: 'r-lights', label: 'Turn on lights, music & signage', group: 'Opening', section: 'Security & premises', method: 'Include outdoor signage' },
    { key: 'r-pos', label: 'Test POS & card machine', group: 'Opening', section: 'Money & systems', method: 'Run a test transaction' },
    { key: 'r-float', label: 'Count & confirm starting float', group: 'Opening', section: 'Money & systems', method: 'Record against float sheet' },
    { key: 'r-voicemail', label: 'Check voicemail, emails & booking enquiries', group: 'Opening', section: 'Money & systems', method: 'Reply to any overnight enquiries' },
    { key: 'r-reservations', label: "Confirm today's reservations", group: 'Opening', section: 'Service prep', method: 'Check for allergies & special requests' },
    { key: 'r-specials', label: 'Brief team on specials & 86’d items', group: 'Opening', section: 'Service prep', method: 'Kitchen to confirm before service' },
    { key: 'r-deliveries', label: 'Check deliveries against order sheet', group: 'Opening', section: 'Service prep', method: 'Note any shortages or substitutions' },
    { key: 'r-polish', label: 'Polish cutlery, glassware & crockery', group: 'Opening', section: 'Service prep' },
    { key: 'r-tables', label: 'Set table settings, condiments & menus', group: 'Opening', section: 'Service prep', method: 'Wipe menus, check for damage' },
    { key: 'r-restock-foh', label: 'Stock front-of-house stations', group: 'Opening', section: 'Service prep', method: 'Napkins, straws, high chairs' },
    { key: 'r-bar-setup', label: 'Set up bar — stock, ice, clean glassware', group: 'Opening', section: 'Service prep' },
    { key: 'r-restrooms', label: 'Check restrooms are clean & stocked', group: 'Opening', section: 'Final checks', method: 'Soap, paper, hand towels' },
    { key: 'r-floor-walk', label: 'Walk the floor for cleanliness & comfort', group: 'Opening', section: 'Final checks', method: 'Temperature, lighting, table stability' },
    { key: 'r-team-brief', label: 'Team briefing before doors open', group: 'Opening', section: 'Final checks', method: 'Allergens, specials, VIPs, reservations' },

    { key: 'r-last-orders', label: 'Last orders called & final tables cleared', group: 'Closing', section: 'End of service' },
    { key: 'r-wipe', label: 'Clean & sanitise all tables and surfaces', group: 'Closing', section: 'End of service' },
    { key: 'r-floors', label: 'Sweep, vacuum & mop floors', group: 'Closing', section: 'End of service' },
    { key: 'r-bins', label: 'Empty and clean bins, replace liners', group: 'Closing', section: 'End of service' },
    { key: 'r-till-reconcile', label: 'Count tills & reconcile against sales', group: 'Closing', section: 'Money & systems', method: 'Record any discrepancies' },
    { key: 'r-safe', label: 'Secure cash float & lock safe', group: 'Closing', section: 'Money & systems' },
    { key: 'r-clock-times', label: 'Check clock-in / clock-out times recorded', group: 'Closing', section: 'Money & systems', method: 'Correct any errors before close-off' },
    { key: 'r-equipment-off', label: 'Turn off POS, music & non-essential lighting', group: 'Closing', section: 'Money & systems' },
    { key: 'r-restock-napkins', label: 'Restock napkins & condiments', group: 'Closing', section: 'Reset for tomorrow', method: "For tomorrow's opening team" },
    { key: 'r-restock-bar', label: 'Restock bar & store open bottles', group: 'Closing', section: 'Reset for tomorrow', method: 'Cover and label opened bottles' },
    { key: 'r-maintenance-log', label: 'Log any maintenance issues found', group: 'Closing', section: 'Reset for tomorrow', method: 'Add to maintenance board' },
    { key: 'r-handover', label: 'Write handover notes for tomorrow', group: 'Closing', section: 'Reset for tomorrow' },
    { key: 'r-windows-doors', label: 'Check all windows & doors locked', group: 'Closing', section: 'Lock up' },
    { key: 'r-lock', label: 'Set alarm & lock up', group: 'Closing', section: 'Lock up', method: 'Front and rear entrances' },
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
