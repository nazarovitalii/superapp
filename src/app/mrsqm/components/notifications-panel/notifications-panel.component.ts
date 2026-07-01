import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NotificationsService } from '../../services/notifications.service';
import { NotificationRowComponent } from '../notification-row/notification-row.component';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { SavedFilterService } from '../../services/saved-filter.service';
import { SeenTrackingService } from '../../services/seen-tracking.service';
import { notificationTarget } from '../../util/notification-route';
import { NotificationItem } from '../../types/notification';
import { SavedFilter } from '../../services/feed-filter.service';
import { PropertyFeedItem } from '../../types/database';

@Component({
  selector: 'mrsqm-notifications-panel',
  standalone: true,
  imports: [NotificationRowComponent],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPanelComponent implements OnInit {
  private readonly _panels = inject(PanelContentService);
  private readonly _savedFilterService = inject(SavedFilterService);
  private readonly _seen = inject(SeenTrackingService);

  readonly store = inject(NotificationsService);

  // Кэш фильтров для отображения имён в строках уведомлений.
  private readonly _filters = signal<SavedFilter[]>([]);

  ngOnInit(): void {
    // Параллельно грузим уведомления и список фильтров.
    void this.store.loadFirst();
    void this._savedFilterService.list().then((filters) => {
      this._filters.set(filters);
    });
  }

  /** Возвращает имя фильтра для матч-уведомления или null. */
  filterNameFor(item: NotificationItem): string | null {
    if (!item.filter_id) return null;
    return this._filters().find((f) => f.id === item.filter_id)?.auto_name ?? null;
  }

  onRow(item: NotificationItem): void {
    if (item.read_at == null) {
      void this.store.markRead([item.id]);
    }
    const t = notificationTarget(item);
    if (t.kind === 'property') {
      // Bug 2: переход на объект = просмотр → track_view + реконсиляция счётчиков фильтра.
      void this._seen.recordView(t.id);
      // Минимальный stub: property-detail догрузит полные данные по id через get_property.
      const stub: PropertyFeedItem = {
        id: t.id,
        owner_id: '',
        deal_type: 'sale',
        listing_type: 'pocket',
        property_type: null,
        unit_type_id: null,
        price: 0,
        price_currency: 'AED',
        price_period: null,
        bedrooms: null,
        bathrooms: null,
        area_sqft: null,
        location_name: null,
        community_name: null,
        description: null,
        furnished: null,
        handover: null,
        photos: null,
        published_at: new Date().toISOString(),
        owner_full_name: null,
        owner_photo_url: null,
        owner_agency_name: null,
        is_network: false,
        developer_name: null,
      };
      this._panels.openProperty(stub);
    }
    // friends / billing / chat — навигация добавляется при появлении соответствующих экранов (вне scope v1).
  }

  onMarkAll(): void {
    void this.store.markAllRead();
  }

  onClose(): void {
    this._panels.closeNotifications();
  }
}
