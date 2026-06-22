import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  signal,
  computed,
  viewChild,
  ElementRef,
  afterNextRender,
  Injector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import {
  FeedFilters,
  FeedFilterService,
  FeedHandover,
  FeedScope,
  PropertyCategory,
  SavedFilter,
} from '../../services/feed-filter.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { SavedFilterService } from '../../services/saved-filter.service';
import {
  FilterOptions,
  FilterOptionId,
  ListingType,
  DeveloperSearchItem,
  DealType,
} from '../../types/database';
import { typeFieldsFor } from '../../pages/add-property/property-type-fields';

// Чип этажа с пометкой группы: level → floorLevelIds, units → floorsInUnitIds.
export interface FloorChip {
  id: string;
  label: string;
  group: 'level' | 'units';
}

// Статические варианты заселённости (если get_filter_options не вернул occupancy_options).
const STATIC_OCCUPANCY: { value: string; label_en: string }[] = [
  { value: 'vacant', label_en: 'Vacant' },
  { value: 'occupied', label_en: 'Occupied' },
  { value: 'vacant_on_transfer', label_en: 'Vacant on Transfer' },
];

// Варианты квартала сдачи off-plan.
const COMPLETION_Q_OPTIONS: string[] = ['Q1', 'Q2', 'Q3', 'Q4'];

// Варианты числа чеков при аренде.
const CHEQUE_OPTIONS: number[] = [1, 2, 3, 4, 6, 12];

@Component({
  selector: 'mrsqm-feed-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, FormsModule],
  templateUrl: './feed-filter-panel.component.html',
  styleUrl: './feed-filter-panel.component.scss',
})
export class FeedFilterPanelComponent {
  readonly closed = output<void>();
  readonly _filterService = inject(FeedFilterService);
  private readonly _createService = inject(PropertyCreateService);
  readonly _savedSvc = inject(SavedFilterService);
  private readonly _injector = inject(Injector);

  // Ссылки на нативные <dialog> элементы
  private readonly _nameDialogEl = viewChild<ElementRef<HTMLDialogElement>>('nameDialog');
  private readonly _toastDialogEl =
    viewChild<ElementRef<HTMLDialogElement>>('toastDialog');

  // ─── Сохранённые фильтры ─────────────────────────────────────────────────────
  readonly savedFilters = signal<SavedFilter[]>([]);

  // Бейдж с учётом оптимистично просмотренных в фильтре объектов (≥0).
  readonly savedFiltersView = computed(() =>
    this.savedFilters().map((f) => ({
      ...f,
      displayUnseen: Math.max(0, f.unseen_count - this._savedSvc.localSeenCount(f.id)),
    })),
  );

  // Поле ввода названия нового фильтра
  readonly newFilterName = signal<string>('');

  // Тост
  readonly toastMsg = signal<string | null>(null);
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Лейбл кнопки: «Изменить» если загружен и dirty, иначе «Сохранить»
  readonly saveButtonLabel = computed<string>(() =>
    this._filterService.loadedFilterId() !== null &&
    this._filterService.isDirtySinceLoad()
      ? 'Изменить'
      : 'Сохранить',
  );

  // ─── 3 состояния футера (Баг #2, #3) ─────────────────────────────────────
  // Кнопку «Применить» показываем только когда нет загруженного фильтра.
  readonly showApply = computed<boolean>(
    () => this._filterService.loadedFilterId() === null,
  );
  // Кнопку «Сохранить/Изменить» показываем когда нет загруженного ИЛИ он dirty.
  readonly showSaveOrEdit = computed<boolean>(
    () =>
      this._filterService.loadedFilterId() === null ||
      this._filterService.isDirtySinceLoad(),
  );

  // Константы для шаблона
  readonly completionQOptions = COMPLETION_Q_OPTIONS;
  readonly chequeOptions = CHEQUE_OPTIONS;

  // Справочники из БД (get_filter_options) — все типы недвижимости, спальни, санузлы.
  readonly options = signal<FilterOptions | null>(null);

