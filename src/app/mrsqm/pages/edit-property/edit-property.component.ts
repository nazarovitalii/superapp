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
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import {
  FilterOptions,
  LocationBreadcrumbItem,
  PropertyDetail,
  PropertyPhoto,
} from '../../types/database';
import { typeFieldsFor, TypeFields } from '../add-property/property-type-fields';
import { revealIndexFromFraction } from '../add-property/add-property-page.component';

type EditTab = 'params' | 'description' | 'photos';

@Component({
  selector: 'mrsqm-edit-property-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './edit-property.component.html',
  styleUrl: './edit-property.component.scss',
})
export class EditPropertyPageComponent {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _createService = inject(PropertyCreateService);
  private readonly _photoService = inject(PropertyPhotoService);

  readonly detail = signal<PropertyDetail | null>(null);
  readonly options = signal<FilterOptions | null>(null);
  readonly photos = signal<PropertyPhoto[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly tab = signal<EditTab>('params');

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

  setTab(t: EditTab): void {
    this.tab.set(t);
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
      this._prefill(detail); // реализуется в Task 5 (заглушка-метод сейчас)
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

  // Заполнение полей формы из detail. Тело — Task 5.
  protected _prefill(_detail: PropertyDetail): void {
    // no-op в scaffold
  }
}
