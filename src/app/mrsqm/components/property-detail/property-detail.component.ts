import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
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
import { PropertyGalleryLightboxComponent } from '../property-gallery-lightbox/property-gallery-lightbox.component';

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
    PropertyGalleryLightboxComponent,
  ],
  templateUrl: './property-detail.component.html',
  styleUrl: './property-detail.component.scss',
})
export class PropertyDetailComponent implements OnInit {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _photoService = inject(PropertyPhotoService);
  private readonly _createService = inject(PropertyCreateService);
  private readonly _ownerService = inject(PropertyOwnerService);

  // Объект из ленты (по нему открыли карточку) — фолбэк, пока грузится detail.
  readonly property = input.required<PropertyFeedItem>();
  readonly closed = output<void>();

  readonly detail = signal<PropertyDetail | null>(null);
  readonly photos = signal<PropertyPhoto[]>([]);
  readonly filterOptions = signal<FilterOptions | null>(null);
  readonly isLoading = signal(true);
  readonly activePhotoIdx = signal(0);
  // Полноэкранный лайтбокс: открыт ли + с какого фото.
  readonly lightboxOpen = signal(false);
  readonly lightboxStart = signal(0);

  // Табы карточки: Инфо / Комментарии (item 13).
  readonly activeTab = signal<'info' | 'comments'>('info');
  // Подтабы комментариев: All (видны всем) / Private (только мне).
  readonly commentsScope = signal<'all' | 'private'>('all');

  readonly commentsCount = computed(
    () => this.detail()?.comments_count ?? this.property().comments_count ?? 0,
  );

  // URL текущего фото для галереи.
  readonly currentPhotoUrl = computed(() => {
    const list = this.photos();
    return list.length ? list[this.activePhotoIdx() % list.length].full_url : null;
  });

  // View-model карточки: detail с фолбэком на feed-item, id-массивы резолвятся
  // в названия через get_filter_options, даты/enum форматируются для шаблона.
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
    };
  });

  setTab(tab: 'info' | 'comments'): void {
    this.activeTab.set(tab);
  }

  setCommentsScope(scope: 'all' | 'private'): void {
    this.commentsScope.set(scope);
  }

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    // Параллельно: полная карточка, фото, справочники для резолва id→названия.
    const [detailRes, photosRes, optsRes] = await Promise.allSettled([
      this._supabase.rpc<PropertyDetail>('get_property', {
        p_property_id: this.property().id,
      }),
      this._photoService.getPhotos(this.property().id),
      this._createService.getFilterOptions(),
    ]);
    // get_property отдаёт { error } при отказе доступа — тогда показываем feed-item.
    if (detailRes.status === 'fulfilled' && !detailRes.value?.error) {
      this.detail.set(detailRes.value);
    }
    if (photosRes.status === 'fulfilled') {
      this.photos.set(photosRes.value);
    }
    if (optsRes.status === 'fulfilled') {
      this.filterOptions.set(optsRes.value);
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

  openLightbox(index: number): void {
    if (!this.photos().length) return;
    this.lightboxStart.set(index);
    this.lightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  // ─── Действия владельца над своим объектом (is_owner) ──────────────────────
  readonly isOwner = computed(() => this.detail()?.is_owner ?? false);
  readonly ownerBusy = signal(false);
  readonly ownerMsg = signal<string | null>(null);
  // Inline-редактирование цены/описания.
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

  // ─── Хелперы форматирования (чистые, вызываются из vm-computed) ─────────────

  // Название опции по id из справочника get_filter_options.
  private _label(id: string | null | undefined, list?: FilterOptionId[]): string | null {
    if (!id || !list) return null;
    return list.find((o) => o.id === id)?.label_en ?? null;
  }

  // Названия по массиву id (пустые/ненайденные отбрасываются).
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

  // lease_until хранится как YYYY-MM-01 → «занято до MM.YYYY».
  private _leaseLabel(v: string | null | undefined): string | null {
    if (!v) return null;
    const [y, m] = v.split('-');
    return y && m ? `до ${m}.${y}` : null;
  }

  // Относительная дата актуализации: «сегодня», «вчера», «N дн. назад».
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
}
