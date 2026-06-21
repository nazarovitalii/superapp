import { Injectable, computed, signal } from '@angular/core';
import { DealType, ListingType } from '../types/database';

// Сортировка ленты — значения p_sort_by из get_feed (default = по свежести).
export type FeedSortBy = 'default' | 'price_desc' | 'price_asc' | 'date_asc';

// Охват ленты (пилюля-селект слева в тулбаре); метки UI в скобках (WP-D):
//   public     — весь инвентарь города: public + network (по умолчанию) («All Inventory»)
//   friends    — объекты сети (друзья + коллеги) («Friends Inventory»)
//   my         — мои объекты («My Inventory»)
//   favourites — добавленные в избранное («Favourites»)
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
  // ─── новые фильтры (v2) ──────────────────────────────────────────────────────
  plotMin: number | null; // p_plot_sqft_min
  plotMax: number | null; // p_plot_sqft_max
  developerIds: string[]; // p_developer_ids (мультиселект застройщиков)
  viewIds: string[]; // p_view_ids (мультиселект видов)
  positionIds: string[]; // p_position_ids (мультиселект позиций)
  amenityIds: string[]; // p_amenity_ids (мультиселект удобств)
  floorLevelIds: string[]; // p_floor_level_ids (мультиселект уровней этажа)
  floorsInUnitIds: string[]; // p_floors_in_unit_ids (мультиселект числа этажей в квартире)
  isMaid: boolean | null; // p_is_maid
  isHotelPool: boolean | null; // p_is_hotel_pool
  isVastu: boolean | null; // p_is_vastu
  isStudy: boolean | null; // p_is_study
  isReduced: boolean | null; // p_is_reduced
  isBelowOp: boolean | null; // p_is_below_op
  pricePeriod: string | null; // p_price_period (аренда: yearly|monthly)
  occupancyStatus: string[]; // p_occupancy_status (мультиселект заселённости)
  completionYears: number[]; // p_completion_year (off-plan)
  completionQ: string[]; // p_completion_q (off-plan)
  cheques: number[]; // p_cheques (аренда)
}

// Полное состояние поиска — сохраняется в saved_filters.filters (jsonb).
// Содержит все сигналы ленты, нужные для полного восстановления.
export interface SavedFilterPayload {
  filters: FeedFilters;
  dealType: DealType;
  handover: FeedHandover | null;
  scope: FeedScope;
  category: PropertyCategory | null;
  locations: { id: string; name: string }[];
}

// Строка таблицы saved_filters, возвращаемая RPC get_saved_filters / save_filter.
export interface SavedFilter {
  id: string;
  auto_name: string | null;
  filters: SavedFilterPayload;
  notification_type: string | null;
  created_at: string;
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
  // ─── новые фильтры (v2) ──────────────────────────────────────────────────────
  plotMin: null,
  plotMax: null,
  developerIds: [],
  viewIds: [],
  positionIds: [],
  amenityIds: [],
  floorLevelIds: [],
  floorsInUnitIds: [],
  isMaid: null,
  isHotelPool: null,
  isVastu: null,
  isStudy: null,
  isReduced: null,
  isBelowOp: null,
  pricePeriod: null,
  occupancyStatus: [],
  completionYears: [],
  completionQ: [],
  cheques: [],
};

@Injectable({ providedIn: 'root' })
export class FeedFilterService {
  readonly dealType = signal<DealType>('sale');
  readonly filters = signal<FeedFilters>({ ...EMPTY_FILTERS });
  readonly sortBy = signal<FeedSortBy>('default');
  // По умолчанию показываем публичную ленту (как раньше показывался охват «Все»).
  readonly scope = signal<FeedScope>('public');
  // Категория и готовность вынесены в тулбар как отдельные селекты.
  readonly category = signal<PropertyCategory | null>(null);
  readonly handover = signal<FeedHandover | null>(null);
  // Поиск-лупа из глобального хедера: свободный текст по описанию (p_description).
  readonly searchQuery = signal<string>('');
  // Выбранные адреса из автокомплита тулбара → p_location_ids в get_feed
  // (реальный серверный фильтр; [] = адреса не выбраны; максимум MAX_LOCATIONS).
  readonly locationFilters = signal<{ id: string; name: string }[]>([]);
  readonly MAX_LOCATIONS = 5;

  // Добавляет локацию. Дубликат по id или превышение лимита — игнорируется.
  addLocation(loc: { id: string; name: string }): void {
    const cur = this.locationFilters();
    if (cur.some((l) => l.id === loc.id) || cur.length >= this.MAX_LOCATIONS) return;
    this.locationFilters.set([...cur, loc]);
  }

  // Убирает локацию по id.
  removeLocation(id: string): void {
    this.locationFilters.set(this.locationFilters().filter((l) => l.id !== id));
  }

  // Сбрасывает все выбранные локации.
  clearLocations(): void {
    this.locationFilters.set([]);
  }

  // ─── Snapshot / dirty-трекинг сохранённых фильтров ──────────────────────────

