import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  OnDestroy,
  ViewChild,
  ElementRef,
  Injector,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  FilterOptionId,
  FilterOptions,
  PropertyDetail,
  PropertyFeedItem,
  PropertyPhoto,
} from '../../types/database';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyCreateService } from '../../services/property-create.service';
import {
  ArchiveStatus,
  PropertyOwnerService,
} from '../../services/property-owner.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';
import Swiper from 'swiper';
import { Navigation, Thumbs } from 'swiper/modules';

@Component({
  selector: 'mrsqm-property-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './property-detail.component.html',
  styleUrl: './property-detail.component.scss',
})
export class PropertyDetailComponent implements OnDestroy {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _photoService = inject(PropertyPhotoService);
  private readonly _createService = inject(PropertyCreateService);
  private readonly _ownerService = inject(PropertyOwnerService);
  private readonly _saved = inject(SavedPropertiesService);
  private readonly _injector = inject(Injector);

  @ViewChild('lightboxDialog') private _lightboxDialogEl?: ElementRef<HTMLDialogElement>;
  @ViewChild('lightboxMain') private _lightboxMainEl?: ElementRef<HTMLElement>;
  @ViewChild('lightboxThumbs') private _lightboxThumbsEl?: ElementRef<HTMLElement>;
  @ViewChild('lightboxPrev') private _lightboxPrevEl?: ElementRef<HTMLElement>;
  @ViewChild('lightboxNext') private _lightboxNextEl?: ElementRef<HTMLElement>;

  private _mainSwiper: Swiper | null = null;
  private _thumbsSwiper: Swiper | null = null;

  readonly property = input.required<PropertyFeedItem>();
  readonly closed = output<void>();

  readonly detail = signal<PropertyDetail | null>(null);
  readonly photos = signal<PropertyPhoto[]>([]);
  readonly filterOptions = signal<FilterOptions | null>(null);
  readonly isLoading = signal(true);
  readonly activePhotoIdx = signal(0);
  readonly isSaved = signal(false);

  readonly activeTab = signal<'details' | 'comments' | 'metrics'>('details');
  readonly commentsScope = signal<'all' | 'private'>('all');

  // Состояние лайтбокса Swiper.
  readonly lightboxOpen = signal(false);
  readonly lightboxIdx = signal(0);

  constructor() {
    // Правая панель ПЕРЕИСПОЛЬЗУЕТ этот компонент при смене объекта (меняется только
    // input [property], ngOnInit второй раз не вызывается). Поэтому грузим деталь
    // реактивно на каждое изменение property() — иначе у всех объектов одни и те же фото.
    effect(() => {
      const id = this.property().id;
      void this.loadProperty(id);
    });
  }

  readonly commentsCount = computed(
    () => this.detail()?.comments_count ?? this.property().comments_count ?? 0,
  );

  // Метрики объекта (таб Metrics, только владельцу). Источник — get_property.
  readonly metricsVm = computed(() => {
    const d = this.detail();
    return {
      views: d?.views_count ?? 0,
      uniqueViews: d?.unique_views_count ?? 0,
      impressions: d?.impressions_count ?? 0,
      contacts: d?.contacts_count ?? 0,
      comments: d?.comments_count ?? this.property().comments_count ?? 0,
    };
  });

  readonly currentPhotoUrl = computed(() => {
    const list = this.photos();
    return list.length ? list[this.activePhotoIdx() % list.length].full_url : null;
  });

