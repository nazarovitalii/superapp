import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotificationsPanelComponent } from './notifications-panel.component';
import { NotificationsService } from '../../services/notifications.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { SavedFilterService } from '../../services/saved-filter.service';
import { SeenTrackingService } from '../../services/seen-tracking.service';

const scope = signal<'all' | 'personal'>('all');
const personalUnread = signal(0);
const setScope = jasmine.createSpy('setScope');
const resetScope = jasmine.createSpy('resetScope');

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
    scope.set('all');
    personalUnread.set(0);
    setScope.calls.reset();
    resetScope.calls.reset();
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
            scope,
            personalUnread,
            setScope,
            resetScope,
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
        {
          provide: SeenTrackingService,
          useValue: {
            recordView: () => Promise.resolve(),
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

  it('рендерит две вкладки «Все» и «Личные»', () => {
    const tabs = fixture.nativeElement.querySelectorAll('.ntf-tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Все');
    expect(tabs[1].textContent).toContain('Личные');
  });

  it('клик по вкладке «Личные» зовёт setScope(personal)', () => {
    const tabs = fixture.nativeElement.querySelectorAll('.ntf-tab');
    tabs[1].click();
    expect(setScope).toHaveBeenCalledWith('personal');
  });

  it('активная вкладка помечена классом is-active по scope()', () => {
    scope.set('personal');
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('.ntf-tab');
    expect(tabs[0].classList).not.toContain('is-active');
    expect(tabs[1].classList).toContain('is-active');
  });

  it('счётчик личных виден при personalUnread > 0 и скрыт при 0', () => {
    personalUnread.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ntf-tab-count')).toBeNull();
    personalUnread.set(4);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.ntf-tab-count');
    expect(badge.textContent).toContain('4');
  });

  it('ngOnDestroy сбрасывает scope через resetScope', () => {
    fixture.destroy();
    expect(resetScope).toHaveBeenCalled();
  });
});
