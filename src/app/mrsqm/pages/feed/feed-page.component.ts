import {
  Component,
  inject,
  ChangeDetectionStrategy,
  effect,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import {
  FeedFilterService,
  FeedScope,
  FeedSortBy,
  PropertyCategory,
  FeedHandover,
} from '../../services/feed-filter.service';
import {
  DealType,
  FeedParams,
  FeedResponse,
  FilterOptionId,
  FilterOptions,
  LocationSearchItem,
  PropertyFeedItem,
} from '../../types/database';
import { PropertyCardComponent } from '../../components/property-card/property-card.component';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';
import { FeedSelectionService } from '../../services/feed-selection.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { signal } from '@angular/core';

const PAGE_SIZE = 20;

@Component({
  selector: 'mrsqm-feed-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatMenuModule,
    PropertyCardComponent,
  ],
  templateUrl: './feed-page.component.html',
  styleUrl: './feed-page.component.scss',
})
export class FeedPageComponent {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _panels = inject(PanelContentService);
  private readonly _createService = inject(PropertyCreateService);
  private readonly _saved = inject(SavedPropertiesService);
  readonly filter = inject(FeedFilterService);
  // Множественный выбор чекбоксами — общий сервис с меню в главном хедере.
  readonly selection = inject(FeedSelectionService);
  private readonly _auth = inject(MrsqmAuthService);

  // unit_type_id/sub_type_id (uuid) → название типа. Заполняется из справочников.
  private _typeLabels: Map<string, string> | null = null;
  // value категории ('residential'|'commercial') → uuid для p_category_id.
  private _categoryIds: Map<string, string> | null = null;

