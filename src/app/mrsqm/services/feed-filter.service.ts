import { Injectable, computed, signal } from '@angular/core';
import { DealType, ListingType } from '../types/database';

// Фильтры ленты — глобальное состояние, переживает переходы между страницами.
export interface FeedFilters {
  propertyType: string | null;
  bedrooms: number | null;
  priceMin: number | null;
  priceMax: number | null;
  listingType: ListingType | 'all';
  distressOnly: boolean;
}

export const EMPTY_FILTERS: FeedFilters = {
  propertyType: null,
  bedrooms: null,
  priceMin: null,
  priceMax: null,
  listingType: 'all',
  distressOnly: false,
};

@Injectable({ providedIn: 'root' })
export class FeedFilterService {
  readonly dealType = signal<DealType>('sale');
  readonly filters = signal<FeedFilters>({ ...EMPTY_FILTERS });

  // Сколько фильтров активно — для бейджа на иконке.
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let n = 0;
    if (f.propertyType) n++;
    if (f.bedrooms !== null) n++;
    if (f.priceMin !== null || f.priceMax !== null) n++;
    if (f.listingType !== 'all') n++;
    if (f.distressOnly) n++;
    return n;
  });

  set(type: DealType): void {
    this.dealType.set(type);
  }

  patch(patch: Partial<FeedFilters>): void {
    this.filters.set({ ...this.filters(), ...patch });
  }

  reset(): void {
    this.filters.set({ ...EMPTY_FILTERS });
  }
}