  // Живая ссылка на состояние сервиса — draft() = _filterService.filters() (Баг #4).
  // Все мутаторы пишут напрямую через _filterService.patch(); draft() служит
  // только чтению (шаблон + тесты, которые обращаются к component.draft()).
  readonly draft = computed<FeedFilters>(() => this._filterService.filters());

  // ─── Застройщик — автокомплит (мультиселект) ─────────────────────────────
  readonly developerQuery = signal<string>('');
  readonly developerResults = signal<DeveloperSearchItem[]>([]);
  readonly pickedDevelopers = signal<DeveloperSearchItem[]>([]);

  // Категория (Residential/Commercial) выбирается в хедере — каскад типов
  // фильтруем по ней (item 5/6).
  readonly category = this._filterService.category;

  // Типы объектов, отфильтрованные по выбранной в хедере категории.
  readonly unitTypes = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts) return [];
    const cats = opts.categories ?? [];
    const catValue = this.category();
    const catId = catValue ? (cats.find((c) => c.value === catValue)?.id ?? null) : null;
    return (opts.unit_types ?? []).filter((u) => !catId || u.parent_id === catId);
  });

  // Подтипы выбранного типа объекта (читаем живой unitTypeId из сервиса).
  readonly subTypes = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    const unitId = this._filterService.filters().unitTypeId;
    if (!opts || !unitId) return [];
    return (opts.sub_types ?? []).filter((s) => s.parent_id === unitId);
  });

  // ─── Динамические чипы «Этаж» ────────────────────────────────────────────
  // Если тип выбран — чипы по матрице typeFieldsFor; если нет — union всех.
  readonly floorChips = computed<FloorChip[]>(() => {
    const opts = this.options();
    if (!opts) return [];
    const unitTypeId = this._filterService.filters().unitTypeId;
    const unitTypeValue = unitTypeId
      ? ((opts.unit_types ?? []).find((u) => u.id === unitTypeId)?.value ?? null)
      : null;
    const tf = typeFieldsFor(unitTypeValue);

    if (unitTypeValue) {
      // Тип выбран — строим набор по флагам матрицы.
      const chips: FloorChip[] = [];
      if (tf.floorLevel) {
        for (const o of opts.floor_levels ?? []) {
          chips.push({ id: o.id, label: o.label_en, group: 'level' });
        }
      }
      if (tf.floorsInUnit) {
        for (const o of opts.floors_in_unit_house ?? []) {
          chips.push({ id: o.id, label: o.label_en, group: 'units' });
        }
      }
      return chips;
    } else {
      // Тип не выбран — union: floor_levels + floors_in_unit_apt + floors_in_unit_house.
      const chips: FloorChip[] = [];
      for (const o of opts.floor_levels ?? []) {
        chips.push({ id: o.id, label: o.label_en, group: 'level' });
      }
      for (const o of opts.floors_in_unit_apt ?? []) {
        chips.push({ id: o.id, label: o.label_en, group: 'units' });
      }
      for (const o of opts.floors_in_unit_house ?? []) {
        chips.push({ id: o.id, label: o.label_en, group: 'units' });
      }
      return chips;
    }
  });

  // TypeFields для выбранного типа (null → NONE). Нужны для условного показа секций.
  readonly typeFields = computed(() => {
    const opts = this.options();
    const unitTypeId = this._filterService.filters().unitTypeId;
    if (!opts || !unitTypeId) return typeFieldsFor(null);
    const unitTypeValue =
      (opts.unit_types ?? []).find((u) => u.id === unitTypeId)?.value ?? null;
    return typeFieldsFor(unitTypeValue);
  });

  // Тип выбран — для шаблона (живой сигнал из сервиса).
  readonly hasUnitType = computed(() => !!this._filterService.filters().unitTypeId);

  // Список заселённости: из справочника или статика.
  readonly occupancyOptions = computed(() => {
    const opts = this.options();
    if (opts?.occupancy_options?.length) return opts.occupancy_options;
    return STATIC_OCCUPANCY;
  });

  // Карта позиций, допустимых для типа объекта.
  // apartment / hotel_apartment / office → только corner + middle;
  // остальные типы (или тип не выбран) → все 4 позиции.
  readonly positionChips = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts?.positions?.length) return [];
    const unitTypeId = this._filterService.filters().unitTypeId;
    const unitTypeValue = unitTypeId
      ? ((opts.unit_types ?? []).find((u) => u.id === unitTypeId)?.value ?? null)
      : null;
    // Типы с ограниченным набором позиций (только углы + середина, без villa-позиций).
    const APARTMENT_LIKE = new Set(['apartment', 'hotel_apartment', 'office']);
    const allowed =
      unitTypeValue && APARTMENT_LIKE.has(unitTypeValue)
        ? new Set(['corner', 'middle'])
        : new Set(['back_to_back', 'single_row', 'corner', 'middle']);
    return opts.positions.filter((p) => allowed.has(p.value));
  });

  // Годы для off-plan: текущий + 5 вперёд.
  readonly completionYearOptions = computed<number[]>(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => base + i);
  });

  constructor() {
    void this._loadOptions();
    void this._loadSavedFilters();
  }

  private async _loadOptions(): Promise<void> {
    try {
      this.options.set(await this._createService.getFilterOptions());
    } catch {
      // справочники недоступны — покажем только цену/площадь/листинг
    }
  }

  private async _loadSavedFilters(): Promise<void> {
    try {
      const list = await this._savedSvc.list();
      this.savedFilters.set(list);
      this._savedSvc.clearLocalSeen();
    } catch {
      // сохранённые фильтры недоступны — не критично
    }
  }

  // ─── Сохранённые фильтры: загрузка ───────────────────────────────────────────
  loadSavedFilter(f: SavedFilter): void {
    this._filterService.markLoaded(f.id, f.filters);
  }

  // ─── Сохранённые фильтры: удаление ───────────────────────────────────────────
  async removeSavedFilter(id: string): Promise<void> {
    try {
      await this._savedSvc.remove(id);
      this.savedFilters.set(this.savedFilters().filter((f) => f.id !== id));
      if (this._filterService.loadedFilterId() === id) {
        this._filterService.clearLoaded();
      }
    } catch {
      // ошибка удаления — игнорируем тихо
    }
  }

  // ─── Кнопка «Сохранить» / «Изменить» ─────────────────────────────────────────
  async onSaveOrUpdate(): Promise<void> {
    const loadedId = this._filterService.loadedFilterId();
    if (loadedId !== null && this._filterService.isDirtySinceLoad()) {
      // «Изменить» — обновить существующий
      try {
        await this._savedSvc.update(loadedId, this._filterService.snapshot());
        this._filterService.markLoaded(loadedId, this._filterService.snapshot());
        this.showToast('Фильтр обновлён');
      } catch {
        // ошибка обновления — тихо
      }
    } else {
      // «Сохранить» — открыть модалку названия
      this.newFilterName.set('');
      afterNextRender(
        () => {
          this._nameDialogEl()?.nativeElement.showModal();
        },
        { injector: this._injector },
      );
    }
  }

  // ─── Модалка: отмена ─────────────────────────────────────────────────────────
  cancelNameDialog(): void {
    this._nameDialogEl()?.nativeElement.close();
    this.newFilterName.set('');
  }

  // ─── Модалка: подтвердить сохранение ─────────────────────────────────────────
  async confirmSave(): Promise<void> {
    const name = this.newFilterName().trim();
    if (!name) return;
    try {
      const sf = await this._savedSvc.save(name, this._filterService.snapshot());
      this._filterService.markLoaded(sf.id, sf.filters);
      this.savedFilters.set([sf, ...this.savedFilters()]);
      this._nameDialogEl()?.nativeElement.close();
      this.showToast(`Фильтр "${name}" сохранён`);
      this.newFilterName.set('');
    } catch {
      // ошибка сохранения — тихо
    }
  }

  // ─── Тост ─────────────────────────────────────────────────────────────────────
  showToast(msg: string): void {
    if (this._toastTimer !== null) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this._toastDialogEl()?.nativeElement.close();
    this.toastMsg.set(msg);
    afterNextRender(
      () => {
        this._toastDialogEl()?.nativeElement.show();
      },
      { injector: this._injector },
    );
    this._toastTimer = setTimeout(() => {
      this._toastDialogEl()?.nativeElement.close();
      this.toastMsg.set(null);
      this._toastTimer = null;
    }, 2800);
  }

  // ─── Тип недвижимости — живой (через сервис, не draft) ──────────────────
  // Выбор категории из шаблона: value справочника — string, сужаем к PropertyCategory.
  selectCategory(value: string): void {
    this._filterService.selectCategoryAll(value as PropertyCategory);
  }

  // Повторный клик снимает тип; category из живого сигнала.
  setUnitType(id: string): void {
    const cur = this._filterService.filters().unitTypeId;
    if (cur === id) {
      // Снять выбор типа — оставить категорию, но очистить тип+подтипы.
      this._filterService.selectCategoryAll(this._filterService.category()!);
    } else {
      const cat = this._filterService.category();
      if (cat) {
        this._filterService.selectUnitType(cat, id);
      } else {
        // Категория не выбрана — устанавливаем residential по умолчанию.
        this._filterService.selectUnitType('residential', id);
      }
    }
  }

  // ─── Подтип — мультиселект (живой через сервис) ──────────────────────────
  toggleSubType(id: string): void {
    this._filterService.toggleSubType(id);
  }

  // ─── Мультиселекты ────────────────────────────────────────────────────────
  toggleBedroom(value: number): void {
    this._patch({ bedrooms: this._toggleInArray(this.draft().bedrooms, value) });
  }

  toggleBathroom(value: number): void {
    this._patch({ bathrooms: this._toggleInArray(this.draft().bathrooms, value) });
  }

  // ─── Чипы этажа — динамические ───────────────────────────────────────────
  toggleFloorChip(chip: FloorChip): void {
    if (chip.group === 'level') {
      this._patch({
        floorLevelIds: this._toggleStrArray(this.draft().floorLevelIds, chip.id),
      });
    } else {
      this._patch({
        floorsInUnitIds: this._toggleStrArray(this.draft().floorsInUnitIds, chip.id),
      });
    }
  }

  isFloorChipSelected(chip: FloorChip): boolean {
    if (chip.group === 'level') {
      return this.draft().floorLevelIds.includes(chip.id);
    }
    return this.draft().floorsInUnitIds.includes(chip.id);
  }

  // ─── Виды / расположение / удобства ──────────────────────────────────────
  toggleView(id: string): void {
    this._patch({ viewIds: this._toggleStrArray(this.draft().viewIds, id) });
  }

  togglePosition(id: string): void {
    this._patch({ positionIds: this._toggleStrArray(this.draft().positionIds, id) });
  }

  toggleAmenity(id: string): void {
    this._patch({ amenityIds: this._toggleStrArray(this.draft().amenityIds, id) });
  }

  // ─── Цена / площадь / участок — с форматированием запятыми ──────────────
  formatNum(value: number | null): string {
    return value !== null ? value.toLocaleString('en-US') : '';
  }

  setPriceMin(value: string): void {
    this._patch({ priceMin: this._parseNum(value) });
  }

  setPriceMax(value: string): void {
    this._patch({ priceMax: this._parseNum(value) });
  }

  setAreaMin(value: string): void {
    this._patch({ areaMin: this._parseNum(value) });
  }

  setAreaMax(value: string): void {
    this._patch({ areaMax: this._parseNum(value) });
  }

  setPlotMin(value: string): void {
    this._patch({ plotMin: this._parseNum(value) });
  }

  setPlotMax(value: string): void {
    this._patch({ plotMax: this._parseNum(value) });
  }

  // ─── Мебель / готовность / листинг ───────────────────────────────────────
  setFurnished(value: string | null): void {
    this._patch({ furnished: this.draft().furnished === value ? null : value });
  }

  setListingType(type: ListingType | 'all'): void {
    this._patch({ listingType: type });
  }

  // ─── Чекбоксы (null ↔ true) ───────────────────────────────────────────────
  toggleBool(
    field: 'isMaid' | 'isHotelPool' | 'isVastu' | 'isStudy' | 'isReduced' | 'isBelowOp',
  ): void {
    const cur = this.draft()[field];
    this._patch({ [field]: cur === true ? null : true });
  }

  // ─── Заселённость — мультиселект (как bedrooms/views) ────────────────────
  toggleOccupancy(value: string): void {
    this._patch({
      occupancyStatus: this._toggleStrArray(this.draft().occupancyStatus, value),
    });
  }

  // ─── Период аренды ────────────────────────────────────────────────────────
  setPricePeriod(value: string): void {
    this._patch({ pricePeriod: this.draft().pricePeriod === value ? null : value });
  }

  // ─── Год и квартал сдачи (off-plan) ──────────────────────────────────────
  toggleCompletionYear(year: number): void {
    this._patch({
      completionYears: this._toggleInArray(this.draft().completionYears, year),
    });
  }

  toggleCompletionQ(q: string): void {
    this._patch({ completionQ: this._toggleStrArray(this.draft().completionQ, q) });
  }

  // ─── Чеки (аренда) ────────────────────────────────────────────────────────
  toggleCheque(n: number): void {
    this._patch({ cheques: this._toggleInArray(this.draft().cheques, n) });
  }

  // ─── Застройщик: ввод поиска ─────────────────────────────────────────────
  async onDeveloperQuery(q: string): Promise<void> {
    this.developerQuery.set(q);
    if (q.trim().length >= 2) {
      try {
        this.developerResults.set(await this._createService.searchDevelopers(q));
      } catch {
        this.developerResults.set([]);
      }
    } else {
      this.developerResults.set([]);
    }
  }

  // ─── Застройщик: добавить в мультиселект ─────────────────────────────────
  addDeveloper(d: DeveloperSearchItem): void {
    if (this.draft().developerIds.includes(d.id)) return;
    this._patch({ developerIds: [...this.draft().developerIds, d.id] });
    this.pickedDevelopers.set([...this.pickedDevelopers(), d]);
    this.developerQuery.set('');
    this.developerResults.set([]);
  }

  // ─── Застройщик: убрать из мультиселекта ─────────────────────────────────
  removeDeveloper(id: string): void {
    this._patch({ developerIds: this.draft().developerIds.filter((v) => v !== id) });
    this.pickedDevelopers.set(this.pickedDevelopers().filter((d) => d.id !== id));
  }

  // ─── Живые контролы (зеркало тулбара) — действуют напрямую на FeedFilterService,
  //     минуя draft. Меняются мгновенно, без кнопки «Применить». ────────────────

  // Удалить выбранный адрес: синхронизируется с тулбаром (общий сигнал).
  removeLiveLocation(id: string): void {
    this._filterService.removeLocation(id);
  }

  // Sale / Rent.
  setLiveDealType(type: DealType): void {
    this._filterService.set(type);
  }

  // All Segments (null) / Ready / Off-Plan.
  setLiveSegment(value: FeedHandover | null): void {
    this._filterService.setSegment(value);
  }

  // Охват: Public / Friends (my/favourites через панель не выбираются).
  setLiveScope(value: FeedScope): void {
    this._filterService.scope.set(value);
  }

  reset(): void {
    // Полный сброс всего живого состояния через сервис (Баги #1, #5).
    this._filterService.resetAll();
    // Локальное состояние застройщика — не в сервисе, чистим вручную.
    this.developerQuery.set('');
    this.developerResults.set([]);
    this.pickedDevelopers.set([]);
  }

  apply(): void {
    // Все фильтры уже живые в сервисе — просто закрываем панель (Баг #3).
    this.closed.emit();
  }

  private _patch(patch: Partial<FeedFilters>): void {
    this._filterService.patch(patch);
  }

  private _toggleInArray(arr: number[], value: number): number[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  private _toggleStrArray(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  private _parseNum(value: string): number | null {
    const digits = value.replace(/\D/g, '');
    return digits ? Number(digits) : null;
  }
}