  readonly vm = computed(() => {
    const d = this.detail();
    const f = this.property();
    const opts = this.filterOptions();
    const previousPrice =
      d?.previous_price && d.previous_price > (d?.price ?? f.price)
        ? d.previous_price
        : null;
    return {
      price: d?.price ?? f.price,
      previousPrice,
      currency: d?.price_currency ?? f.price_currency,
      period: d?.price_period ?? f.price_period,
      dealType: d?.deal_type ?? f.deal_type,
      isDistress: d?.is_distress ?? f.is_distress,
      isNegotiable: d?.is_negotiable ?? false,
      commissionIncluded: d?.commission_included ?? false,
      bedrooms: d?.bedrooms ?? f.bedrooms,
      bathrooms: d?.bathrooms ?? f.bathrooms,
      isMaid: d?.is_maid ?? false,
      areaSqft: d?.area_sqft ?? f.area_sqft,
      plotSqft: d?.plot_sqft ?? f.plot_sqft ?? null,
      floorLevel: this._label(d?.floor_level_id, opts?.floor_levels),
      floorsInUnit: d?.floors_in_unit ?? null,
      furnishedLabel: this._furnishedLabel(d?.furnished ?? f.furnished),
      handoverLabel: this._handoverLabel(d?.handover ?? f.handover),
      completion: d?.completion_year
        ? `${d.completion_q ? d.completion_q + ' ' : ''}${d.completion_year}`
        : null,
      occupancyLabel: this._occupancyLabel(d?.occupancy_status),
      leaseLabel: this._leaseLabel(d?.lease_until),
      views: this._labels(d?.view_ids, opts?.views),
      positions: this._labels(d?.position_ids, opts?.positions),
      amenities: this._labels(d?.amenity_ids, opts?.amenities),
      locationPath: d?.location_full_path ?? f.location_name,
      description: d?.description ?? f.description,
      developerName: d?.developer_name_ref ?? d?.developer_name ?? f.developer_name,
      developerLogo: d?.developer_logo_url ?? null,
      isOfficial: (d?.listing_type ?? f.listing_type) === 'official',
      titleDeedNumber: d?.title_deed_number ?? null,
      titleDeedYear: d?.title_deed_year ?? null,
      plotNumber: d?.plot_number ?? null,
      municipalityNumber: d?.municipality_number ?? null,
      viewsCount: d?.views_count ?? null,
      updatedLabel: this._relativeDate(
        d?.last_actualized_at ??
          d?.published_at ??
          f.last_actualized_at ??
          f.published_at,
      ),
      agentName: d?.agent?.full_name ?? f.owner_full_name,
      agentPhoto: d?.agent?.photo_url ?? f.owner_photo_url,
      agentAgency: d?.agent?.agency_name ?? f.owner_agency_name,
      agentEmirate: d?.agent?.emirate_name ?? null,
      agentLangs: d?.agent?.languages ?? null,
      agentAbout: d?.agent?.about ?? null,
      whatsapp: d?.agent?.whatsapp_phone ?? null,
      telegram: d?.agent?.tg_username ?? null,
      typeLabel: this._composeType(
        d?.category_id,
        d?.unit_type_id,
        d?.sub_type_id,
        d?.is_hotel_pool ?? false,
        opts,
      ),
      createdLabel: this._fmtDate(d?.created_at),
      updatedLabelFull: this._fmtDate(d?.updated_at ?? d?.last_actualized_at),
    };
  });

  setTab(tab: 'details' | 'comments' | 'metrics'): void {
    this.activeTab.set(tab);
  }

  setCommentsScope(scope: 'all' | 'private'): void {
    this.commentsScope.set(scope);
  }

  async loadProperty(id: PropertyFeedItem['id'] = this.property().id): Promise<void> {
    this.isLoading.set(true);
    // Сбрасываем данные предыдущего объекта, чтобы не мелькали чужие фото.
    this.detail.set(null);
    this.photos.set([]);
    this.activePhotoIdx.set(0);
    this.activeTab.set('details');
    if (this._lightboxDialogEl?.nativeElement.open) {
      this.closeLightbox();
    }
    const [detailRes, photosRes, optsRes, savedRes] = await Promise.allSettled([
      this._supabase.rpc<PropertyDetail>('get_property', {
        p_property_id: id,
      }),
      this._photoService.getPhotos(id),
      this._createService.getFilterOptions(),
      this._saved.getSavedIds(),
    ]);
    // Пока грузили, мог открыться другой объект — не затираем его данные.
    if (this.property().id !== id) {
      return;
    }
    if (detailRes.status === 'fulfilled' && !detailRes.value?.error) {
      this.detail.set(detailRes.value);
    }
    if (photosRes.status === 'fulfilled') {
      this.photos.set(photosRes.value);
    }
    if (optsRes.status === 'fulfilled') {
      this.filterOptions.set(optsRes.value);
    }
    if (savedRes.status === 'fulfilled') {
      this.isSaved.set(savedRes.value.has(id));
    }
    this.isLoading.set(false);
  }

