import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BellButtonComponent } from './bell-button.component';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { UnitTypeLabelService } from '../../services/unit-type-label.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';

describe('BellButtonComponent', () => {
  let fixture: ComponentFixture<BellButtonComponent>;
  let comp: BellButtonComponent;
  const bellUnseen = signal(0);
  const openRequested = signal(0);
  const closeBell = jasmine.createSpy('closeBell').and.resolveTo(undefined);

  beforeEach(async () => {
    bellUnseen.set(0);
    await TestBed.configureTestingModule({
      imports: [BellButtonComponent],
      providers: [
        {
          provide: NotifierStoreService,
          useValue: {
            bellUnseen,
            openRequested,
            closeBell,
            // BellDropdownComponent также инжектит store (filters, bell, status, openListing, refresh)
            filters: signal([]),
            bell: signal({ bell_unseen: 0, items: [] }),
            status: signal('ready'),
            openListing: () => {},
            refresh: () => Promise.resolve(),
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

  it('bellUnseen=0 → бейджа нет', () => {
    expect(comp.badgeText()).toBeNull();
  });

  it('bellUnseen=5 → оранжево + бейдж «5»', () => {
    bellUnseen.set(5);
    fixture.detectChanges();
    expect(comp.badgeText()).toBe('5');
  });

  it('bellUnseen=150 → «99+»', () => {
    bellUnseen.set(150);
    fixture.detectChanges();
    expect(comp.badgeText()).toBe('99+');
  });

  it('закрытие дропдауна → store.closeBell()', () => {
    comp.openDropdown();
    comp.onClosed();
    expect(closeBell).toHaveBeenCalled();
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
