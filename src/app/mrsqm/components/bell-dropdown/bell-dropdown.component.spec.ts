import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BellDropdownComponent } from './bell-dropdown.component';
import { NotificationsService } from '../../services/notifications.service';
import { SavedFilterService } from '../../services/saved-filter.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { NotificationItem } from '../../types/notification';

const makeItem = (id: string, entityId: string | null = null): NotificationItem => ({
  id,
  type: 'new_listing',
  created_at: '2026-06-30T10:00:00Z',
  read_at: null,
  entity_id: entityId,
  filter_id: null,
  thumb_url: null,
  data: {},
  source: 'n',
});

describe('BellDropdownComponent', () => {
  let fixture: ComponentFixture<BellDropdownComponent>;
  let comp: BellDropdownComponent;

  const previewItems = signal<NotificationItem[]>([]);
  const status = signal<'idle' | 'loading' | 'ready' | 'error'>('ready');
  const loadFirst = jasmine.createSpy('loadFirst').and.resolveTo(undefined);
  const markAllRead = jasmine.createSpy('markAllRead').and.resolveTo(undefined);
  const openNotifications = jasmine.createSpy('openNotifications');
  const openProperty = jasmine.createSpy('openProperty');

  beforeEach(async () => {
    loadFirst.calls.reset();
    markAllRead.calls.reset();
    openNotifications.calls.reset();
    openProperty.calls.reset();
    previewItems.set([]);
    status.set('ready');

    await TestBed.configureTestingModule({
      imports: [BellDropdownComponent],
      providers: [
        {
          provide: NotificationsService,
          useValue: { previewItems, status, loadFirst, markAllRead },
        },
        {
          provide: SavedFilterService,
          useValue: { list: () => Promise.resolve([]) },
        },
        {
          provide: PanelContentService,
          useValue: { openNotifications, openProperty },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BellDropdownComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('при previewItems из 2 элементов рендерятся 2 mrsqm-notification-row', () => {
    previewItems.set([makeItem('n1'), makeItem('n2')]);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('mrsqm-notification-row');
    expect(rows.length).toBe(2);
  });

  it('пустой список → состояние empty', () => {
    previewItems.set([]);
    status.set('ready');
    fixture.detectChanges();
    expect(comp.viewState()).toBe('empty');
  });

  it('status=loading и пусто → состояние loading', () => {
    previewItems.set([]);
    status.set('loading');
    fixture.detectChanges();
    expect(comp.viewState()).toBe('loading');
  });

  it('status=error → состояние error', () => {
    status.set('error');
    fixture.detectChanges();
    expect(comp.viewState()).toBe('error');
  });

  it('«Все уведомления» зовёт panels.openNotifications()', () => {
    const btn = fixture.nativeElement.querySelector('.bell-viewall') as HTMLButtonElement;
    btn.click();
    expect(openNotifications).toHaveBeenCalled();
  });

  it('«Отметить прочитанными» зовёт store.markAllRead()', () => {
    const btn = fixture.nativeElement.querySelector('.bell-markall') as HTMLButtonElement;
    btn.click();
    expect(markAllRead).toHaveBeenCalled();
  });

  it('ngOnInit зовёт store.loadFirst()', () => {
    expect(loadFirst).toHaveBeenCalled();
  });

  it('onRow() с kind=property открывает объект через openProperty и эмитит closed', () => {
    const closedSpy = jasmine.createSpy('closed');
    comp.closed.subscribe(closedSpy);
    const item = makeItem('n1', 'prop-uuid');
    comp.onRow(item);
    expect(openProperty).toHaveBeenCalled();
    expect(closedSpy).toHaveBeenCalled();
  });

  it('onRow() с kind=none просто эмитит closed без openProperty', () => {
    const closedSpy = jasmine.createSpy('closed');
    comp.closed.subscribe(closedSpy);
    // type=subscription_expiring нет в PROPERTY_TYPES → kind=none
    const item: NotificationItem = {
      ...makeItem('n2'),
      type: 'subscription_expiring',
      entity_id: null,
    };
    comp.onRow(item);
    expect(openProperty).not.toHaveBeenCalled();
    expect(closedSpy).toHaveBeenCalled();
  });
});
