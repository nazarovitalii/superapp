import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BellButtonComponent } from './bell-button.component';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { NotificationsService } from '../../services/notifications.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { UnitTypeLabelService } from '../../services/unit-type-label.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';

describe('BellButtonComponent', () => {
  let fixture: ComponentFixture<BellButtonComponent>;
  let comp: BellButtonComponent;
  const unreadCount = signal(0);
  const openRequested = signal(0);
  const markAllRead = jasmine.createSpy('markAllRead').and.resolveTo(undefined);

  beforeEach(async () => {
    unreadCount.set(0);
    await TestBed.configureTestingModule({
      imports: [BellButtonComponent],
      providers: [
        {
          provide: NotifierStoreService,
          useValue: {
            openRequested,
            // BellDropdownComponent также инжектит store (filters, bell, status, refresh)
            filters: signal([]),
            bell: signal({ bell_unseen: 0, items: [] }),
            status: signal('ready'),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            unreadCount,
            markAllRead,
            // BellDropdownComponent использует items/previewItems/status/nextCursor
            items: signal([]),
            previewItems: signal([]),
            status: signal('ready'),
            nextCursor: signal(null),
            loadFirst: () => Promise.resolve(),
            loadMore: () => Promise.resolve(),
          },
        },
        { provide: MrsqmAuthService, useValue: { isAuthenticated: () => true } },
        // BellDropdownComponent инжектит UnitTypeLabelService и PanelContentService транзитивно
        {
          provide: UnitTypeLabelService,
          useValue: { getLabel: () => Promise.resolve(null) },
        },
        {
          provide: PanelContentService,
          useValue: { openFilterPanel: () => {}, openProperty: () => {} },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BellButtonComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('unreadCount=0 → бейджа нет', () => {
    expect(comp.badgeText()).toBeNull();
  });

  it('unreadCount=5 → оранжево + бейдж «5»', () => {
    unreadCount.set(5);
    fixture.detectChanges();
    expect(comp.badgeText()).toBe('5');
  });

  it('unreadCount=150 → «99+»', () => {
    unreadCount.set(150);
    fixture.detectChanges();
    expect(comp.badgeText()).toBe('99+');
  });

  it('закрытие дропдауна → notifications.markAllRead()', () => {
    comp.openDropdown();
    comp.onClosed();
    expect(markAllRead).toHaveBeenCalled();
    expect(comp.isOpen()).toBe(false);
  });

  it('ненулевой openRequested на маунте НЕ авто-открывает; последующий бамп открывает', () => {
    // JSDOM не реализует HTMLDialogElement.showModal — мокаем, чтобы эффект bell-dropdown не падал.
    const showModalSpy = spyOn(HTMLDialogElement.prototype, 'showModal').and.stub();
    spyOn(HTMLDialogElement.prototype, 'close').and.stub();

    openRequested.set(5);
    const fx = TestBed.createComponent(BellButtonComponent);
    fx.detectChanges();
    TestBed.flushEffects();
    expect(fx.componentInstance.isOpen()).toBe(false);
    openRequested.set(6);
    fx.detectChanges();
    TestBed.flushEffects();
    expect(fx.componentInstance.isOpen()).toBe(true);
    // Также проверяем, что дропдаун получил команду открыться.
    expect(showModalSpy).toHaveBeenCalled();
    // Сбрасываем для изоляции следующих тестов
    openRequested.set(0);
  });
});