  // Id сейчас загруженного сохранённого фильтра; null = ни один не загружен.
  readonly loadedFilterId = signal<string | null>(null);
  // JSON-снапшот на момент загрузки фильтра — для dirty-сравнения.
  readonly loadedSnapshotJson = signal<string | null>(null);

  // true, если пользователь изменил что-либо после загрузки сохранённого фильтра.
  readonly isDirtySinceLoad = computed(
    () =>
      this.loadedFilterId() !== null &&
      JSON.stringify(this.snapshot()) !== this.loadedSnapshotJson(),
  );

  // Собирает снапшот текущего состояния ленты.
  snapshot(): SavedFilterPayload {
    return {
      filters: this.filters(),
      dealType: this.dealType(),
      handover: this.handover(),
      scope: this.scope(),
      category: this.category(),
      locations: this.locationFilters(),
    };
  }

  // Восстанавливает всё состояние из снапшота.
  applySnapshot(p: SavedFilterPayload): void {
    this.filters.set({ ...p.filters });
    this.dealType.set(p.dealType);
    this.handover.set(p.handover);
    this.scope.set(p.scope);
    this.category.set(p.category);
    this.locationFilters.set([...p.locations]);
  }

  // Применить снапшот + пометить как «загружен» (isDirtySinceLoad = false).
  markLoaded(id: string, payload: SavedFilterPayload): void {
    this.applySnapshot(payload);
    this.loadedFilterId.set(id);
    this.loadedSnapshotJson.set(JSON.stringify(this.snapshot()));
  }

  // Снять пометку загруженного фильтра (не трогает сами фильтры).
  clearLoaded(): void {
    this.loadedFilterId.set(null);
    this.loadedSnapshotJson.set(null);
  }

  // Выбранный агент (ФИО) из автокомплита → клиентский фильтр загруженных строк
  // ленты по owner_full_name. Серверного параметра по агенту в get_feed нет (интерим).
  readonly agentQuery = signal<string>('');

  // Сколько фильтров активно — для индикации на кнопке фильтров в хедере.
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let n = 0;
    // Живые контролы (не draft): каждая выбранная локация = +1
    n += this.locationFilters().length;
    // Тип/категория = 1 (единый каскадный блок)
    if (f.unitTypeId || this.category()) n++;
    // Готовность (Ready/Off-Plan выбрана)
    if (this.handover()) n++;
    // Охват не дефолтный
    if (this.scope() !== 'public') n++;
    // Draft-фильтры
    if (f.subTypeIds.length) n++;
    if (f.bedrooms.length) n++;
    if (f.bathrooms.length) n++;
    if (f.priceMin !== null || f.priceMax !== null) n++;
    if (f.areaMin !== null || f.areaMax !== null) n++;
    if (f.furnished) n++;
    if (f.listingType !== 'all') n++;
    // Новые фильтры (v2)
    if (f.plotMin !== null || f.plotMax !== null) n++; // одна группа для обоих
    if (f.developerIds.length) n++;
    if (f.viewIds.length) n++;
    if (f.positionIds.length) n++;
    if (f.amenityIds.length) n++;
    if (f.floorLevelIds.length) n++;
    if (f.floorsInUnitIds.length) n++;
    if (f.isMaid !== null) n++;
    if (f.isHotelPool !== null) n++;
    if (f.isVastu !== null) n++;
    if (f.isStudy !== null) n++;
    if (f.isReduced !== null) n++;
    if (f.isBelowOp !== null) n++;
    if (f.pricePeriod !== null) n++;
    if (f.occupancyStatus.length) n++;
    if (f.completionYears.length) n++;
    if (f.completionQ.length) n++;
    if (f.cheques.length) n++;
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

  // Сегмент из селекта тулбара: null = All Segments (прямая установка, без toggle).
  setSegment(value: FeedHandover | null): void {
    this.handover.set(value);
  }

  // Мега-дропдаун типа: выбрать всю категорию (без конкретного типа).
  selectCategoryAll(value: PropertyCategory): void {
    this.category.set(value);
    this.patch({ unitTypeId: null, subTypeIds: [] });
  }

  // Мега-дропдаун типа: выбрать unit_type внутри категории (сбрасывает подтипы).
  selectUnitType(value: PropertyCategory, unitTypeId: string): void {
    this.category.set(value);
    this.patch({ unitTypeId, subTypeIds: [] });
  }

  // Мега-дропдаун типа: toggle подтипа (мультиселект p_sub_type_ids).
  toggleSubType(id: string): void {
    const arr = this.filters().subTypeIds;
    this.patch({
      subTypeIds: arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id],
    });
  }

  // Сброс выбора типа (категория + тип + подтипы).
  clearType(): void {
    this.category.set(null);
    this.patch({ unitTypeId: null, subTypeIds: [] });
  }

  patch(patch: Partial<FeedFilters>): void {
    this.filters.set({ ...this.filters(), ...patch });
  }

  reset(): void {
    this.filters.set({ ...EMPTY_FILTERS });
  }
}
