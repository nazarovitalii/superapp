import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { moveItemInArray } from '../../../util/move-item-in-array';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { MrsqmAuthService } from '../../services/auth.service';
import {
  BuildingInfo,
  CommunityLayout,
  DealType,
  DeveloperSearchItem,
  FilterOptionId,
  FilterOptions,
  LocationBreadcrumbItem,
  LocationChild,
  LocationSearchItem,
  PropertyInsert,
} from '../../types/database';
import { typeFieldsFor, TypeFields } from './property-type-fields';

const SQFT_TO_SQM = 0.092903;
// 8 шагов формы (порядок согласован: Категория+Сделка → Адрес → … → Описание → Фото).
const STEPS = [
  'Категория',
  'Адрес',
  'Параметры',
  'Цена',
  'Состояние',
  'Листинг',
  'Описание',
  'Фото',
] as const;
const STEP_ICONS = [
  'category',
  'place',
  'tune',
  'payments',
  'event_available',
  'verified',
  'description',
  'photo_library',
] as const;

// Порог «поиск vs селект» для дочерних локаций в каскаде адреса.
const CHILDREN_SELECT_THRESHOLD = 10;

/**
 * Вычисляет индекс уровня из доли позиции указателя по ширине трека.
 * Точки расположены в центрах сегментов: (i+0.5)/n.
 * Зажимает результат в диапазон [minIndex, n-1].
 *
 * @param fraction — позиция [0..1] по ширине трека (может выходить за границы)
 * @param n        — число уровней (длина addrPath)
 * @param minIndex — минимально допустимый индекс (communityIndex)
 */
export const revealIndexFromFraction = (
  fraction: number,
  n: number,
  minIndex: number,
): number => {
  // fraction*n даёт позицию в [0..n]; сдвигаем на -0.5, чтобы получить индекс
  // (точки стоят в центрах сегментов: (i+0.5)/n → обратное преобразование).
  const scaled = fraction * n;
  const idx = Math.round(scaled - 0.5);
  return Math.max(minIndex, Math.min(n - 1, idx));
};

@Component({
  selector: 'mrsqm-add-property-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    CdkDropList,
    CdkDrag,
  ],
  templateUrl: './add-property-page.component.html',
  styleUrl: './add-property-page.component.scss',
})
export class AddPropertyPageComponent {
  private readonly _service = inject(PropertyCreateService);
  private readonly _photoService = inject(PropertyPhotoService);
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _router = inject(Router);

  // Ссылка на DOM-элемент бегунка (для getBoundingClientRect при drag).
  private readonly _revealEl = viewChild<ElementRef<HTMLDivElement>>('revealEl');
  // Флаг активного перетаскивания (true между pointerdown и pointerup/cancel).
  readonly isDragging = signal(false);

  readonly steps = STEPS;
  readonly stepIcons = STEP_ICONS;
  readonly step = signal(0);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly options = signal<FilterOptions | null>(null);

  // ─── Шаг 1: Категория / тип + Сделка ──────────────────────────────────
  readonly categoryId = signal<string | null>(null);
  readonly unitTypeId = signal<string | null>(null);
  readonly subTypeId = signal<string | null>(null);
  readonly dealType = signal<DealType>('sale');
  readonly pricePeriod = signal<string>('yearly');

  // ─── Шаг 2: Адрес (каскад до leaf) ─────────────────────────────────────
  readonly locQuery = signal<string>('');
  readonly locResults = signal<LocationSearchItem[]>([]);
  readonly locLoading = signal<boolean>(false);
  // Цепочка выбранных уровней (от первого выбранного до текущего).
  readonly addrPath = signal<LocationBreadcrumbItem[]>([]);
  // Прямые потомки текущего уровня (для выбора следующего).
  readonly children = signal<LocationChild[]>([]);
  readonly childQuery = signal<string>('');
  // leaf достигнут — children пуст. locationId = id leaf.
  readonly locationId = signal<string | null>(null);
  readonly buildingInfo = signal<BuildingInfo | null>(null);
  readonly communityLayouts = signal<CommunityLayout[]>([]);
  // developer_id из developer_ids leaf — для offplan.
  private readonly _developerId = signal<string | null>(null);
  // Бегунок приватности адреса: индекс уровня в addrPath, до которого
  // адрес виден публично. По умолчанию = leaf (полный адрес).
  readonly revealIndex = signal<number>(0);

