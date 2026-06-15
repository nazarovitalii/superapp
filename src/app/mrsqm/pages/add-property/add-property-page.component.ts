import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PropertyCreateService } from '../../services/property-create.service';
import { MrsqmAuthService } from '../../services/auth.service';
import {
  BuildingInfo,
  CommunityLayout,
  DealType,
  FilterOptionId,
  FilterOptions,
  LocationBreadcrumbItem,
  LocationChild,
  LocationSearchItem,
  PropertyInsert,
} from '../../types/database';
import { typeFieldsFor, TypeFields } from './property-type-fields';

const SQFT_TO_SQM = 0.092903;
// 8 шагов формы (порядок согласован: Категория → Сделка → … → Описание).
const STEPS = [
  'Категория',
  'Сделка',
  'Адрес',
  'Параметры',
  'Цена',
  'Состояние',
  'Листинг',
  'Описание',
] as const;
const STEP_ICONS = [
  'category',
  'sell',
  'place',
  'tune',
  'payments',
  'event_available',
  'verified',
  'description',
] as const;

// Порог «поиск vs селект» для дочерних локаций в каскаде адреса.
const CHILDREN_SELECT_THRESHOLD = 10;

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
  ],
  templateUrl: './add-property-page.component.html',
  styleUrl: './add-property-page.component.scss',
})
export class AddPropertyPageComponent {
  private readonly _service = inject(PropertyCreateService);
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _router = inject(Router);

  readonly steps = STEPS;
  readonly stepIcons = STEP_ICONS;
  readonly step = signal(0);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly options = signal<FilterOptions | null>(null);

  // ─── Шаг 1: Категория / тип ────────────────────────────────────────────
  readonly categoryId = signal<string | null>(null);
  readonly unitTypeId = signal<string | null>(null);
  readonly subTypeId = signal<string | null>(null);

  // ─── Шаг 2: Сделка ─────────────────────────────────────────────────────
  readonly dealType = signal<DealType>('sale');
  readonly pricePeriod = signal<string>('yearly');

  // ─── Шаг 3: Адрес (каскад до leaf) ─────────────────────────────────────
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

  // ─── Шаг 4: Параметры (зависят от типа) ────────────────────────────────
  readonly bedrooms = signal<number | null>(null);
  readonly bathrooms = signal<number | null>(null);
  readonly isMaid = signal(false);
  readonly isHotelPool = signal(false);
  readonly areaSqft = signal<string>('');
  readonly plotSqft = signal<string>('');
  readonly floorNumber = signal<string>('');
  readonly floorLevelId = signal<string | null>(null);
  readonly floorsInUnit = signal<string | null>(null);
  readonly layoutId = signal<string | null>(null);
  readonly viewIds = signal<string[]>([]);
  readonly positionIds = signal<string[]>([]);
  readonly amenityIds = signal<string[]>([]);
  readonly furnished = signal<string | null>(null);

  // ─── Шаг 5: Цена ───────────────────────────────────────────────────────
  readonly price = signal<string>('');
  readonly isNegotiable = signal(false);

  // ─── Шаг 6: Состояние ──────────────────────────────────────────────────
  readonly handover = signal<string>('ready');
  readonly completionYear = signal<string>('');
  readonly completionQ = signal<string | null>(null);
  readonly occupancy = signal<string>('vacant');
  readonly leaseMonth = signal<string>(''); // 1..12
  readonly leaseYear = signal<string>('');
  readonly isDistress = signal(false);

  // ─── Шаг 7: Листинг ────────────────────────────────────────────────────
  readonly listingType = signal<string>('pocket');
  readonly visibility = signal<string>('public');
  readonly titleDeedNumber = signal<string>('');
  readonly titleDeedYear = signal<string>('');
  readonly plotNumber = signal<string>('');
  readonly municipalityNumber = signal<string>('');

  // ─── Шаг 8: Описание ───────────────────────────────────────────────────
  readonly description = signal<string>('');

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

  // ─── Шаг 3: поиск и каскад локаций ──────────────────────────────────────
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

