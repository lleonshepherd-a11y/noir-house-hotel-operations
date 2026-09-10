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