  // ─── Шаг 2: Девелопер (AP-5) — ручной ввод, когда leaf без location_developers ─
  // Показывается только при isLeaf && buildingInfo===null.
  readonly devQuery = signal<string>('');
  readonly devResults = signal<DeveloperSearchItem[]>([]);
  readonly devLoading = signal<boolean>(false);
  readonly pickedDeveloperId = signal<string | null>(null);
  readonly pickedDeveloperName = signal<string | null>(null);
  private _devTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Шаг 3: Параметры (зависят от типа) ────────────────────────────────
  readonly bedrooms = signal<number | null>(null);
  readonly bathrooms = signal<number | null>(null);
  readonly isMaid = signal(false);
  readonly isStudy = signal(false);
  readonly isHotelPool = signal(false);
  readonly isVastu = signal(false);
  readonly areaSqft = signal<string>('');
  readonly plotSqft = signal<string>('');
  readonly floorLevelId = signal<string | null>(null);
  readonly floorsInUnit = signal<string | null>(null);
  readonly layoutId = signal<string | null>(null);
  readonly viewIds = signal<string[]>([]);
  readonly positionIds = signal<string[]>([]);
  readonly amenityIds = signal<string[]>([]);
  readonly furnished = signal<string | null>(null);

  // ─── Шаг 4: Цена ───────────────────────────────────────────────────────
  readonly price = signal<string>('');
  // Оригинальная цена (OP) — только для продажи. Кол-во чеков — только аренда.
  readonly originalPrice = signal<string>('');
  readonly cheques = signal<number | null>(null);
  readonly chequeOptions: readonly number[] = [1, 2, 3, 4, 6, 12];

  // ─── Шаг 5: Состояние ──────────────────────────────────────────────────
  readonly handover = signal<string>('ready');
  // Off-Plan недоступен, если проект уже сдан (project_status='completed').
  readonly offPlanLocked = computed(
    () => this.buildingInfo()?.project_status === 'completed',
  );
  readonly completionYear = signal<string>('');
  readonly completionQ = signal<string | null>(null);
  readonly occupancy = signal<string>('vacant');
  readonly leaseMonth = signal<string>(''); // 1..12
  readonly leaseYear = signal<string>('');

