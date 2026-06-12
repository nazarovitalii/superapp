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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
    MatButtonToggleModule,
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
    switch (scope) {
      case 'public':
        return items.filter((p) => p.visibility === 'public');
      case 'friends':
        return items.filter((p) => p.is_network);
      case 'my':
        return items.filter((p) => p.owner_id === myId);
      case 'favourites':
        return items.filter((p) => this.savedIds().has(p.id));
    }
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
    { value: 'my', label: 'My' },
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

  setCategory(value: PropertyCategory): void {
    this.filter.setCategory(value);
  }

  setHandover(value: FeedHandover): void {
    this.filter.setHandover(value);
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

  constructor() {
    void this._loadSaved();
    // Перезагружаем при смене dealType, категории, готовности, поиска,
    // фильтров или сортировки. Охват (scope) — клиентский, перезагрузки не требует.
    effect(() => {
      this.filter.dealType();
      this.filter.category();
      this.filter.handover();
      this.filter.searchQuery();
      this.filter.filters();
      this.filter.sortBy();
      this.offset.set(0);
      this.properties.set([]);
      void this._load();
    });
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
      // Поиск из лупы — пока только по описанию (агент ФИО/телефон — DB-батч).
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
