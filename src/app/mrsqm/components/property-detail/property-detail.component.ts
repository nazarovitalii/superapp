import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  untracked,
  OnDestroy,
  ViewChild,
  ElementRef,
  Injector,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  FilterOptionId,
  FilterOptions,
  OwnerAction,
  PropertyDetail,
  PropertyFeedItem,
  PropertyPhoto,
  PropertyProject,
  OWNER_ACTIONS_BY_STATUS,
  PROPERTY_STATUS_BANNER_TONE,
  PROPERTY_STATUS_LABELS,
} from '../../types/database';
import { formatDetailDate, formatLongDateRu } from '../../util/feed-date.util';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyCreateService } from '../../services/property-create.service';
import {
  ArchiveStatus,
  PropertyOwnerService,
} from '../../services/property-owner.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';
import { SeenTrackingService } from '../../services/seen-tracking.service';
import { SnackService } from '../../../core/snack/snack.service';
import { SnackType } from '../../../core/snack/snack.model';
import { MatDialog } from '@angular/material/dialog';
import { DialogConfirmComponent } from '../../../ui/dialog-confirm/dialog-confirm.component';
import { firstValueFrom } from 'rxjs';
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
  private readonly _snack = inject(SnackService);
  private readonly _injector = inject(Injector);
  private readonly _seen = inject(SeenTrackingService);
  private readonly _dialog = inject(MatDialog);
  private readonly _router = inject(Router);

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

  // Воронка доставки (Stage 2, Task 3): загружается лениво при первом открытии таба Metrics владельцем.
  readonly funnel = signal<{
    seen_preview: number;
    seen_full: number;
    seen_contact: number;
  } | null>(null);

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

    // После действий владельца (правка через окно редактирования, актуализация, архив)
    // перечитываем открытую карточку: id объекта не меняется → первый effect не сработает,
    // и панель показывала бы снапшот до изменения (раньше требовался reload страницы).
    // Зависим ТОЛЬКО от changedTick — id берём untracked, чтобы не дублировать первый effect.
    // t=0 — стартовое значение, пропускаем (деталь уже грузится выше).
    effect(() => {
      const t = this._ownerService.changedTick();
      if (t > 0) {
        void this.loadProperty(untracked(() => this.property().id));
      }
    });
  }

  readonly commentsCount = computed(
    () => this.detail()?.comments_count ?? this.property().comments_count ?? 0,
  );

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
      isReduced: d?.is_reduced ?? false,
      isBelowOp: d?.is_below_op ?? false,
      commissionIncluded: d?.commission_included ?? false,
      bedrooms: d?.bedrooms ?? f.bedrooms,
      bathrooms: d?.bathrooms ?? f.bathrooms,
      isMaid: d?.is_maid ?? false,
      isStudy: d?.is_study ?? false,
      areaSqft: d?.area_sqft ?? f.area_sqft,
      plotSqft: d?.plot_sqft ?? f.plot_sqft ?? null,
      floorLevel: this._label(d?.floor_level_id, opts?.floor_levels),
      floorsInUnit: this._label(d?.floors_in_unit_id, opts?.floors_in_unit_house),
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
      agentName: d?.agent?.full_name ?? f.owner_full_name,
      agentPhoto: d?.agent?.photo_url ?? f.owner_photo_url,
      agentAgency: d?.agent?.agency_name ?? f.owner_agency_name,
      agentEmirate: d?.agent?.emirate_name ?? null,
      agentLangs: d?.agent?.languages ?? null,
      agentAbout: d?.agent?.about ?? null,
      agentActiveListings: d?.agent?.active_listings_count ?? null,
      whatsapp: d?.agent?.whatsapp_phone ?? null,
      telegram: d?.agent?.tg_username ?? null,
      // V-8: категория и подтип разделены на два поля
      typeCategory: this._label(d?.category_id, opts?.categories),
      typeSubtype: this._composeSubtype(
        d?.unit_type_id,
        d?.sub_type_id,
        d?.is_hotel_pool ?? false,
        opts,
      ),
      createdLabel: formatDetailDate(d?.created_at),
      updatedLabelFull: formatDetailDate(d?.updated_at ?? d?.last_actualized_at),
      // Слой 2b: новые поля get_property.
      isVastu: d?.is_vastu ?? false,
      publicLocationPath: d?.public_location_path ?? null,
      project: this._mapProject(d?.project ?? null),
    };
  });

  setTab(tab: 'details' | 'comments' | 'metrics'): void {
    this.activeTab.set(tab);
    // Ленивая загрузка воронки при первом открытии таба Metrics владельцем.
    if (tab === 'metrics' && this.isOwner() && this.funnel() === null) {
      void this._loadFunnel();
    }
  }

  private async _loadFunnel(): Promise<void> {
    const id = this.detail()?.id;
    if (!id || !this.isOwner()) return;
    try {
      const r = await this._supabase.rpc<{
        seen_preview?: number;
        seen_full?: number;
        seen_contact?: number;
      }>('get_listing_delivery_stats', { p_property_id: id });
      this.funnel.set({
        seen_preview: r?.seen_preview ?? 0,
        seen_full: r?.seen_full ?? 0,
        seen_contact: r?.seen_contact ?? 0,
      });
    } catch {
      // воронка недоступна — просто не показываем
    }
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
    this.isSaved.set(false);
    this.funnel.set(null); // Сброс воронки при смене объекта.
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

  // Статус своего объекта (только владельцу, в блоке «Характеристики») —
  // метка из единого источника PROPERTY_STATUS_LABELS (types/database).
  readonly statusLabel = computed(() => {
    const s = this.detail()?.status;
    return s ? (PROPERTY_STATUS_LABELS[s] ?? s) : '';
  });

  // Тон баннера статуса (ошибка/предупреждение/успех/нейтраль) — для владельца.
  readonly bannerTone = computed(() => {
    const s = this.detail()?.status;
    return s ? PROPERTY_STATUS_BANNER_TONE[s] : 'neutral';
  });

  // Дата истечения активного объявления для шапки «Активно до 20 июля 2026» ('' если нет).
  readonly expiryDate = computed(() => formatLongDateRu(this.detail()?.expires_at));

  // Иконка шапки статуса: отклонён → ошибка, активен → галочка, прочее → инфо.
  readonly statusIcon = computed(() => {
    const s = this.detail()?.status;
    if (s === 'rejected') return 'error_outline';
    if (s === 'active') return 'check_circle';
    return 'info';
  });

  // Набор кнопок действий, доступных владельцу для текущего статуса.
  readonly ownerActions = computed((): OwnerAction[] => {
    const s = this.detail()?.status;
    return s ? OWNER_ACTIONS_BY_STATUS[s] : [];
  });

  readonly ownerBusy = signal(false);

  /** Помощник: показать снек-сообщение с общим конфигом (низ-лево, стиль ленты). */
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

  /** Переход на страницу редактирования своего объекта. */
  goEdit(): void {
    const id = this.detail()?.id;
    if (id) void this._router.navigateByUrl(`/mrsqm/edit/${id}`);
  }

  async actualize(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.ownerBusy.set(true);
    try {
      await this._ownerService.actualizeProperty(d.id);
      this.detail.set({ ...d, last_actualized_at: new Date().toISOString() });
      this._notify('Объект актуализирован и поднят наверх', 'SUCCESS', 'arrow_upward');
    } catch {
      this._notify('Не удалось актуализировать', 'ERROR');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  async archive(status: ArchiveStatus): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.ownerBusy.set(true);
    try {
      await this._ownerService.archiveProperty(d.id, status);
      this.detail.set({ ...d, status });
      this._notify(
        status === 'archived_sold' ? 'Отмечено: продан' : 'Снято с публикации',
        'SUCCESS',
      );
    } catch {
      this._notify('Не удалось изменить статус', 'ERROR');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  /** Продлить истёкший объект ещё на 30 дней (статус expired → active). */
  async renew(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.ownerBusy.set(true);
    try {
      await this._ownerService.renewProperty(d.id);
      this.detail.set({ ...d, status: 'active' });
      this._notify('Объект продлён на 30 дней', 'SUCCESS', 'autorenew');
    } catch {
      this._notify('Не удалось продлить', 'ERROR');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  /** Снять с публикации / отметить проданным с диалогом подтверждения. */
  async confirmArchive(status: ArchiveStatus): Promise<void> {
    const msg =
      status === 'archived_sold'
        ? {
            title: 'Отметить объект как проданный?',
            message: 'Он уйдёт из активной выдачи.',
            okTxt: 'Отметить проданным',
          }
        : { title: 'Снять объект с публикации?', message: '', okTxt: 'Снять' };
    const ok = await firstValueFrom(
      this._dialog
        .open(DialogConfirmComponent, { data: { ...msg, titleIcon: 'inventory_2' } })
        .afterClosed(),
    );
    if (ok) await this.archive(status);
  }

  /** Безвозвратно удалить объект с диалогом подтверждения. */
  async confirmDelete(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const ok = await firstValueFrom(
      this._dialog
        .open(DialogConfirmComponent, {
          data: {
            title: 'Удалить объект навсегда?',
            message:
              'Объект и все его следы будут стёрты безвозвратно: фотографии, история цены, совпадения с фильтрами. Это действие нельзя отменить.',
            okTxt: 'Удалить навсегда',
            titleIcon: 'delete_forever',
          },
        })
        .afterClosed(),
    );
    if (!ok) return;
    this.ownerBusy.set(true);
    try {
      await this._ownerService.deleteProperty(d.id);
      this._notify('Объект удалён', 'SUCCESS');
      this.closed.emit();
    } catch {
      this._notify('Не удалось удалить', 'ERROR');
    } finally {
      this.ownerBusy.set(false);
    }
  }

  openWhatsApp(phone: string): void {
    const id = this.detail()?.id;
    if (id) void this._seen.recordContact(id);
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
  }

  openTelegram(username: string): void {
    const id = this.detail()?.id;
    if (id) void this._seen.recordContact(id);
    window.open(`https://t.me/${username.replace(/^@/, '')}`, '_blank');
  }

  // Готовые строки Project-блока из location_developers (правила согласованы 2026-06-17).
  private _mapProject(p: PropertyProject | null): {
    name: string | null;
    clusterLabel: string;
    clusterValue: string | null;
    developer: string | null;
    completion: string | null;
    handover: string | null;
  } | null {
    if (!p) return null;
    const clusterLabel =
      p.is_building === true
        ? 'Building'
        : p.is_building === false
          ? 'Cluster'
          : 'Project';
    let completion: string | null = null;
    if (p.project_status === 'completed') completion = 'Ready';
    else if (p.project_status === 'under_construction' || p.project_status === 'planned')
      completion = 'Off-Plan';
    let handover: string | null = null;
    if (p.project_status === 'completed') {
      handover = p.built_year ? String(p.built_year) : null;
    } else if (p.completion_q && p.completion_year) {
      handover = `${p.completion_q} ${p.completion_year}`;
    }
    return {
      name: p.project_group_name,
      clusterLabel,
      clusterValue: p.project_name,
      developer: p.developer_name,
      completion,
      handover,
    };
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

  // V-8: подтип объекта — sub_type, фолбэк на unit_type; суффикс hotel apartment при is_hotel_pool.
  private _composeSubtype(
    unitTypeId: string | null | undefined,
    subTypeId: string | null | undefined,
    isHotelPool: boolean,
    opts: FilterOptions | null,
  ): string | null {
    const unit = this._label(unitTypeId, opts?.unit_types);
    const sub = this._label(subTypeId, opts?.sub_types);
    const base = sub ?? unit;
    if (!base) return null;
    return isHotelPool ? `${base} (hotel apartment)` : base;
  }
}