  nextPhoto(): void {
    const len = this.photos().length;
    if (len <= 1) return;
    this.activePhotoIdx.set((this.activePhotoIdx() + 1) % len);
  }

  prevPhoto(): void {
    const len = this.photos().length;
    if (len <= 1) return;
    this.activePhotoIdx.set((this.activePhotoIdx() - 1 + len) % len);
  }

  // Добавить/убрать текущий объект из избранного (RPC save_property).
  async toggleSaved(): Promise<void> {
    const id = this.property().id;
    try {
      const saved = await this._saved.toggle(id);
      this.isSaved.set(saved);
    } catch {
      // молча: избранное не критично, состояние не меняем
    }
  }

  // Открыть fullscreen лайтбокс Swiper. DOM рендерится через @if, затем диалог поднимается
  // в top layer браузера через showModal() — это выводит его ПОВЕРХ правой панели
  // (у right-panel-content стоит `will-change: transform`, который иначе запирает
  // `position: fixed` внутри панели и лента наезжает на галерею). После показа диалога
  // инициализируем Swiper — к этому моменту размеры уже корректны.
  openLightbox(index: number): void {
    const photos = this.photos();
    if (!photos.length) return;
    this.lightboxIdx.set(index);
    this.lightboxOpen.set(true);
    afterNextRender(
      () => {
        this._lightboxDialogEl?.nativeElement.showModal();
        // Диалог только что поднят в top layer. Высота .lightbox-main (flex:1)
        // разрешается не сразу: на первом кадре она ещё 0 → главный Swiper стартует
        // с нулевой высотой (фото невидимо, стрелки обрезаны overflow:hidden), хотя
        // миниатюры с фикс-высотой видны. Поэтому init на первом кадре, а на втором —
        // update(), когда раскладка уже посчитана.
        requestAnimationFrame(() => {
          this._initLightboxSwiper(index);
          requestAnimationFrame(() => {
            this._mainSwiper?.update();
            this._thumbsSwiper?.update();
          });
        });
      },
      { injector: this._injector },
    );
  }

  // Закрытие по кнопке/клику по фону: закрываем нативный диалог, очистка — в onDialogClose.
  closeLightbox(): void {
    const dlg = this._lightboxDialogEl?.nativeElement;
    if (dlg?.open) {
      dlg.close();
    } else {
      this.onDialogClose();
    }
  }

  // Срабатывает и при нативном Escape, и при dlg.close() — единая точка очистки.
  onDialogClose(): void {
    this._destroySwipers();
    this.lightboxOpen.set(false);
  }

  private _initLightboxSwiper(startIndex: number): void {
    this._destroySwipers();
    const mainEl = this._lightboxMainEl?.nativeElement;
    const thumbEl = this._lightboxThumbsEl?.nativeElement;
    const prevEl = this._lightboxPrevEl?.nativeElement;
    const nextEl = this._lightboxNextEl?.nativeElement;
    if (!mainEl || !thumbEl) return;

    this._thumbsSwiper = new Swiper(thumbEl, {
      modules: [Navigation],
      spaceBetween: 8,
      slidesPerView: 'auto',
      watchSlidesProgress: true,
      slideToClickedSlide: true,
      observer: true,
      observeParents: true,
    });

    this._mainSwiper = new Swiper(mainEl, {
      modules: [Navigation, Thumbs],
      initialSlide: startIndex,
      loop: false,
      navigation: prevEl && nextEl ? { prevEl, nextEl } : false,
      thumbs: { swiper: this._thumbsSwiper },
      keyboard: { enabled: true },
      observer: true,
      observeParents: true,
      on: {
        slideChange: (swiper: Swiper) => this.lightboxIdx.set(swiper.activeIndex),
      },
    });
  }

  private _destroySwipers(): void {
    this._mainSwiper?.destroy(true, true);
    this._mainSwiper = null;
    this._thumbsSwiper?.destroy(true, true);
    this._thumbsSwiper = null;
  }

  ngOnDestroy(): void {
    this._destroySwipers();
  }

