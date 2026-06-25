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
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { moveItemInArray } from '../../../util/move-item-in-array';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyOwnerService } from '../../services/property-owner.service';
import {
  FilterOptions,
  LocationBreadcrumbItem,
  PropertyDetail,
  PropertyPhoto,
} from '../../types/database';
import { typeFieldsFor, TypeFields } from '../add-property/property-type-fields';
import { revealIndexFromFraction } from '../add-property/reveal-slider.util';
import { SnackService } from '../../../core/snack/snack.service';
import { SnackType } from '../../../core/snack/snack.model';
import { PropertyFormAService } from '../../services/property-form-a.service';

// 5 шагов окна редактирования (группировка создателя).
const STEPS = [
  'Адрес и параметры',
  'Цена и состояние',
  'Листинг',
  'Описание',
  'Фото',
] as const;
const STEP_ICONS = [
  'place',
  'payments',
  'verified',
  'description',
  'photo_library',
] as const;

@Component({
  selector: 'mrsqm-edit-property-page',
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
  templateUrl: './edit-property.component.html',
  styleUrl: './edit-property.component.scss',
})
export class EditPropertyPageComponent {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _createService = inject(PropertyCreateService);
  private readonly _photoService = inject(PropertyPhotoService);
  private readonly _owner = inject(PropertyOwnerService);
  private readonly _snack = inject(SnackService);
  private readonly _formA = inject(PropertyFormAService);

  readonly detail = signal<PropertyDetail | null>(null);
  readonly options = signal<FilterOptions | null>(null);
  readonly photos = signal<PropertyPhoto[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly steps = STEPS;
  readonly stepIcons = STEP_ICONS;
  readonly step = signal(0);
  readonly error = signal<string | null>(null);

  // value unit_type объекта → ключ конфига полей таба «Параметры».
  private readonly _unitTypeValue = computed<string | null>(() => {
    const opts = this.options();
    const id = this.detail()?.unit_type_id;
    if (!opts || !id) return null;
    return opts.unit_types.find((u) => u.id === id)?.value ?? null;
  });
  readonly fields = computed<TypeFields>(() => typeFieldsFor(this._unitTypeValue()));

  // Read-only шапка: полный адрес.
  readonly headerPath = computed<string>(() => this.detail()?.location_full_path ?? '');

  // ─── Бегунок приватности адреса ─────────────────────────────────────────
  private readonly _revealEl = viewChild<ElementRef<HTMLDivElement>>('revealEl');
  readonly isDragging = signal(false);

  // Цепочка адреса (от верхнего предка до leaf). Реконструируется из get_property.location_id.
  readonly addrPath = signal<LocationBreadcrumbItem[]>([]);
  readonly revealIndex = signal<number>(0);

  // Минимум бегунка — индекс комьюнити (ниже нельзя раскрывать). Нет комьюнити → 0.
  readonly communityIndex = computed<number>(() => {
    const idx = this.addrPath().findIndex((p) => p.level === 'community');
    return idx < 0 ? 0 : idx;
  });
  readonly leafIndex = computed<number>(() => Math.max(0, this.addrPath().length - 1));
  readonly canSlide = computed<boolean>(() => this.leafIndex() > this.communityIndex());
  readonly revealLabel = computed<string>(
    () => this.addrPath()[this.revealIndex()]?.name ?? '',
  );
  // Узел, видимый всем. revealIndex == leaf → полный адрес (null).
  readonly publicLocationId = computed<string | null>(() => {
    const ri = this.revealIndex();
    if (ri >= this.leafIndex()) return null;
    return this.addrPath()[ri]?.id ?? null;
  });

  // ─── Таб «Параметры»: редактируемые сигналы (Task 5) ───────────────────────
  readonly isMaid = signal(false);
  readonly isStudy = signal(false);
  readonly isHotelPool = signal(false);
  readonly isVastu = signal(false);
  readonly areaSqft = signal<string>('');
  readonly plotSqft = signal<string>('');
  readonly floorLevelId = signal<string | null>(null);
  // floor_number: сигнал для сохранения, UI не рендерится (как в add-property).
  readonly floorNumber = signal<string>('');
  readonly floorsInUnitId = signal<string | null>(null);
  readonly viewIds = signal<string[]>([]);
  readonly positionIds = signal<string[]>([]);
  readonly amenityIds = signal<string[]>([]);
  readonly furnished = signal<string | null>(null);
  readonly price = signal<string>('');
  readonly pricePeriod = signal<string>('yearly');
  readonly occupancyStatus = signal<string>('vacant');
  readonly leaseUntil = signal<string | null>(null);
  readonly listingType = signal<string>('pocket');
  readonly visibility = signal<string>('public');
  readonly originalPrice = signal<string>('');
  readonly description = signal<string>('');
  // ВНИМАНИЕ: publicLocationId НЕ объявляем здесь — это computed из бегунка (Task 4B).

  // ─── Form A (SP-C1) ─────────────────────────────────────────────────────────
  readonly contractNumber = signal<string>('');
  readonly contractStart = signal<string>('');
  readonly contractEnd = signal<string>('');
  readonly isExclusive = signal<boolean>(false);
  readonly formAFile = signal<File | null>(null);
  readonly formAFileName = signal<string>('');
  readonly formAPassword = signal<string>('');

  // ─── Таб «Фото» (Task 7) ────────────────────────────────────────────────────
  // Новые фото для добавления (стейджинг; загрузка — в save() Task 8).
  readonly newPhotos = signal<File[]>([]);
  readonly newPreviews = signal<string[]>([]);
  // Признак выполнения операции с фото (удаление/перестановка).
  readonly photosBusy = signal(false);

  // Только галерейные фото (без floor_plan).
  readonly galleryPhotos = computed(() =>
    this.photos().filter((p) => p.photo_type === 'gallery'),
  );

  // Добавление новых файлов в стейдж (не загружаем — только превью).
  onAddPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (!list || !list.length) return;
    const added = Array.from(list);
    this.newPhotos.set([...this.newPhotos(), ...added]);
    this.newPreviews.set([
      ...this.newPreviews(),
      ...added.map((f) => URL.createObjectURL(f)),
    ]);
    input.value = '';
  }