  // Опции месяцев для селекта «Занято до» (value = '1'..'12', русское название).
  readonly monthOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: '1', label: 'Январь' },
    { value: '2', label: 'Февраль' },
    { value: '3', label: 'Март' },
    { value: '4', label: 'Апрель' },
    { value: '5', label: 'Май' },
    { value: '6', label: 'Июнь' },
    { value: '7', label: 'Июль' },
    { value: '8', label: 'Август' },
    { value: '9', label: 'Сентябрь' },
    { value: '10', label: 'Октябрь' },
    { value: '11', label: 'Ноябрь' },
    { value: '12', label: 'Декабрь' },
  ];

  // Опции годов: текущий … текущий+5 (6 значений), value = строка года.
  readonly yearOptions = computed<string[]>(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(y + i));
  });

  // ─── Шаг 6: Листинг ────────────────────────────────────────────────────
  readonly listingType = signal<string>('pocket');
  readonly visibility = signal<string>('public');
  readonly titleDeedNumber = signal<string>('');
  readonly titleDeedYear = signal<string>('');
  readonly plotNumber = signal<string>('');
  readonly municipalityNumber = signal<string>('');

  // ─── Шаг 7: Описание / Шаг 8: Фото ────────────────────────────────────
  readonly description = signal<string>('');
  readonly photos = signal<File[]>([]);
  readonly previews = signal<string[]>([]);
  // Floor Plan: до 4 изображений планировки.
  readonly floorPlans = signal<File[]>([]);
  readonly floorPlanPreviews = signal<string[]>([]);
  /** Максимальное число фото планировки. */
  readonly MAX_FLOOR_PLANS = 4;

  // ─── Производные ────────────────────────────────────────────────────────
  readonly unitTypesForCategory = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    const cat = this.categoryId();
    if (!opts || !cat) return [];
    return opts.unit_types.filter((u) => u.parent_id === cat);
  });
  readonly subTypesForUnitType = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    const ut = this.unitTypeId();
    if (!opts || !ut) return [];
    return opts.sub_types.filter((s) => s.parent_id === ut);
  });

  // value выбранного unit_type — ключ конфига полей.
  private readonly _unitTypeValue = computed<string | null>(() => {
    const opts = this.options();
    const id = this.unitTypeId();
    if (!opts || !id) return null;
    return opts.unit_types.find((u) => u.id === id)?.value ?? null;
  });
  // Набор полей для шага «Параметры».
  readonly fields = computed<TypeFields>(() => typeFieldsFor(this._unitTypeValue()));

  // Этажность (G+…): свой справочник для апартаментов и домов.
  readonly floorsInUnitOptions = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts) return [];
    // Дома — house-вариант; всё остальное с floorsInUnit — apt-вариант.
    return this._unitTypeValue() === 'house'
      ? opts.floors_in_unit_house
      : opts.floors_in_unit_apt;
  });

  // «Расположение» = два взаимоисключающих набора. Дом — оба, апартаменты —
  // только позиция юнита (middle/corner).
  private readonly _ROW_POS = ['back_to_back', 'single_row'];
  private readonly _UNIT_POS = ['middle', 'corner'];
  readonly positionRowOptions = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts || this._unitTypeValue() !== 'house') return [];
    return opts.positions.filter((p) => this._ROW_POS.includes(p.value));
  });
  readonly positionUnitOptions = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts) return [];
    return opts.positions.filter((p) => this._UNIT_POS.includes(p.value));
  });

  // Подпись выбранного адреса (последний уровень цепочки).
  readonly addrLabel = computed<string>(() => {
    const path = this.addrPath();
    return path.length ? path[path.length - 1].name : '';
  });
  readonly isLeaf = computed(() => !!this.locationId());
  readonly childrenFiltered = computed<LocationChild[]>(() => {
    const all = this.children();
    const q = this.childQuery().trim().toLowerCase();
    if (all.length <= CHILDREN_SELECT_THRESHOLD || !q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q));
  });
  readonly childrenAsSearch = computed(
    () => this.children().length > CHILDREN_SELECT_THRESHOLD,
  );
  // Поле «Девелопер» видно только при leaf и отсутствии данных в location_developers.
  readonly showDeveloperField = computed(
    () => this.isLeaf() && this.buildingInfo() === null,
  );

  // ─── Поиск по всем нижним уровням внутри комьюнити ──────────────────────
  // Прямые children (mode=info) дают только следующий уровень (sub_community).
  // Чтобы из комьюнити можно было сразу прыгнуть на building/cluster/любой
  // нижний уровень, под комьюнити показываем глобальный поиск, отфильтрованный
  // по этому комьюнити (search_locations несёт community_name).
  // Комьюнити в цепочке (самый глубокий) — рамка поиска.
  private readonly _scopeCommunity = computed<LocationBreadcrumbItem | null>(() => {
    const path = this.addrPath();
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].level === 'community') return path[i];
    }
    return null;
  });
  // Под комьюнити с большим числом потомков — режим глобального поиска по
  // всем уровням. Выше комьюнити (город→комьюнити) остаётся фильтр children.
  readonly useDescendantSearch = computed(
    () => this._scopeCommunity() !== null && this.childrenAsSearch(),
  );
  readonly descResults = signal<LocationSearchItem[]>([]);
  readonly descLoading = signal(false);
  private _descTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Бегунок приватности адреса ─────────────────────────────────────────
  // Минимум бегунка — индекс комьюнити (ниже нельзя). Если комьюнити нет в
  // цепочке (адрес = сам комьюнити/выше) — минимум 0.
  readonly communityIndex = computed<number>(() => {
    const idx = this.addrPath().findIndex((p) => p.level === 'community');
    return idx < 0 ? 0 : idx;
  });
  readonly leafIndex = computed<number>(() => Math.max(0, this.addrPath().length - 1));
  // Есть что двигать: leaf глубже комьюнити.
  readonly canSlide = computed<boolean>(() => this.leafIndex() > this.communityIndex());
  // Уровень адреса, который увидят все. revealIndex == leaf → полный (null).
  readonly publicLocationId = computed<string | null>(() => {
    const ri = this.revealIndex();
    if (ri >= this.leafIndex()) return null;
    return this.addrPath()[ri]?.id ?? null;
  });
  // Подпись: что увидят коллеги (имя уровня по revealIndex).
  readonly revealLabel = computed<string>(
    () => this.addrPath()[this.revealIndex()]?.name ?? '',
  );

  /** Выбрать уровень раскрытия. Нельзя выбрать ниже communityIndex (B5). */
  selectReveal(i: number): void {
    if (i < this.communityIndex()) return;
    this.revealIndex.set(i);
  }

  // ─── Drag-обвязка бегунка через Pointer Events (мышь + тач) ─────────────

  /** Начало перетаскивания: захват указателя и немедленный пересчёт позиции. */
  onRevealPointerDown(ev: PointerEvent): void {
    ev.preventDefault(); // предотвратить выделение текста и скролл
    const el = this._revealEl()?.nativeElement;
    if (!el) return;
    el.setPointerCapture(ev.pointerId); // move/up приходят на элемент даже за его границами
    this.isDragging.set(true);
    this._applyRevealPosition(ev, el);
  }

  /** Движение: пересчитываем индекс только во время активного drag. */
  onRevealPointerMove(ev: PointerEvent): void {
    if (!this.isDragging()) return;
    const el = this._revealEl()?.nativeElement;
    if (!el) return;
    this._applyRevealPosition(ev, el);
  }

  /** Конец перетаскивания (отпускание или отмена). */
  onRevealPointerUpOrCancel(): void {
    this.isDragging.set(false);
  }

  /** Пересчёт индекса из координаты указателя и применение через selectReveal. */
  private _applyRevealPosition(ev: PointerEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const fraction = (ev.clientX - rect.left) / rect.width;
    const idx = revealIndexFromFraction(
      fraction,
      this.addrPath().length,
      this.communityIndex(),
    );
    this.selectReveal(idx);
  }

  private _locTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this._loadOptions();
  }

  private async _loadOptions(): Promise<void> {
    try {
      this.options.set(await this._service.getFilterOptions());
    } catch {
      this.error.set('Не удалось загрузить справочники');
    }
  }

  // ─── Шаг 1 ──────────────────────────────────────────────────────────────
  selectCategory(id: string): void {
    if (this.categoryId() === id) return;
    this.categoryId.set(id);
    this.unitTypeId.set(null);
    this.subTypeId.set(null);
  }
  selectUnitType(id: string): void {
    if (this.unitTypeId() === id) return;
    this.unitTypeId.set(id);
    this.subTypeId.set(null);
  }

  // ─── Шаг 2: поиск и каскад локаций ──────────────────────────────────────
  onLocInput(val: string): void {
    this.locQuery.set(val);
    if (this._locTimer) clearTimeout(this._locTimer);
    if (val.trim().length < 2) {
      this.locResults.set([]);
      return;
    }
    this._locTimer = setTimeout(async () => {
      this.locLoading.set(true);
      try {
        this.locResults.set(await this._service.searchLocations(val));
      } catch {
        this.locResults.set([]);
      } finally {
        this.locLoading.set(false);
      }
    }, 250);
  }

  // Поиск по всем нижним уровням внутри последнего выбранного узла (debounce).
  // Скоуп = последний элемент addrPath; поиск через RPC search_in_scope (AP-2).
  onChildSearchInput(val: string): void {
    this.childQuery.set(val);
    if (this._descTimer) clearTimeout(this._descTimer);
    const path = this.addrPath();
    const scope = path.length ? path[path.length - 1] : null;
    if (val.trim().length < 2 || !scope) {
      this.descResults.set([]);
      return;
    }
    this._descTimer = setTimeout(async () => {
      this.descLoading.set(true);
      try {
        const all = await this._service.searchInScope(val, scope.id, 50);
        const pathIds = new Set(this.addrPath().map((p) => p.id));
        this.descResults.set(all.filter((r) => !pathIds.has(r.id)));
      } catch {
        this.descResults.set([]);
      } finally {
        this.descLoading.set(false);
      }
    }, 250);
  }

  // Выбор результата поиска или дочернего уровня → углубляемся к leaf.
  async pickLocation(id: string): Promise<void> {
    this.locResults.set([]);
    this.locQuery.set('');
    this.childQuery.set('');
    this.descResults.set([]);
    this.locLoading.set(true);
    try {
      const info = await this._service.locationInfo(id);
      if (!info) {
        this.error.set('Не удалось загрузить локацию');
        return;
      }
      const self: LocationBreadcrumbItem = {
        level: info.location.level,
        id: info.location.id,
        name: info.location.name,
      };
      // Полная цепочка = предки (breadcrumb) + сам выбранный уровень.
      // Гоча: для building (self-ref) breadcrumb уже заканчивается выбранным узлом —
      // тогда self не аппендим, иначе leaf дублируется (Sadaf 4 ×2). [[locations-path-building-gotcha]]
      const bc = info.breadcrumb;
      const endsWithSelf = bc.length > 0 && bc[bc.length - 1].id === self.id;
      this.addrPath.set(endsWithSelf ? [...bc] : [...bc, self]);
      this.children.set(info.children);
      this._developerId.set(info.location.developer_ids?.[0] ?? null);

      if (info.children.length === 0) {
        // leaf достигнут.
        this.locationId.set(id);
        // Бегунок по умолчанию на leaf (полный адрес).
        this.revealIndex.set(this.addrPath().length - 1);
        await this._afterLeaf(id);
      } else {
        this.locationId.set(null);
        this.buildingInfo.set(null);
      }
      this.error.set(null);
    } finally {
      this.locLoading.set(false);
    }
  }

  // Подтянуть building info и планировки комьюнити после выбора leaf.
  private async _afterLeaf(leafId: string): Promise<void> {
    const community = this.addrPath().find((p) => p.level === 'community');
    const [info, layouts] = await Promise.all([
      this._service.getBuildingInfo(leafId),
      community ? this._service.getCommunityLayouts(community.id) : Promise.resolve([]),
    ]);
    this.buildingInfo.set(info);
    this.communityLayouts.set(layouts);
    // Если проект уже сдан (completed), а ранее был выбран Off-Plan — форсируем Ready.
    this._reconcileHandover();
  }

  resetLocation(): void {
    this.locationId.set(null);
    this.addrPath.set([]);
    this.children.set([]);
    this.locResults.set([]);
    this.locQuery.set('');
    this.childQuery.set('');
    this.descResults.set([]);
    this.buildingInfo.set(null);
    this.communityLayouts.set([]);
    this._developerId.set(null);
    this.layoutId.set(null);
    this.revealIndex.set(0);
    // AP-5: сбросить выбранного девелопера.
    this._clearDevState();
  }

  // ─── Шаг 2: Девелопер (AP-5) ─────────────────────────────────────────────
  // Внутренний сброс всех dev-сигналов (используется из resetLocation и clearDeveloper).
  private _clearDevState(): void {
    if (this._devTimer) {
      clearTimeout(this._devTimer);
      this._devTimer = null;
    }
    this.devQuery.set('');
    this.devResults.set([]);
    this.devLoading.set(false);
    this.pickedDeveloperId.set(null);
    this.pickedDeveloperName.set(null);
  }

  onDeveloperInput(val: string): void {
    this.devQuery.set(val);
    if (this._devTimer) clearTimeout(this._devTimer);
    if (val.trim().length < 2) {
      this.devResults.set([]);
      return;
    }
    this._devTimer = setTimeout(async () => {
      this.devLoading.set(true);
      try {
        this.devResults.set(await this._service.searchDevelopers(val));
      } catch {
        this.devResults.set([]);
      } finally {
        this.devLoading.set(false);
      }
    }, 250);
  }

  pickDeveloper(d: DeveloperSearchItem): void {
    this.pickedDeveloperId.set(d.id);
    this.pickedDeveloperName.set(d.name);
    this.devResults.set([]);
    this.devQuery.set('');
  }

  clearDeveloper(): void {
    this._clearDevState();
  }

  // ─── Шаг 5: выбор готовности с проверкой гейта ─────────────────────────
  // Игнорируем offplan, если проект уже сдан (offPlanLocked).
  selectHandover(value: string): void {
    if (value === 'offplan' && this.offPlanLocked()) return;
    this.handover.set(value);
  }

  // Реконсиляция после смены локации: если проект completed и уже выбран offplan —
  // принудительно ставим ready.
  private _reconcileHandover(): void {
    if (this.offPlanLocked() && this.handover() === 'offplan') this.handover.set('ready');
  }

  // ─── Шаг 8: фото галереи ────────────────────────────────────────────────
  onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (!list || !list.length) return;
    const added = Array.from(list);
    this.photos.set([...this.photos(), ...added]);
    this.previews.set([...this.previews(), ...added.map((f) => URL.createObjectURL(f))]);
    input.value = '';
  }

  removePhoto(i: number): void {
    const url = this.previews()[i];
    if (url) URL.revokeObjectURL(url);
    this.photos.set(this.photos().filter((_, idx) => idx !== i));
    this.previews.set(this.previews().filter((_, idx) => idx !== i));
  }

  // Перестановка фото галереи через CDK DragDrop.
  // Оба массива (photos + previews) синхронизируются одновременно.
  dropPhoto(event: CdkDragDrop<string[]>): void {
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) return;
    this.photos.set(moveItemInArray(this.photos(), previousIndex, currentIndex));
    this.previews.set(moveItemInArray(this.previews(), previousIndex, currentIndex));
  }

  // Сделать фото главным: перемещает элемент на позицию 0.
  makePhotoMain(i: number): void {
    if (i === 0) return;
    this.photos.set(moveItemInArray(this.photos(), i, 0));
    this.previews.set(moveItemInArray(this.previews(), i, 0));
  }

  // ─── Шаг 8: Floor Plan ──────────────────────────────────────────────────
  onFloorPlansSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (!list || !list.length) return;
    const added = Array.from(list);
    const current = this.floorPlans();
    const currentPrev = this.floorPlanPreviews();
    // Обрезаем до максимума: берём столько, сколько осталось до лимита.
    const slots = this.MAX_FLOOR_PLANS - current.length;
    if (slots <= 0) return;
    const accepted = added.slice(0, slots);
    this.floorPlans.set([...current, ...accepted]);
    this.floorPlanPreviews.set([
      ...currentPrev,
      ...accepted.map((f) => URL.createObjectURL(f)),
    ]);
    input.value = '';
  }

  removeFloorPlan(i: number): void {
    const url = this.floorPlanPreviews()[i];
    if (url) URL.revokeObjectURL(url);
    this.floorPlans.set(this.floorPlans().filter((_, idx) => idx !== i));
    this.floorPlanPreviews.set(this.floorPlanPreviews().filter((_, idx) => idx !== i));
  }

  // Перестановка Floor Plan через CDK DragDrop.
  dropFloorPlan(event: CdkDragDrop<string[]>): void {
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) return;
    this.floorPlans.set(moveItemInArray(this.floorPlans(), previousIndex, currentIndex));
    this.floorPlanPreviews.set(
      moveItemInArray(this.floorPlanPreviews(), previousIndex, currentIndex),
    );
  }

  // ─── Мультиселекты (views/positions/amenities) ──────────────────────────
  toggleIn(sig: ReturnType<typeof signal<string[]>>, id: string): void {
    const cur = sig();
    sig.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  // Клик по позиции: radio внутри своего набора (снять прочие того же набора),
  // не трогая чужой набор. Повторный клик — снять.
  togglePosition(id: string): void {
    const opts = this.options();
    if (!opts) return;
    const picked = opts.positions.find((p) => p.id === id);
    if (!picked) return;
    const cur = this.positionIds();
    if (cur.includes(id)) {
      this.positionIds.set(cur.filter((x) => x !== id));
      return;
    }
    const set = this._ROW_POS.includes(picked.value) ? this._ROW_POS : this._UNIT_POS;
    const sameSetIds = opts.positions
      .filter((p) => set.includes(p.value))
      .map((p) => p.id);
    this.positionIds.set([...cur.filter((x) => !sameSetIds.includes(x)), id]);
  }

  // Форматирование числовых полей.
  onPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.price.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }

  onOriginalPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.originalPrice.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }

  // ─── Навигация ──────────────────────────────────────────────────────────
  private _validateStep(): string | null {
    const tf = this.fields();
    switch (this.step()) {
      case 0:
        if (!this.categoryId()) return 'Выберите категорию';
        if (this.unitTypesForCategory().length && !this.unitTypeId())
          return 'Выберите тип объекта';
        if (tf.subType && this.subTypesForUnitType().length && !this.subTypeId())
          return 'Выберите подтип';
        return null;
      case 1:
        if (!this.locationId())
          return this.addrPath().length
            ? 'Уточните адрес до конечного уровня'
            : 'Выберите локацию';
        return null;
      case 2:
        if (tf.rooms && (this.bedrooms() === null || this.bathrooms() === null))
          return 'Укажите спальни и санузлы';
        if (tf.bua && !this.areaSqft()) return 'Укажите площадь (BUA)';
        if (!tf.bua && tf.plot && !this.plotSqft()) return 'Укажите площадь участка';
        if (tf.floorLevel && !this.floorLevelId()) return 'Укажите этажность';
        if (tf.floorsInUnit && !this.floorsInUnit()) return 'Укажите этажность (Levels)';
        return null;
      case 3:
        if (!this.price()) return 'Укажите цену';
        return null;
      case 5:
        if (this.listingType() === 'official' && !this.titleDeedNumber())
          return 'Для официального листинга укажите номер Title Deed';
        return null;
      default:
        return null;
    }
  }

  next(): void {
    const err = this._validateStep();
    if (err) {
      this.error.set(err);
      return;
    }
    this.error.set(null);
    this.step.update((s) => Math.min(s + 1, STEPS.length - 1));
  }

  prev(): void {
    this.error.set(null);
    this.step.update((s) => Math.max(s - 1, 0));
  }

  // ─── Отправка ───────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (this.submitting()) return;
    const err = this._validateStep();
    if (err) {
      this.error.set(err);
      return;
    }
    const owner = this._auth.currentUser();
    const locId = this.locationId();
    if (!owner || !locId) {
      this.error.set('Сессия не найдена или адрес не выбран');
      return;
    }
    const tf = this.fields();
    // Поля числовых input'ов могут прийти как number (type=number + ngModel) или
    // string — приводим к строке перед разбором, чтобы не упасть на .replace.
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const sqft = tf.bua ? num(this.areaSqft()) : null;
    const plot = tf.plot ? num(this.plotSqft()) : null;
    const isOffplan = this.handover() === 'offplan';
    const isOccupied = this.handover() === 'ready' && this.occupancy() === 'occupied';
    // Документы (Title Deed/Plot/Municipality) — только для официального листинга.
    const isOfficial = this.listingType() === 'official';
    // lease_until: первое число выбранного месяца/года.
    const lm = String(this.leaseMonth() ?? '');
    const ly = String(this.leaseYear() ?? '');
    const lease = isOccupied && ly && lm ? `${ly}-${lm.padStart(2, '0')}-01` : null;

    const payload: PropertyInsert = {
      owner_id: owner.id,
      location_id: locId,
      public_location_id: this.publicLocationId(),
      category_id: this.categoryId(),
      unit_type_id: this.unitTypeId(),
      sub_type_id: tf.subType ? this.subTypeId() : null,
      deal_type: this.dealType(),
      listing_type: this.listingType(),
      price: Number(this.price().replace(/,/g, '')),
      price_currency: 'AED',
      price_period: this.dealType() === 'rent' ? this.pricePeriod() : null,
      bedrooms: tf.rooms ? this.bedrooms() : null,
      bathrooms: tf.rooms ? this.bathrooms() : null,
      is_maid: tf.maid ? this.isMaid() : false,
      is_hotel_pool: tf.hotelPool ? this.isHotelPool() : false,
      is_vastu: tf.vastu ? this.isVastu() : false,
      is_study: tf.maid ? this.isStudy() : false,
      original_price: this.dealType() === 'sale' ? num(this.originalPrice()) : null,
      cheques: this.dealType() === 'rent' ? this.cheques() : null,
      area_sqft: sqft,
      area_sqm: sqft ? Math.round(sqft * SQFT_TO_SQM * 100) / 100 : null,
      plot_sqft: plot,
      plot_sqm: plot ? Math.round(plot * SQFT_TO_SQM * 100) / 100 : null,
      floor_number: null,
      floor_level_id: tf.floorLevel ? this.floorLevelId() : null,
      floors_in_unit_id: tf.floorsInUnit ? this.floorsInUnit() : null,
      layout_id: tf.layout ? this.layoutId() : null,
      view_ids: tf.views && this.viewIds().length ? this.viewIds() : null,
      position_ids: tf.positions && this.positionIds().length ? this.positionIds() : null,
      amenity_ids: tf.amenities && this.amenityIds().length ? this.amenityIds() : null,
      furnished: tf.furnished ? this.furnished() : null,
      handover: this.handover(),
      occupancy_status: this.handover() === 'ready' ? this.occupancy() : null,
      lease_until: lease,
      // AP-5: вручную выбранный девелопер перекрывает developer_ids из локации.
      developer_id: this.pickedDeveloperId() ?? (isOffplan ? this._developerId() : null),
      completion_year: isOffplan ? num(this.completionYear()) : null,
      completion_q: isOffplan ? this.completionQ() : null,
      title_deed_number: isOfficial ? this.titleDeedNumber().trim() || null : null,
      title_deed_year: isOfficial ? num(this.titleDeedYear()) : null,
      plot_number: isOfficial ? this.plotNumber().trim() || null : null,
      municipality_number: isOfficial ? this.municipalityNumber().trim() || null : null,
      visibility: this.visibility(),
      // network — публикуется сразу (active); public — на модерацию (pending_review).
      status: this.visibility() === 'network' ? 'active' : 'pending_review',
      description: this.description().trim() || null,
    };

    this.submitting.set(true);
    this.error.set(null);
    try {
      const id = await this._service.createProperty(payload);
      // Фото грузим после создания (нужен id для пути и RLS). Сбой загрузки
      // не откатывает объект — сообщаем, но переходим в ленту.
      if (this.photos().length || this.floorPlans().length) {
        try {
          await this._photoService.uploadAndAttach(id, this.photos(), this.floorPlans());
        } catch {
          this.error.set('Объект создан, но часть фото не загрузилась');
        }
      }
      await this._router.navigateByUrl('/mrsqm/feed');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Не удалось создать объект');
    } finally {
      this.submitting.set(false);
    }
  }
}