  // ─── Действия владельца над своим объектом (is_owner) ──────────────────────
  readonly isOwner = computed(() => this.detail()?.is_owner ?? false);
  readonly ownerBusy = signal(false);
  readonly ownerMsg = signal<string | null>(null);
  readonly isEditing = signal(false);
  readonly editPrice = signal('');
  readonly editDescription = signal('');

  startEdit(): void {
    const d = this.detail();
    this.editPrice.set(d ? String(d.price) : '');
    this.editDescription.set(d?.description ?? '');
    this.ownerMsg.set(null);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }

  async saveEdit(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const price = Number(String(this.editPrice()).replace(/[^\d.]/g, ''));
    if (!price || price <= 0) {
      this.ownerMsg.set('Укажите корректную цену');
      return;
    }
    const description = this.editDescription().trim() || null;
    this.ownerBusy.set(true);
    this.ownerMsg.set(null);
    try {
      await this._ownerService.updateProperty(d.id, price, description);
      this.detail.set({ ...d, price, description });
      this.isEditing.set(false);
      this.ownerMsg.set('Сохранено');
    } catch {
      this.ownerMsg.set('Не удалось сохранить');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  async actualize(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.ownerBusy.set(true);
    this.ownerMsg.set(null);
    try {
      await this._ownerService.actualizeProperty(d.id);
      this.detail.set({ ...d, last_actualized_at: new Date().toISOString() });
      this.ownerMsg.set('Объект актуализирован');
    } catch {
      this.ownerMsg.set('Не удалось актуализировать');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  async archive(status: ArchiveStatus): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.ownerBusy.set(true);
    this.ownerMsg.set(null);
    try {
      await this._ownerService.archiveProperty(d.id, status);
      this.detail.set({ ...d, status });
      this.ownerMsg.set(
        status === 'archived_sold' ? 'Отмечено: продан' : 'Снято с публикации',
      );
    } catch {
      this.ownerMsg.set('Не удалось изменить статус');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  openWhatsApp(phone: string): void {
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
  }

  openTelegram(username: string): void {
    window.open(`https://t.me/${username.replace(/^@/, '')}`, '_blank');
  }

  private _label(id: string | null | undefined, list?: FilterOptionId[]): string | null {
    if (!id || !list) return null;
    return list.find((o) => o.id === id)?.label_en ?? null;
  }

  private _labels(ids: string[] | null | undefined, list?: FilterOptionId[]): string[] {
    if (!ids?.length || !list) return [];
    return ids
      .map((id) => list.find((o) => o.id === id)?.label_en ?? null)
      .filter((x): x is string => !!x);
  }

  private _furnishedLabel(v: string | null | undefined): string | null {
    if (!v) return null;
    return v === 'furnished' ? 'Меблировано' : 'Без мебели';
  }

  private _handoverLabel(v: string | null | undefined): string | null {
    if (!v) return null;
    return v === 'ready' ? 'Готово' : 'Строительство';
  }

  private _occupancyLabel(v: string | null | undefined): string | null {
    switch (v) {
      case 'vacant':
        return 'Свободно';
      case 'occupied':
        return 'Занято';
      case 'vacant_on_transfer':
        return 'Свободно при передаче';
      default:
        return null;
    }
  }

  private _leaseLabel(v: string | null | undefined): string | null {
    if (!v) return null;
    const [y, m] = v.split('-');
    return y && m ? `до ${m}.${y}` : null;
  }

  private _relativeDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
    return `${Math.floor(days / 365)} г. назад`;
  }

  // «Residential Apartment - Flat (hotel apartment)» из справочников.
  private _composeType(
    categoryId: string | null | undefined,
    unitTypeId: string | null | undefined,
    subTypeId: string | null | undefined,
    isHotelPool: boolean,
    opts: FilterOptions | null,
  ): string | null {
    const cat = this._label(categoryId, opts?.categories);
    const unit = this._label(unitTypeId, opts?.unit_types);
    const sub = this._label(subTypeId, opts?.sub_types);
    const head = [cat, unit].filter(Boolean).join(' ');
    let out = sub ? (head ? `${head} - ${sub}` : sub) : head;
    if (!out) return null;
    if (isHotelPool) out += ' (hotel apartment)';
    return out;
  }

  // Дата в формате DD.MM.YYYY (для Created/Updated).
  private _fmtDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  }
}
