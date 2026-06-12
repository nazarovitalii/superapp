import { Injectable, computed, signal } from '@angular/core';
import { DealType, ListingType } from '../types/database';

// Сортировка ленты — значения p_sort_by из get_feed (default = по свежести).
export type FeedSortBy = 'default' | 'price_desc' | 'price_asc' | 'date_asc';

// Охват ленты (селект слева от Sale/Rent в хедере):
//   public     — все публичные объекты города (по умолчанию)
//   friends    — объекты сети (друзья + коллеги)
//   my         — мои объекты
//   favourites — добавленные в избранное
// Фильтруется на клиенте по owner_id / is_network / visibility / savedIds
// (в get_feed серверного параметра охвата пока нет — см. TODO API).
export type FeedScope = 'public' | 'friends' | 'my' | 'favourites';

// Категория недвижимости (переключатель как Sale/Rent): Residential / Commercial.
// В get_feed маппится в p_category_id (uuid) — id резолвится из get_filter_options.
export type PropertyCategory = 'residential' | 'commercial';

// Готовность (переключатель как Sale/Rent): Ready / Off-Plan.
// Совпадает с p_handover (ready | offplan) в get_feed.
export type FeedHandover = 'ready' | 'offplan';

// Фильтры ленты — только то, что реально умеет RPC get_feed.
export interface FeedFilters {
  unitTypeId: string | null; // p_unit_type_id (uuid из get_filter_options)
  subTypeIds: string[]; // p_sub_type_ids (мультиселект подтипов)
  bedrooms: number[]; // p_bedrooms (мультиселект)
  bathrooms: number[]; // p_bathrooms (мультиселект)
  priceMin: number | null; // p_price_min
  priceMax: number | null; // p_price_max
  areaMin: number | null; // p_area_sqft_min
  areaMax: number | null; // p_area_sqft_max
  furnished: string | null; // p_furnished: furnished | unfurnished
  listingType: ListingType | 'all'; // p_listing_type
}

export const EMPTY_FILTERS: FeedFilters = {
  unitTypeId: null,
  subTypeIds: [],
  bedrooms: [],
  bathrooms: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  furnished: null,
  listingType: 'all',
};

@Injectable({ providedIn: 'root' })
export class FeedFilterService {
  readonly dealType = signal<DealType>('sale');
  readonly filters = signal<FeedFilters>({ ...EMPTY_FILTERS });
  readonly sortBy = signal<FeedSortBy>('default');
  // По умолчанию показываем публичную ленту (как раньше показывался охват «Все»).
  readonly scope = signal<FeedScope>('public');
  // Категория и готовность вынесены в хедер как отдельные переключатели.
  readonly category = signal<PropertyCategory | null>(null);
  readonly handover = signal<FeedHandover | null>(null);
  // Поисковая строка из хедера (лупа): по описанию объекта (p_description).
  // Поиск по агенту (ФИО/телефон) требует доработки get_feed — см. DB-батч.
  readonly searchQuery = signal<string>('');

  // Сколько фильтров активно — для индикации на кнопке фильтров в хедере.
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let n = 0;
    if (f.unitTypeId) n++;
    if (f.subTypeIds.length) n++;
    if (f.bedrooms.length) n++;
    if (f.bathrooms.length) n++;
    if (f.priceMin !== null || f.priceMax !== null) n++;
    if (f.areaMin !== null || f.areaMax !== null) n++;
    if (f.furnished) n++;
    if (f.listingType !== 'all') n++;
    return n;
  });

  set(type: DealType): void {
    this.dealType.set(type);
  }

  // Переключатель Residential/Commercial: повторный клик сбрасывает.
  // При смене категории сбрасываем тип/подтип — они привязаны к категории.
  setCategory(value: PropertyCategory): void {
    const next = this.category() === value ? null : value;
    this.category.set(next);
    this.patch({ unitTypeId: null, subTypeIds: [] });
  }

  // Переключатель Ready/Off-Plan: повторный клик сбрасывает.
  setHandover(value: FeedHandover): void {
    this.handover.set(this.handover() === value ? null : value);
  }

  patch(patch: Partial<FeedFilters>): void {
    this.filters.set({ ...this.filters(), ...patch });
  }

  reset(): void {
    this.filters.set({ ...EMPTY_FILTERS });
  }
}
