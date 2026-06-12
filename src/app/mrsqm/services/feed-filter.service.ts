import { Injectable, computed, signal } from '@angular/core';
import { DealType, ListingType } from '../types/database';

// Сортировка ленты — значения p_sort_by из get_feed (default = по свежести).
export type FeedSortBy = 'default' | 'price_desc' | 'price_asc' | 'date_asc';

// Охват ленты: все / мои объекты / объекты сети / public.
// Фильтруется на клиенте по owner_id / is_network / visibility
// (в get_feed серверного параметра пока нет — см. TODO API).
export type FeedScope = 'all' | 'mine' | 'network' | 'public';

// Фильтры ленты — только то, что реально умеет RPC get_feed.
export interface FeedFilters {
  unitTypeId: string | null; // p_unit_type_id (uuid из get_filter_options)
  bedrooms: number[]; // p_bedrooms (мультиселект)
  bathrooms: number[]; // p_bathrooms (мультиселект)
  priceMin: number | null; // p_price_min
  priceMax: number | null; // p_price_max
  areaMin: number | null; // p_area_sqft_min
  areaMax: number | null; // p_area_sqft_max
  furnished: string | null; // p_furnished: furnished | unfurnished
  handover: string | null; // p_handover: ready | offplan
  listingType: ListingType | 'all'; // p_listing_type
}

export const EMPTY_FILTERS: FeedFilters = {
  unitTypeId: null,
  bedrooms: [],
  bathrooms: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  furnished: null,
  handover: null,
  listingType: 'all',
};

@Injectable({ providedIn: 'root' })
export class FeedFilterService {
  readonly dealType = signal<DealType>('sale');
  readonly filters = signal<FeedFilters>({ ...EMPTY_FILTERS });
  readonly sortBy = signal<FeedSortBy>('default');
  readonly scope = signal<FeedScope>('all');

  // Сколько фильтров активно — для индикации на кнопке фильтров в хедере.
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let n = 0;
    if (f.unitTypeId) n++;
    if (f.bedrooms.length) n++;
    if (f.bathrooms.length) n++;
    if (f.priceMin !== null || f.priceMax !== null) n++;
    if (f.areaMin !== null || f.areaMax !== null) n++;
    if (f.furnished) n++;
    if (f.handover) n++;
    if (f.listingType !== 'all') n++;
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
