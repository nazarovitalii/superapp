import {
  Component,
  inject,
  ChangeDetectionStrategy,
  DestroyRef,
  effect,
  computed,
  signal,
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
import { PropertyOwnerService } from '../../services/property-owner.service';
import { SnackService } from '../../../core/snack/snack.service';
import { SnackType } from '../../../core/snack/snack.model';
import { SeenTrackingService } from '../../services/seen-tracking.service';

// W-4: разрешённые типы для вкладки Commercial (регистронезависимое сравнение)
const COMMERCIAL_ALLOWLIST = new Set([
  'office',
  'hotel apartment',
  'shop',
  'retail',
  'warehouse',
  'villa',
  'bulk unit',
  'land',
  'floor',
  'building',
  'factory',
]);

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
  private readonly _snack = inject(SnackService);
  readonly filter = inject(FeedFilterService);
  // Множественный выбор чекбоксами — общий сервис с меню в главном хедере.
  readonly selection = inject(FeedSelectionService);
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _owner = inject(PropertyOwnerService);
  private readonly _seen = inject(SeenTrackingService);
  private readonly _destroyRef = inject(DestroyRef);
  // Активные таймеры гашения полосок — чистим при destroy.
  private readonly _stripeTimers = new Set<ReturnType<typeof setTimeout>>();

  // W-1: раскрыта ли панель локаций снизу (управляется кнопкой-стрелкой)
  readonly locExpanded = signal(false);

  // W-1: количество адресов, скрытых за кнопкой-стрелкой (>= 2 локации → inline только первый чип)
  readonly locHiddenCount = computed(() =>
    Math.max(0, this.filter.locationFilters().length - 1),
  );

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
  // Текущий юзер — для CD-1: у своих объектов закладку «в избранное» не показываем.
  readonly currentUserId = computed(() => this._auth.currentUser()?.id ?? null);

  get selectedPropertyId(): string | null {
    return this._panels.selectedProperty()?.id ?? null;
  }

  // Сервер отдаёт нужный охват (p_scope). На клиенте остаётся только вид
  // Favourites (закладки поверх загрузки 'all') и интерим-фильтр по агенту (ФИО).
  readonly visibleProperties = computed<PropertyFeedItem[]>(() => {
    let scoped = this.properties();
    if (this.filter.scope() === 'favourites') {
      scoped = scoped.filter((p) => this.savedIds().has(p.id));
    }
    const agent = this.filter.agentQuery().trim().toLowerCase();
    if (agent) {
      scoped = scoped.filter((p) =>
        (p.owner_full_name ?? '').toLowerCase().includes(agent),
      );
    }
    return scoped;
  });

  // Серверные охваты (public/friends/my) — серверный count_total; Favourites — клиентский.
  readonly foundCount = computed(() =>
    this.filter.scope() === 'favourites'
      ? this.visibleProperties().length
      : this.countTotal(),
  );

  // Охват ленты — пилюля слева в тулбаре (метки WP-D):
  //   Public Inventory  — весь инвентарь (public + network своей сети), что вернул get_feed
  //   Friends Inventory — только объекты сети
  //   My Inventory      — мои объекты
  //   Favourites        — добавленные в избранное
  readonly scopeOptions: ReadonlyArray<{ value: FeedScope; label: string }> = [
    { value: 'public', label: 'Public Inventory' },
    { value: 'friends', label: 'Friends Inventory' },
    { value: 'my', label: 'My Inventory' },
    { value: 'favourites', label: 'Favourites' },
  ];

  readonly scopeLabel = computed(
    () =>
      this.scopeOptions.find((o) => o.value === this.filter.scope())?.label ??
      'Public Inventory',
  );

  setScope(scope: FeedScope): void {
    this.filter.setScope(scope);
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
      let units = (opts.unit_types ?? [])
        .filter((u) => u.parent_id === cat.id)
        .map((u) => ({
          id: u.id,
          label: u.label_en,
          subs: (opts.sub_types ?? []).filter((s) => s.parent_id === u.id),
        }));
      // W-4: для Commercial оставляем только разрешённые типы из COMMERCIAL_ALLOWLIST
      if (catValue === 'commercial') {
        units = units.filter((u) => COMMERCIAL_ALLOWLIST.has(u.label.toLowerCase()));
      }
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

  // ─── Таб-переключатель внутри дропдауна типа (U-2) ────────────────────────
  // Показывает список Residential или Commercial без применения фильтра.
  readonly typePanelCat = signal<PropertyCategory>('residential');

  setTypePanelCat(c: PropertyCategory): void {
    this.typePanelCat.set(c);
  }

  // Синхронизация таба с текущей категорией фильтра при открытии меню.
  onTypeMenuOpened(): void {
    this.setTypePanelCat(this.filter.category() ?? 'residential');
  }

  // ─── Автокомплит «Адрес или агент» ─────────────────────────────────────────
  readonly searchInput = signal<string>('');
  readonly locationResults = signal<LocationSearchItem[]>([]);
  readonly showSuggest = signal<boolean>(false);

  // Подсказки локаций без уже выбранных адресов — один адрес нельзя выбрать дважды.
  readonly visibleLocationResults = computed<LocationSearchItem[]>(() => {
    const selected = new Set(this.filter.locationFilters().map((l) => l.id));
    return this.locationResults().filter((l) => !selected.has(l.id));
  });
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
    // Добавляем локацию в мультиселект; дубликат/лимит игнорируется в сервисе.
    this.filter.addLocation({ id: item.id, name: item.name });
    this.filter.agentQuery.set('');
    this.searchInput.set('');
    this.locationResults.set([]);
    this.showSuggest.set(false);
  }

  pickAgent(name: string): void {
    this.filter.agentQuery.set(name);
    // Агент и локации взаимоисключающи — сбрасываем все выбранные адреса.
    this.filter.clearLocations();
    this.searchInput.set('');
    this.showSuggest.set(false);
  }

  // Убираем конкретную локацию по id (мультиселект).
  // При обнулении списка — сворачиваем раскрытую панель.
  // Кнопка-стрелка в шаблоне видна пока length >= 2 ИЛИ locExpanded(),
  // поэтому «осиротевшей» открытой панели без кнопки больше не возникает.
  removeLocation(id: string): void {
    this.filter.removeLocation(id);
    if (this.filter.locationFilters().length === 0) {
      this.locExpanded.set(false);
    }
  }

  clearAgent(): void {
    this.filter.agentQuery.set('');
  }

  constructor() {
    void this._loadSaved();
    void this._loadFilterOptions();
    // Перезагружаем при смене dealType, категории, готовности, выбранных адресов,
    // фильтров, сортировки, охвата или статуса My. Агент — клиентский, перезагрузки
    // не требует.
    effect(() => {
      this.filter.dealType();
      this.filter.category();
      this.filter.handover();
      this.filter.locationFilters(); // массив локаций (мультиселект)
      this.filter.searchQuery();
      this.filter.filters();
      this.filter.sortBy();
      this.filter.serverScope(); // охват теперь серверный → перезагрузка
      this.filter.myStatus();
      // Загрузка/сброс сохранённого фильтра меняет p_filter_id → перезагрузка
      // (clearLoaded не трогает filters(), поэтому зависимость нужна явно).
      this.filter.loadedFilterId();
      this.offset.set(0);
      this.properties.set([]);
      void this._load();
    });

    // W-7: перезагружаем ленту после действий владельца (актуализация/архив/правка цены).
    // t=0 — первый запуск, пропускаем (лента уже грузится выше).
    effect(() => {
      const t = this._owner.changedTick();
      if (t > 0) {
        this.offset.set(0);
        this.properties.set([]);
        void this._load();
      }
    });

    // Чистим все pending-таймеры при уничтожении компонента.
    this._destroyRef.onDestroy(() => {
      this._stripeTimers.forEach((t) => clearTimeout(t));
      this._stripeTimers.clear();
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
      this._notify(
        isSaved ? 'Добавлено в избранное' : 'Убрано из избранного',
        'SUCCESS',
        isSaved ? 'bookmark' : 'bookmark_border',
      );
    } catch {
      // откат при ошибке
      const revert = new Set(this.savedIds());
      if (wasSaved) revert.add(id);
      else revert.delete(id);
      this.savedIds.set(revert);
      this._notify('Не удалось обновить избранное', 'ERROR');
    }
  }

  /** Помощник: показать снек-сообщение (низ-лево, стиль mrsqm-snack). */
  private _notify(msg: string, type: SnackType, ico?: string): void {
    this._snack.open({
      msg,
      type,
      ...(ico ? { ico } : {}),
      isSkipTranslate: true,
      config: {
        horizontalPosition: 'left',
        verticalPosition: 'bottom',
        panelClass: 'mrsqm-snack',
      },
    });
  }

  async loadMore(): Promise<void> {
    this.offset.set(this.offset() + PAGE_SIZE);
    await this._load(true);
  }

  openDetail(property: PropertyFeedItem): void {
    void this._seen.recordView(property.id);
    this._panels.openProperty(property);
  }

  // Тоггл правого sidebar по hover-кнопке: если карточка уже открыта —
  // сворачиваем панель, иначе открываем (item 2).
  toggleDetail(property: PropertyFeedItem): void {
    if (this.selectedPropertyId === property.id) {
      this._panels.closeProperty();
    } else {
      // Открытие карточки = подтверждённый интерес → engagement-сигнал (seen_full).
      void this._seen.recordView(property.id);
      this._panels.openProperty(property);
    }
  }

  // Маппинг фильтров ленты в параметры RPC get_feed.
  private async _buildParams(): Promise<FeedParams> {
    const f = this.filter.filters();
    const categoryVal = this.filter.category();
    const locs = this.filter.locationFilters(); // мультиселект адресов
    const search = this.filter.searchQuery().trim();
    return {
      p_deal_type: this.filter.dealType(),
      p_limit: PAGE_SIZE,
      p_offset: this.offset(),
      p_scope: this.filter.serverScope(),
      p_my_status: this.filter.serverScope() === 'my' ? this.filter.myStatus() : 'all',
      // Загруженный сохранённый фильтр → per-filter is_unseen (синхрон с бейджем).
      p_filter_id: this.filter.loadedFilterId(),
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
      // Адреса из мультиселекта → серверный фильтр по локациям.
      p_location_ids: locs.length ? locs.map((l) => l.id) : null,
      // Поиск-лупа из хедера — свободный текст по описанию объекта.
      p_description: search.length >= 2 ? search : null,
      // Новые фильтры v2: разработчики, виды, позиции, удобства, этажность.
      p_developer_ids: f.developerIds.length ? f.developerIds : null,
      p_view_ids: f.viewIds.length ? f.viewIds : null,
      p_position_ids: f.positionIds.length ? f.positionIds : null,
      p_amenity_ids: f.amenityIds.length ? f.amenityIds : null,
      p_floor_level_ids: f.floorLevelIds.length ? f.floorLevelIds : null,
      p_floors_in_unit_ids: f.floorsInUnitIds.length ? f.floorsInUnitIds : null,
      p_is_maid: f.isMaid,
      p_is_hotel_pool: f.isHotelPool,
      p_is_vastu: f.isVastu,
      p_is_study: f.isStudy,
      p_is_reduced: f.isReduced,
      p_is_below_op: f.isBelowOp,
      p_plot_sqft_min: f.plotMin,
      p_plot_sqft_max: f.plotMax,
      p_occupancy_status: f.occupancyStatus.length ? f.occupancyStatus : null,
      // Контекст: только аренда.
      p_price_period: this.filter.dealType() === 'rent' ? f.pricePeriod : null,
      p_cheques: this.filter.dealType() === 'rent' && f.cheques.length ? f.cheques : null,
      // Контекст: только off-plan.
      p_completion_year:
        this.filter.handover() === 'offplan' && f.completionYears.length
          ? f.completionYears
          : null,
      p_completion_q:
        this.filter.handover() === 'offplan' && f.completionQ.length
          ? f.completionQ
          : null,
    };
  }

  // Стадия 1: помечаем загруженную страницу показанной (батч), затем через 5с гасим полоски
  // локально (CSS-fade). На следующем чтении get_feed они уже не is_unseen (shown_at обновлён).
  private _markPageShown(items: PropertyFeedItem[]): void {
    const ids = items.map((it) => it.id);
    if (!ids.length) return;
    void this._seen.markShown(ids);

    const idSet = new Set(ids);
    const timer = setTimeout(() => {
      this._stripeTimers.delete(timer);
      // Локально гасим точки непросмотра в ленте (CSS-fade).
      this.properties.update((arr) =>
        arr.map((it) =>
          idSet.has(it.id) && it.is_unseen ? { ...it, is_unseen: false } : it,
        ),
      );
    }, 5000);
    this._stripeTimers.add(timer);
  }

  private async _load(append = false): Promise<void> {
    // Свежая загрузка (не пагинация) = новый список. Гасим pending-таймеры прошлого
    // списка: иначе устаревший 5с-таймер очистит is_unseen у совпадающих по id
    // объектов нового списка раньше времени → кружки гаснут за ~1с, пока бейдж
    // фильтра пульсирует свои 5с (десинк при переходе по сохранённому фильтру).
    if (!append) {
      this._stripeTimers.forEach((t) => clearTimeout(t));
      this._stripeTimers.clear();
    }
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
      // Батч-impression только по только что добавленным items (для append — новая страница).
      this._markPageShown(items);
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