  // Удалить стейджированное новое фото (без обращения к сервису).
  removeNewPhoto(i: number): void {
    const url = this.newPreviews()[i];
    if (url) URL.revokeObjectURL(url);
    this.newPhotos.set(this.newPhotos().filter((_, idx) => idx !== i));
    this.newPreviews.set(this.newPreviews().filter((_, idx) => idx !== i));
  }

  // Перестановка существующих фото галереи (CDK). Пишем в БД сразу через reorder.
  async dropExisting(event: CdkDragDrop<PropertyPhoto[]>): Promise<void> {
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) return;
    const gallery = moveItemInArray(this.galleryPhotos(), previousIndex, currentIndex);
    const others = this.photos().filter((p) => p.photo_type !== 'gallery');
    this.photos.set([...gallery, ...others]);
    const id = this.detail()?.id;
    if (!id) return;
    this.photosBusy.set(true);
    try {
      await this._photoService.reorder(
        id,
        'gallery',
        gallery.map((p) => p.full_url),
      );
    } finally {
      this.photosBusy.set(false);
    }
  }

  // Сделать главным: переместить на позицию 0 и записать порядок.
  makeMain(i: number): void {
    if (i === 0) return;
    void this.dropExisting({ previousIndex: i, currentIndex: 0 } as CdkDragDrop<
      PropertyPhoto[]
    >);
  }

  // Удалить существующее фото из БД и Storage, перечитать список.
  async deleteExisting(photo: PropertyPhoto): Promise<void> {
    const id = this.detail()?.id;
    if (!id) return;
    this.photosBusy.set(true);
    try {
      await this._photoService.deletePhoto(id, {
        full_url: photo.full_url,
        thumb_url: photo.thumb_url,
      });
      this.photos.set(await this._photoService.getPhotos(id));
    } finally {
      this.photosBusy.set(false);
    }
  }

  // OP заблокирован, если в БД уже задана original_price (серверный guard дублирует).
  readonly originalPriceLocked = computed(() => this.detail()?.original_price != null);
  // Флаг аренды — для отображения полей периода/lease.
  readonly isRent = computed(() => this.detail()?.deal_type === 'rent');

  // Флаг выполнения операции сохранения.
  readonly saving = signal(false);

  // Текст кнопки: active → «Сохранить»; rejected/withdrawn → «Отправить на проверку».
  readonly saveLabel = computed(() => {
    const s = this.detail()?.status;
    return s === 'active' ? 'Сохранить' : 'Отправить на проверку';
  });

  /** Показать снек с общим конфигом (низ-лево, стиль ленты — как в property-detail). */
  private _notify(msg: string, type: SnackType): void {
    this._snack.open({
      msg,
      type,
      isSkipTranslate: true,
      config: {
        horizontalPosition: 'left',
        verticalPosition: 'bottom',
        panelClass: 'mrsqm-snack',
      },
    });
  }

  /** Сохранить изменения объекта: загрузка новых фото → обновление полей → навигация. */
  async save(): Promise<void> {
    const d = this.detail();
    if (!d || this.saving()) return;
    const num = (v: string): number | null => {
      const digits = v.replace(/[^\d.]/g, '');
      return digits ? Number(digits) : null;
    };
    const price = num(this.price());
    if (!price || price <= 0) {
      this._notify('Укажите корректную цену', 'ERROR');
      return;
    }
    const tf = this.fields();
    this.saving.set(true);
    // Валидация: при подаче нового Form A (или Pocket→Official) ВСЕ поля обязательны.
    const submittingFormA =
      this.listingType() === 'official' &&
      (this.formAFile() != null || d.listing_type !== 'official');
    if (
      submittingFormA &&
      (!this.contractNumber().trim() ||
        !this.contractStart() ||
        !this.contractEnd() ||
        !this.formAFile())
    ) {
      this._notify(
        'Для Official укажите Contract Number, срок договора и приложите Form A (PDF)',
        'ERROR',
      );
      this.saving.set(false);
      return;
    }
    try {
      // 1) Новые фото — до сохранения полей (нужен только id, он уже есть).
      if (this.newPhotos().length) {
        await this._photoService.uploadAndAttach(d.id, this.newPhotos(), []);
        this.newPhotos.set([]);
        this.newPreviews.set([]);
        this.photos.set(await this._photoService.getPhotos(d.id));
      }
      // 2) Новый Form A (official): загрузить PDF + вставить строку ДО edit_property,
      // чтобы триггер увидел свежую неодобренную строку. Сбой — прерываем сохранение.
      if (this.listingType() === 'official' && this.formAFile()) {
        try {
          const pdfPath = await this._formA.uploadFormA(
            d.id,
            d.owner_id,
            this.formAFile()!,
          );
          await this._formA.insertFormA({
            property_id: d.id,
            file_url: pdfPath,
            contract_number: this.contractNumber().trim() || null,
            listing_start: this.contractStart() || null,
            listing_end: this.contractEnd() || null,
            pdf_password: this.formAPassword() || null,
            status: 'active',
            uploaded_by: d.owner_id,
          });
        } catch {
          this._notify('Не удалось загрузить Form A — попробуйте ещё раз', 'ERROR');
          this.saving.set(false);
          return;
        }
      }
      // 3) Поля (whitelist). Неприменимые по типу — null (как в add-property).
      const status = await this._owner.editProperty({
        propertyId: d.id,
        price,
        description: this.description().trim() || null,
        isMaid: tf.maid ? this.isMaid() : false,
        isStudy: tf.maid ? this.isStudy() : false,
        isHotelPool: tf.hotelPool ? this.isHotelPool() : false,
        isVastu: tf.vastu ? this.isVastu() : false,
        areaSqft: tf.bua ? num(this.areaSqft()) : null,
        plotSqft: tf.plot ? num(this.plotSqft()) : null,
        floorLevelId: tf.floorLevel ? this.floorLevelId() : null,
        floorNumber: num(this.floorNumber()),
        floorsInUnitId: tf.floorsInUnit ? this.floorsInUnitId() : null,
        viewIds: tf.views && this.viewIds().length ? this.viewIds() : null,
        positionIds:
          tf.positions && this.positionIds().length ? this.positionIds() : null,
        amenityIds: tf.amenities && this.amenityIds().length ? this.amenityIds() : null,
        furnished: tf.furnished ? this.furnished() : null,
        pricePeriod: this.isRent() ? this.pricePeriod() : null,
        occupancyStatus: this.occupancyStatus() || null,
        leaseUntil: this.leaseUntil(),
        listingType: this.listingType(),
        visibility: this.visibility(),
        publicLocationId: this.publicLocationId(),
        originalPrice: this.originalPriceLocked() ? null : num(this.originalPrice()),
        isExclusive: this.isExclusive(),
      });
      this._notify(
        status === 'pending_review' ? 'Объект отправлен на проверку' : 'Сохранено',
        'SUCCESS',
      );
      await this._router.navigateByUrl('/mrsqm/feed');
    } catch {
      this._notify('Не удалось сохранить', 'ERROR');
    } finally {
      this.saving.set(false);
    }
  }

  // Опции floors_in_unit зависят от типа объекта.
  readonly floorsInUnitOptions = computed(() => {
    const opts = this.options();
    if (!opts) return [];
    return this._unitTypeValue() === 'house'
      ? opts.floors_in_unit_house
      : opts.floors_in_unit_apt;
  });

  selectReveal(i: number): void {
    if (i < this.communityIndex()) return;
    this.revealIndex.set(i);
  }

  onRevealPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    const el = this._revealEl()?.nativeElement;
    if (!el) return;
    el.setPointerCapture(ev.pointerId);
    this.isDragging.set(true);
    this._applyRevealPosition(ev, el);
  }

  onRevealPointerMove(ev: PointerEvent): void {
    if (!this.isDragging()) return;
    const el = this._revealEl()?.nativeElement;
    if (!el) return;
    this._applyRevealPosition(ev, el);
  }

  onRevealPointerUpOrCancel(): void {
    this.isDragging.set(false);
  }

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

  constructor() {
    void this._load();
  }

  // Валидация текущего шага. Цена обязательна на шаге «Цена и состояние» (index 1);
  // остальные поля префиллятся из объекта → необязательны.
  private _validateStep(): string | null {
    if (this.step() === 1) {
      const digits = this.price().replace(/[^\d.]/g, '');
      const p = digits ? Number(digits) : 0;
      if (!p || p <= 0) return 'Укажите корректную цену';
    }
    return null;
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

  cancel(): void {
    void this._router.navigateByUrl('/mrsqm/feed');
  }

  private async _load(): Promise<void> {
    const id = this._route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Объект не найден');
      this.isLoading.set(false);
      return;
    }
    try {
      const [detail, options, photos] = await Promise.all([
        this._supabase.rpc<PropertyDetail>('get_property', { p_property_id: id }),
        this._createService.getFilterOptions(),
        this._photoService.getPhotos(id),
      ]);
      if (!detail || detail.error || !detail.is_owner) {
        this.loadError.set('Редактировать можно только свой объект');
        return;
      }
      this.detail.set(detail);
      this.options.set(options);
      this.photos.set(photos);
      void this._loadAddressChain(detail);
      this._prefill(detail);
    } catch {
      this.loadError.set('Не удалось загрузить объект');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Реконструкция цепочки адреса из leaf location_id (breadcrumb + self, с дедупом
  // self-ref building — см. [[locations-path-building-gotcha]]). Затем стартовая позиция
  // бегунка по public_location_id (null → leaf = полный адрес).
  private async _loadAddressChain(d: PropertyDetail): Promise<void> {
    if (!d.location_id) return;
    const info = await this._createService.locationInfo(d.location_id);
    if (!info) return;
    const self: LocationBreadcrumbItem = {
      level: info.location.level,
      id: info.location.id,
      name: info.location.name,
    };
    const bc = info.breadcrumb;
    const endsWithSelf = bc.length > 0 && bc[bc.length - 1].id === self.id;
    const path = endsWithSelf ? [...bc] : [...bc, self];
    this.addrPath.set(path);
    const leaf = Math.max(0, path.length - 1);
    const pubIdx = d.public_location_id
      ? path.findIndex((p) => p.id === d.public_location_id)
      : -1;
    this.revealIndex.set(pubIdx >= 0 ? pubIdx : leaf);
  }

  // Заполнение редактируемых сигналов из detail (Task 5).
  protected _prefill(d: PropertyDetail): void {
    this.isMaid.set(d.is_maid ?? false);
    this.isStudy.set(d.is_study ?? false);
    this.isHotelPool.set(d.is_hotel_pool ?? false);
    this.isVastu.set(d.is_vastu ?? false);
    this.areaSqft.set(d.area_sqft != null ? String(d.area_sqft) : '');
    this.plotSqft.set(d.plot_sqft != null ? String(d.plot_sqft) : '');
    this.floorLevelId.set(d.floor_level_id ?? null);
    this.floorNumber.set(d.floor_number != null ? String(d.floor_number) : '');
    this.floorsInUnitId.set(d.floors_in_unit_id ?? null);
    this.viewIds.set(d.view_ids ?? []);
    this.positionIds.set(d.position_ids ?? []);
    this.amenityIds.set(d.amenity_ids ?? []);
    this.furnished.set(d.furnished ?? null);
    this.price.set(d.price != null ? Number(d.price).toLocaleString('en-US') : '');
    this.pricePeriod.set(d.price_period ?? 'yearly');
    this.occupancyStatus.set(d.occupancy_status ?? 'vacant');
    this.leaseUntil.set(d.lease_until ?? null);
    this.listingType.set(d.listing_type ?? 'pocket');
    this.visibility.set(d.visibility ?? 'public');
    this.isExclusive.set(d.is_exclusive ?? false);
    // publicLocationId — computed из бегунка (Task 4B); здесь НЕ трогаем.
    // OP форматируем с разделителями (как основную цену) для единообразия.
    this.originalPrice.set(
      d.original_price != null ? Number(d.original_price).toLocaleString('en-US') : '',
    );
    this.description.set(d.description ?? '');
  }

  // Тоггл значения в мультиселекте (views/positions/amenities).
  toggleId(sig: ReturnType<typeof signal<string[]>>, id: string): void {
    const cur = sig();
    sig.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  // Форматирование цены с разделителями (как в add-property).
  onPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.price.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }

  // Оригинальная цена — тот же форматтер с разделителями, что и у основной цены.
  onOriginalPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.originalPrice.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }

  // Выбор файла Form A (PDF); не-PDF сбрасываем сразу (SP-C1).
  onFormAFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.type !== 'application/pdf') {
      this.formAFile.set(null);
      this.formAFileName.set('');
      input.value = '';
      return;
    }
    this.formAFile.set(file);
    this.formAFileName.set(file?.name ?? '');
    input.value = '';
  }

  // Подпись финальной кнопки: UX-подсказка (авторитет — серверный статус).
  readonly submitLabel = computed(() => {
    const d = this.detail();
    const willModerate =
      (this.listingType() === 'official' && this.formAFile() != null) ||
      (this.listingType() === 'official' && d?.listing_type !== 'official') ||
      (this.visibility() === 'public' && d?.visibility !== 'public');
    return willModerate ? 'Опубликовать' : 'Сохранить';
  });
}
