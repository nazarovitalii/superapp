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
  DealType,
  FilterOptionId,
  FilterOptions,
  LocationSearchItem,
  PropertyInsert,
} from '../../types/database';

const SQFT_TO_SQM = 0.092903;

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

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  // Справочники (грузим в конструкторе).
  readonly options = signal<FilterOptions | null>(null);

  // ─── Поля формы (сигналы) ──────────────────────────────────────────────
  readonly categoryId = signal<string | null>(null);
  readonly unitTypeId = signal<string | null>(null);
  readonly subTypeId = signal<string | null>(null);
  readonly dealType = signal<DealType>('sale');

  readonly locationId = signal<string | null>(null);
  readonly locationLabel = signal<string>('');
  readonly locQuery = signal<string>('');
  readonly locResults = signal<LocationSearchItem[]>([]);
  readonly locLoading = signal<boolean>(false);

  readonly bedrooms = signal<number | null>(null);
  readonly bathrooms = signal<number | null>(null);
  readonly areaSqft = signal<string>('');
  readonly furnished = signal<string | null>(null);
  readonly handover = signal<string>('ready');
  readonly occupancy = signal<string>('vacant');

  readonly price = signal<string>('');
  readonly pricePeriod = signal<string>('yearly');
  readonly isNegotiable = signal(false);
  readonly isDistress = signal(false);
  readonly description = signal<string>('');
  readonly visibility = signal<string>('public');

  readonly listingType = signal<string>('pocket');

  // unit_types отфильтрованные по выбранной категории, sub_types — по unit_type.
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

  private _locTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this._loadOptions();
  }

  private async _loadOptions(): Promise<void> {
    try {
      const opts = await this._service.getFilterOptions();
      this.options.set(opts);
    } catch {
      this.error.set('Не удалось загрузить справочники');
    }
  }

  // ─── Выбор справочников ─────────────────────────────────────────────────
  selectCategory(id: string): void {
    this.categoryId.set(id);
    this.unitTypeId.set(null);
    this.subTypeId.set(null);
  }
  selectUnitType(id: string): void {
    this.unitTypeId.set(id);
    this.subTypeId.set(null);
  }

  // ─── Автокомплит локации ────────────────────────────────────────────────
  onLocInput(val: string): void {
    this.locQuery.set(val);
    this.locationId.set(null);
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

  selectLocation(loc: LocationSearchItem): void {
    this.locationId.set(loc.id);
    const sub = [loc.community_name, loc.city_name].filter(Boolean).join(', ');
    this.locationLabel.set(sub ? `${loc.name} · ${sub}` : loc.name);
    this.locQuery.set(loc.name);
    this.locResults.set([]);
  }

  resetLocation(): void {
    this.locationId.set(null);
    this.locationLabel.set('');
    this.locQuery.set('');
    this.locResults.set([]);
  }

  // Форматирование цены с разделителями тысяч.
  onPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.price.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }

  // ─── Валидация всей формы (шагов больше нет — всё одной страницей) ──────
  private _validate(): string | null {
    if (!this.categoryId()) return 'Выберите категорию';
    if (this.unitTypesForCategory().length && !this.unitTypeId())
      return 'Выберите тип объекта';
    if (!this.locationId()) return 'Выберите локацию';
    if (!this.areaSqft()) return 'Укажите площадь';
    if (!this.price()) return 'Укажите цену';
    return null;
  }

  // ─── Отправка ───────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (this.submitting()) return;
    const err = this._validate();
    if (err) {
      this.error.set(err);
      return;
    }
    const owner = this._auth.currentUser();
    const locId = this.locationId();
    if (!owner || !locId) {
      this.error.set('Сессия не найдена, войдите заново');
      return;
    }

    const sqft = this.areaSqft() ? Number(this.areaSqft()) : null;
    const payload: PropertyInsert = {
      owner_id: owner.id,
      location_id: locId,
      category_id: this.categoryId(),
      unit_type_id: this.unitTypeId(),
      sub_type_id: this.subTypeId(),
      deal_type: this.dealType(),
      listing_type: this.listingType(),
      price: Number(this.price().replace(/,/g, '')),
      price_currency: 'AED',
      price_period: this.dealType() === 'rent' ? this.pricePeriod() : null,
      bedrooms: this.bedrooms(),
      bathrooms: this.bathrooms(),
      area_sqft: sqft,
      area_sqm: sqft ? Math.round(sqft * SQFT_TO_SQM * 100) / 100 : null,
      furnished: this.furnished(),
      handover: this.handover(),
      occupancy_status: this.handover() === 'ready' ? this.occupancy() : null,
      is_distress: this.isDistress(),
      is_negotiable: this.isNegotiable(),
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
