import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NotificationsService } from '../../services/notifications.service';
import { SavedFilterService } from '../../services/saved-filter.service';
import { SeenTrackingService } from '../../services/seen-tracking.service';
import { SavedFilter } from '../../services/feed-filter.service';
import { NotificationItem } from '../../types/notification';
import { notificationTarget } from '../../util/notification-route';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { PropertyFeedItem } from '../../types/database';
import { NotificationRowComponent } from '../notification-row/notification-row.component';

@Component({
  selector: 'mrsqm-bell-dropdown',
  standalone: true,
  imports: [MatIcon, NotificationRowComponent],
  templateUrl: './bell-dropdown.component.html',
  styleUrl: './bell-dropdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BellDropdownComponent implements OnInit {
  private readonly _store = inject(NotificationsService);
  private readonly _savedFilters = inject(SavedFilterService);
  private readonly _panels = inject(PanelContentService);
  private readonly _seen = inject(SeenTrackingService);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  readonly status = this._store.status;
  readonly previewItems = this._store.previewItems;
  readonly personalUnread = this._store.personalUnread;

  private readonly _filters = signal<SavedFilter[]>([]);

  readonly viewState = computed<'loading' | 'error' | 'empty' | 'list'>(() => {
    if (this.status() === 'loading' && !this.previewItems().length) return 'loading';
    if (this.status() === 'error') return 'error';
    if (!this.previewItems().length) return 'empty';
    return 'list';
  });

  constructor() {
    // Открытие/закрытие нативного <dialog> по input open (top-layer showModal).
    effect(() => {
      const dlg = this.dialogRef()?.nativeElement;
      if (!dlg) return;
      if (this.open() && !dlg.open) dlg.showModal();
      else if (!this.open() && dlg.open) dlg.close();
    });
  }

  ngOnInit(): void {
    void this._store.loadFirst();
    void this._savedFilters.list().then((filters) => this._filters.set(filters));
  }

  // Название фильтра по filter_id уведомления (для передачи в notification-row).
  filterNameFor(item: NotificationItem): string | null {
    return item.filter_id
      ? (this._filters().find((f) => f.id === item.filter_id)?.auto_name ?? null)
      : null;
  }

  onRow(item: NotificationItem): void {
    // Bug 2: клик по уведомлению = прочитано → гасим счётчик колокола (−1).
    if (item.read_at == null) {
      void this._store.markRead([item.id]);
    }
    const target = notificationTarget(item);
    if (target.kind === 'property') {
      // Bug 2: переход на объект = просмотр → track_view + реконсиляция счётчиков фильтра.
      void this._seen.recordView(target.id);
      this._panels.openProperty(this._toFeedStub(target.id, item));
    }
    // friends/billing/chat/none: навигация вне scope v1 — просто закрываем
    this.closed.emit();
  }

  onMarkAllRead(): void {
    void this._store.markAllRead();
    this.closed.emit();
  }

  onViewAll(): void {
    this._panels.openNotifications();
    this.closed.emit();
  }

  onViewPersonal(): void {
    // Переход на вкладку «Личные» в сайдбаре: ставим scope без перезагрузки,
    // панель догрузит в ngOnInit. Бейдж колокола и общий счётчик не трогаем.
    this._store.setScopeSilently('personal');
    this._panels.openNotifications();
    this.closed.emit();
  }

  onRetry(): void {
    void this._store.loadFirst();
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === this.dialogRef()?.nativeElement) this.closed.emit();
  }

  onDialogClose(): void {
    if (this.open()) this.closed.emit(); // Esc / нативное закрытие
  }

  // Минимальный stub PropertyFeedItem: property-detail сам догрузит полное через get_property.
  private _toFeedStub(propertyId: string, item: NotificationItem): PropertyFeedItem {
    const data = item.data as Record<string, unknown>;
    return {
      id: propertyId,
      owner_id: '',
      deal_type: (typeof data['deal_type'] === 'string'
        ? data['deal_type']
        : 'sale') as PropertyFeedItem['deal_type'],
      listing_type: 'pocket',
      property_type: null,
      unit_type_id:
        typeof data['unit_type_id'] === 'string' ? data['unit_type_id'] : null,
      price: typeof data['price'] === 'number' ? data['price'] : 0,
      price_currency:
        typeof data['price_currency'] === 'string' ? data['price_currency'] : 'AED',
      price_period: null,
      bedrooms: typeof data['bedrooms'] === 'number' ? data['bedrooms'] : null,
      bathrooms: null,
      area_sqft: null,
      location_name:
        typeof data['location_label'] === 'string' ? data['location_label'] : null,
      community_name:
        typeof data['community_label'] === 'string' ? data['community_label'] : null,
      description: null,
      furnished: null,
      handover: null,
      photos: null,
      published_at: item.created_at,
      owner_full_name: null,
      owner_photo_url: null,
      owner_agency_name: null,
      is_network: false,
      developer_name: null,
    };
  }
}
