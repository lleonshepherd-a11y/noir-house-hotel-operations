export type FridgeUnitType = 'fridge' | 'freezer';

export interface FridgeUnitDef {
  key: string;
  label: string;
  type: FridgeUnitType;
  limitC: number; // fridges: must be <= limitC. freezers: must be <= limitC.
}

// Fixed per-department unit list. No authoring UI — matches the daily checklist pattern.
export const FRIDGE_CATALOG: Record<string, FridgeUnitDef[]> = {
  kitchen: [
    ...Array.from({ length: 10 }, (_, index) => ({
      key: `fridge-${index + 1}`,
      label: `Fridge ${index + 1}`,
      type: 'fridge' as const,
      limitC: 5,
    })),
    { key: 'freezer-1', label: 'Freezer 1', type: 'freezer', limitC: -18 },
    { key: 'freezer-2', label: 'Freezer 2', type: 'freezer', limitC: -18 },
  ],
};

export function fridgeUnitsForSlug(slug: string | null): FridgeUnitDef[] {
  return (slug && FRIDGE_CATALOG[slug]) || [];
}

export function fridgeReadingInRange(unit: FridgeUnitDef, readingC: number): boolean {
  return readingC <= unit.limitC;
}

// UK Safer Food Better Business standard limits.
export type FoodCheckType = 'cooking' | 'hot_holding' | 'cold_display' | 'delivery_chilled' | 'delivery_frozen';

export const FOOD_TEMP_LIMITS: Record<FoodCheckType, { label: string; compare: 'min' | 'max'; limitC: number }> = {
  cooking: { label: 'Cooking / reheating', compare: 'min', limitC: 75 },
  hot_holding: { label: 'Hot holding', compare: 'min', limitC: 63 },
  cold_display: { label: 'Cold food', compare: 'max', limitC: 8 },
  delivery_chilled: { label: 'Chilled delivery', compare: 'max', limitC: 8 },
  delivery_frozen: { label: 'Frozen delivery', compare: 'max', limitC: -12 },
};

export function foodReadingInRange(type: FoodCheckType, readingC: number): boolean {
  const limit = FOOD_TEMP_LIMITS[type];
  return limit.compare === 'min' ? readingC >= limit.limitC : readingC <= limit.limitC;
}