  // Выбор результата поиска или дочернего уровня → углубляемся к leaf.
  async pickLocation(id: string): Promise<void> {
    this.locResults.set([]);
    this.locQuery.set('');
    this.childQuery.set('');
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
      this.addrPath.set([...info.breadcrumb, self]);
      this.children.set(info.children);
      this._developerId.set(info.location.developer_ids?.[0] ?? null);

      if (info.children.length === 0) {
        // leaf достигнут.
        this.locationId.set(id);
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
  }

  resetLocation(): void {
    this.locationId.set(null);
    this.addrPath.set([]);
    this.children.set([]);
    this.locResults.set([]);
    this.locQuery.set('');
    this.childQuery.set('');
    this.buildingInfo.set(null);
    this.communityLayouts.set([]);
    this._developerId.set(null);
    this.layoutId.set(null);
  }

  // ─── Мультиселекты (views/positions/amenities) ──────────────────────────
  toggleIn(sig: ReturnType<typeof signal<string[]>>, id: string): void {
    const cur = sig();
    sig.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  // Форматирование числовых полей.
  onPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.price.set(digits ? Number(digits).toLocaleString('en-US') : '');
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
      case 2:
        if (!this.locationId())
          return this.addrPath().length
            ? 'Уточните адрес до конечного уровня'
            : 'Выберите локацию';
        return null;
      case 3:
        if (tf.bua && !this.areaSqft()) return 'Укажите площадь (BUA)';
        if (!tf.bua && tf.plot && !this.plotSqft()) return 'Укажите площадь участка';
        return null;
      case 4:
        if (!this.price()) return 'Укажите цену';
        return null;
      case 6:
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
    const num = (s: string): number | null => (s ? Number(s.replace(/,/g, '')) : null);
    const sqft = tf.bua ? num(this.areaSqft()) : null;
    const plot = tf.plot ? num(this.plotSqft()) : null;
    const isOffplan = this.handover() === 'offplan';
    const isOccupied = this.handover() === 'ready' && this.occupancy() === 'occupied';
    // lease_until: первое число выбранного месяца/года.
    const lease =
      isOccupied && this.leaseYear() && this.leaseMonth()
        ? `${this.leaseYear()}-${this.leaseMonth().padStart(2, '0')}-01`
        : null;

    const payload: PropertyInsert = {
      owner_id: owner.id,
      location_id: locId,
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
      area_sqft: sqft,
      area_sqm: sqft ? Math.round(sqft * SQFT_TO_SQM * 100) / 100 : null,
      plot_sqft: plot,
      plot_sqm: plot ? Math.round(plot * SQFT_TO_SQM * 100) / 100 : null,
      floor_number: tf.floorNumber ? num(this.floorNumber()) : null,
      floor_level_id: tf.floorLevel ? this.floorLevelId() : null,
      floors_in_unit: tf.floorsInUnit ? this.floorsInUnit() : null,
      layout_id: tf.layout ? this.layoutId() : null,
      view_ids: tf.views && this.viewIds().length ? this.viewIds() : null,
      position_ids: tf.positions && this.positionIds().length ? this.positionIds() : null,
      amenity_ids: tf.amenities && this.amenityIds().length ? this.amenityIds() : null,
      furnished: tf.furnished ? this.furnished() : null,
      handover: this.handover(),
      occupancy_status: this.handover() === 'ready' ? this.occupancy() : null,
      lease_until: lease,
      developer_id: isOffplan ? this._developerId() : null,
      completion_year: isOffplan ? num(this.completionYear()) : null,
      completion_q: isOffplan ? this.completionQ() : null,
      is_distress: this.isDistress(),
      is_negotiable: this.isNegotiable(),
      title_deed_number: this.titleDeedNumber().trim() || null,
      title_deed_year: num(this.titleDeedYear()),
      plot_number: this.plotNumber().trim() || null,
      municipality_number: this.municipalityNumber().trim() || null,
      visibility: this.visibility(),
      // network — публикуется сразу (active); public — на модерацию (pending_review).
      status: this.visibility() === 'network' ? 'active' : 'pending_review',
      description: this.description().trim() || null,
    };

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this._service.createProperty(payload);
      await this._router.navigateByUrl('/mrsqm/feed');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Не удалось создать объект');
    } finally {
      this.submitting.set(false);
    }
  }
}