  readonly properties = signal<PropertyFeedItem[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal(false);
  readonly countTotal = signal(0);
  readonly offset = signal(0);
  readonly hasMore = signal(false);
  // id объектов в избранном (для иконки-закладки).
  readonly savedIds = signal<Set<string>>(new Set());

  get selectedPropertyId(): string | null {
    return this._panels.selectedProperty()?.id ?? null;
  }

  // Охват Public / Friends / My / Favourites — фильтр на клиенте по полям
  // get_feed (visibility / is_network / owner_id) и savedIds: серверного
  // параметра охвата в RPC пока нет.
  readonly visibleProperties = computed<PropertyFeedItem[]>(() => {
    const items = this.properties();
    const scope = this.filter.scope();
    const myId = this._auth.currentUser()?.id ?? null;
    let scoped: PropertyFeedItem[];
    switch (scope) {
      case 'public':
        // Public = вся доступная лента: get_feed уже отдаёт только public + network
        // объекты города, и count_total считает их вместе. Поэтому фильтр по
        // visibility не нужен — иначе таблица (строго 'public') расходится со
        // счётчиком (public+network) и под Public пусто при ненулевом счётчике.
        // (WP-D переименует этот охват в «All Inventory».)
        scoped = items;
        break;
      case 'friends':
        scoped = items.filter((p) => p.is_network);
        break;
      case 'my':
        scoped = items.filter((p) => p.owner_id === myId);
        break;
      case 'favourites':
        scoped = items.filter((p) => this.savedIds().has(p.id));
        break;
    }
    // Клиентский фильтр по агенту (ФИО) — интерим, серверного параметра нет.
    const agent = this.filter.agentQuery().trim().toLowerCase();
    if (agent) {
      scoped = scoped.filter((p) =>
        (p.owner_full_name ?? '').toLowerCase().includes(agent),
      );
    }
    return scoped;
  });

  // Счётчик в пилюле охвата («Public ▾ · 1 154»).
  // Для public — серверный count_total; для остальных охватов считаем
  // отфильтрованные на клиенте (серверного count по охвату нет).
  readonly foundCount = computed(() =>
    this.filter.scope() === 'public'
      ? this.countTotal()
      : this.visibleProperties().length,
  );

  // Охват ленты — пилюля слева в тулбаре.
  readonly scopeOptions: ReadonlyArray<{ value: FeedScope; label: string }> = [
    { value: 'public', label: 'Public' },
    { value: 'friends', label: 'Friends' },
    { value: 'my', label: 'Private' },
    { value: 'favourites', label: 'Favourites' },
  ];

  readonly scopeLabel = computed(
    () =>
      this.scopeOptions.find((o) => o.value === this.filter.scope())?.label ?? 'Public',
  );

  setScope(scope: FeedScope): void {
    this.filter.scope.set(scope);
  }

  setDealType(type: DealType): void {
    this.filter.set(type);
  }

  // Сортировка ленты (p_sort_by в get_feed)
  readonly sortOptions: ReadonlyArray<{ value: FeedSortBy; label: string }> = [
    { value: 'default', label: 'Сначала новые' },
    { value: 'price_desc', label: 'Сначала дорогие' },
    { value: 'price_asc', label: 'Сначала дешёвые' },
    { value: 'date_asc', label: 'Сначала давние' },
  ];

  setSort(sort: FeedSortBy): void {
    this.filter.sortBy.set(sort);
  }

  toggleFilterPanel(): void {
    this._panels.toggleFilterPanel();
  }

  // ─── Сегмент (готовность): All Segments / Ready / Off-Plan ─────────────────
  readonly segmentOptions: ReadonlyArray<{ value: FeedHandover | null; label: string }> =
    [
      { value: null, label: 'All Segments' },
      { value: 'ready', label: 'Ready' },
      { value: 'offplan', label: 'Off-Plan' },
    ];

  readonly segmentLabel = computed(
    () =>
      this.segmentOptions.find((o) => o.value === this.filter.handover())?.label ??
      'All Segments',
  );

  setSegment(value: FeedHandover | null): void {
    this.filter.setSegment(value);
  }

  // ─── Сделка: Sale / Rent ───────────────────────────────────────────────────
  readonly dealOptions: ReadonlyArray<{ value: DealType; label: string }> = [
    { value: 'sale', label: 'Sale' },
    { value: 'rent', label: 'Rent' },
  ];

  readonly dealLabel = computed(
    () =>
      this.dealOptions.find((o) => o.value === this.filter.dealType())?.label ?? 'Sale',
  );

  // ─── Мега-дропдаун Residential / Commercial ────────────────────────────────
  // Справочники (категории/типы/подтипы) для дерева дропдауна.
  readonly filterOptions = signal<FilterOptions | null>(null);

  // Дерево категория → unit_types → sub_types (по parent_id из get_filter_options).
  readonly typeTree = computed(() => {
    const opts = this.filterOptions();
    const build = (
      catValue: PropertyCategory,
    ): {
      catId: string | null;
      units: { id: string; label: string; subs: FilterOptionId[] }[];
    } => {
      const cat = opts?.categories?.find((c) => c.value === catValue);
      if (!opts || !cat) return { catId: null, units: [] };
      const units = (opts.unit_types ?? [])
        .filter((u) => u.parent_id === cat.id)
        .map((u) => ({
          id: u.id,
          label: u.label_en,
          subs: (opts.sub_types ?? []).filter((s) => s.parent_id === u.id),
        }));
      return { catId: cat.id, units };
    };
    return { residential: build('residential'), commercial: build('commercial') };
  });

  // Лейбл кнопки типа: выбранный подтип(ы)/тип/категория или плейсхолдер.
  readonly typeLabel = computed(() => {
    const opts = this.filterOptions();
    const f = this.filter.filters();
    const cat = this.filter.category();
    if (opts && f.unitTypeId) {
      const unit = opts.unit_types?.find((u) => u.id === f.unitTypeId);
      const base = unit?.label_en ?? 'Тип';
      return f.subTypeIds.length ? `${base} · ${f.subTypeIds.length}` : base;
    }
    if (cat) return cat === 'residential' ? 'Residential' : 'Commercial';
    return 'Тип объекта';
  });

  readonly hasTypeSelection = computed(
    () => !!this.filter.category() || !!this.filter.filters().unitTypeId,
  );

  selectCategoryAll(value: PropertyCategory): void {
    this.filter.selectCategoryAll(value);
  }

  selectUnitType(value: PropertyCategory, unitTypeId: string): void {
    this.filter.selectUnitType(value, unitTypeId);
  }

  toggleSubType(id: string): void {
    this.filter.toggleSubType(id);
  }

  isSubTypeActive(id: string): boolean {
    return this.filter.filters().subTypeIds.includes(id);
  }

  clearType(): void {
    this.filter.clearType();
  }

  // ─── Автокомплит «Адрес или агент» ─────────────────────────────────────────
  readonly searchInput = signal<string>('');
  readonly locationResults = signal<LocationSearchItem[]>([]);
  readonly showSuggest = signal<boolean>(false);
  private _searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Совпадения по агенту (ФИО) из уже загруженных строк ленты (distinct, до 6).
  readonly agentMatches = computed<string[]>(() => {
    const q = this.searchInput().trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    for (const p of this.properties()) {
      const name = p.owner_full_name;
      if (name && name.toLowerCase().includes(q) && !seen.has(name)) {
        seen.add(name);
        if (seen.size >= 6) break;
      }
    }
    return [...seen];
  });

  onSearchInput(value: string): void {
    this.searchInput.set(value);
    this.showSuggest.set(true);
    if (this._searchTimer) clearTimeout(this._searchTimer);
    const q = value.trim();
    if (q.length < 2) {
      this.locationResults.set([]);
      return;
    }
    this._searchTimer = setTimeout(() => {
      void this._createService.searchLocations(q).then((res) => {
        this.locationResults.set(res);
      });
    }, 250);
  }

  onSearchFocus(): void {
    if (this.searchInput().trim().length >= 2) this.showSuggest.set(true);
  }

  // Закрываем подсказки с задержкой, чтобы успел сработать клик по элементу.
  onSearchBlur(): void {
    setTimeout(() => this.showSuggest.set(false), 150);
  }

  pickLocation(item: LocationSearchItem): void {
    this.filter.locationFilter.set({ id: item.id, name: item.name });
    this.filter.agentQuery.set('');
    this.searchInput.set('');
    this.locationResults.set([]);
    this.showSuggest.set(false);
  }

  pickAgent(name: string): void {
    this.filter.agentQuery.set(name);
    this.filter.locationFilter.set(null);
    this.searchInput.set('');
    this.showSuggest.set(false);
  }

  clearLocation(): void {
    this.filter.locationFilter.set(null);
  }

  clearAgent(): void {
    this.filter.agentQuery.set('');
  }

  constructor() {
    void this._loadSaved();
    void this._loadFilterOptions();
    // Перезагружаем при смене dealType, категории, готовности, выбранного адреса,
    // фильтров или сортировки. Охват (scope) и агент — клиентские, перезагрузки
    // не требуют.
    effect(() => {
      this.filter.dealType();
      this.filter.category();
      this.filter.handover();
      this.filter.locationFilter();
      this.filter.searchQuery();
      this.filter.filters();
      this.filter.sortBy();
      this.offset.set(0);
      this.properties.set([]);
      void this._load();
    });
  }

  private async _loadFilterOptions(): Promise<void> {
    try {
      this.filterOptions.set(await this._createService.getFilterOptions());
    } catch {
      // Справочники недоступны — мега-дропдаун покажет пустые колонки.
    }
  }

  private async _loadSaved(): Promise<void> {
    try {
      this.savedIds.set(await this._saved.getSavedIds());
    } catch {
      // Избранное недоступно — иконки просто будут пустыми.
    }
  }

  // Toggle избранного по клику на закладку. Оптимистично обновляем Set.
  async toggleSaved(property: PropertyFeedItem): Promise<void> {
    const id = property.id;
    const next = new Set(this.savedIds());
    const wasSaved = next.has(id);
    // оптимистично
    if (wasSaved) next.delete(id);
    else next.add(id);
    this.savedIds.set(next);
    try {
      const isSaved = await this._saved.toggle(id);
      const fixed = new Set(this.savedIds());
      if (isSaved) fixed.add(id);
      else fixed.delete(id);
      this.savedIds.set(fixed);
    } catch {
      // откат при ошибке
      const revert = new Set(this.savedIds());
      if (wasSaved) revert.add(id);
      else revert.delete(id);
      this.savedIds.set(revert);
    }
  }

  async loadMore(): Promise<void> {
    this.offset.set(this.offset() + PAGE_SIZE);
    await this._load(true);
  }

  openDetail(property: PropertyFeedItem): void {
    this._panels.openProperty(property);
  }

  // Тоггл правого sidebar по hover-кнопке: если карточка уже открыта —
  // сворачиваем панель, иначе открываем (item 2).
  toggleDetail(property: PropertyFeedItem): void {
    if (this.selectedPropertyId === property.id) {
      this._panels.closeProperty();
    } else {
      this._panels.openProperty(property);
    }
  }

  // Маппинг фильтров ленты в параметры RPC get_feed.
  private async _buildParams(): Promise<FeedParams> {
    const f = this.filter.filters();
    const categoryVal = this.filter.category();
    const loc = this.filter.locationFilter();
    const search = this.filter.searchQuery().trim();
    return {
      p_deal_type: this.filter.dealType(),
      p_limit: PAGE_SIZE,
      p_offset: this.offset(),
      p_sort_by: this.filter.sortBy(),
      p_category_id: categoryVal ? await this._getCategoryId(categoryVal) : null,
      p_unit_type_id: f.unitTypeId,
      p_sub_type_ids: f.subTypeIds.length ? f.subTypeIds : null,
      p_bedrooms: f.bedrooms.length ? f.bedrooms : null,
      p_bathrooms: f.bathrooms.length ? f.bathrooms : null,
      p_price_min: f.priceMin,
      p_price_max: f.priceMax,
      p_area_sqft_min: f.areaMin,
      p_area_sqft_max: f.areaMax,
      p_furnished: f.furnished,
      p_handover: this.filter.handover(),
      p_listing_type: f.listingType !== 'all' ? f.listingType : null,
      // Адрес из автокомплита → серверный фильтр по локации.
      p_location_ids: loc ? [loc.id] : null,
      // Поиск-лупа из хедера — свободный текст по описанию объекта.
      p_description: search.length >= 2 ? search : null,
    };
  }

  private async _load(append = false): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    try {
      const res = await this._supabase.rpc<FeedResponse>(
        'get_feed',
        await this._buildParams(),
      );
      const items = await this._withTypeLabels(res.results ?? []);
      // Пустой результат — валиден (объектов нет), показываем empty-state.
      this.properties.set(append ? [...this.properties(), ...items] : items);
      this.countTotal.set(res.count_total ?? 0);
      this.hasMore.set(this.properties().length < (res.count_total ?? 0));
    } catch {
      // Ошибка RPC (нет города/сети) — не подменяем моками, честно показываем сбой.
      this.loadError.set(true);
      if (!append) {
        this.properties.set([]);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  // Резолвим название типа: get_feed отдаёт только unit_type_id/sub_type_id (uuid),
  // а карточка показывает property_type. Берём label из справочников (кэш).
  private async _withTypeLabels(items: PropertyFeedItem[]): Promise<PropertyFeedItem[]> {
    if (!items.length) {
      return items;
    }
    const labels = await this._getTypeLabels();
    return items.map((it) => {
      const label =
        (it.sub_type_id && labels.get(it.sub_type_id)) ||
        (it.unit_type_id && labels.get(it.unit_type_id)) ||
        null;
      return label ? { ...it, property_type: label } : it;
    });
  }

  // value категории ('residential'|'commercial') → uuid p_category_id.
  private async _getCategoryId(value: string): Promise<string | null> {
    if (!this._categoryIds) {
      const map = new Map<string, string>();
      try {
        const opts = await this._createService.getFilterOptions();
        for (const c of opts.categories) map.set(c.value, c.id);
      } catch {
        // Справочник недоступен — фильтр по категории просто не применится.
      }
      this._categoryIds = map;
    }
    return this._categoryIds.get(value) ?? null;
  }

  private async _getTypeLabels(): Promise<Map<string, string>> {
    if (this._typeLabels) {
      return this._typeLabels;
    }
    const map = new Map<string, string>();
    try {
      const opts = await this._createService.getFilterOptions();
      for (const u of opts.unit_types) map.set(u.id, u.label_en);
      for (const s of opts.sub_types) map.set(s.id, s.label_en);
    } catch {
      // Справочники недоступны — тип просто останется пустым, не критично.
    }
    this._typeLabels = map;
    return map;
  }
}
