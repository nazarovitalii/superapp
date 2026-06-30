import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotificationsPanelComponent } from './notifications-panel.component';
import { NotificationsService } from '../../services/notifications.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { SavedFilterService } from '../../services/saved-filter.service';

describe('NotificationsPanelComponent', () => {
  let fixture: ComponentFixture<NotificationsPanelComponent>;

  const items = signal<
    {
      id: string;
      type: string;
      created_at: string;
      read_at: null;
      entity_id: string;
      filter_id: null;
      thumb_url: null;
      data: { title: string };
      source: string;
    }[]
  >([
    {
      id: '1',
      type: 'listing_approved',
      created_at: new Date().toISOString(),
      read_at: null,
      entity_id: 'p',
      filter_id: null,
      thumb_url: null,
      data: { title: 'X' },
      source: 'n',
    },
  ]);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationsPanelComponent],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            items,
            unreadCount: signal(1),
            nextCursor: signal(null),
            status: signal('ready'),
            loadFirst: () => Promise.resolve(),
            loadMore: () => Promise.resolve(),
            markAllRead: () => Promise.resolve(),
            markRead: () => Promise.resolve(),
          },
        },
        {
          provide: PanelContentService,
          useValue: {
            closeNotifications: () => {},
            openProperty: () => {},
          },
        },
        {
          provide: SavedFilterService,
          useValue: {
            list: () => Promise.resolve([]),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(NotificationsPanelComponent);
    fixture.detectChanges();
  });

  it('рендерит строку уведомления', () => {
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mrsqm-notification-row'),
    ).toBeTruthy();
  });
});
