import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BellDropdownComponent } from './bell-dropdown.component';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { UnitTypeLabelService } from '../../services/unit-type-label.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';

describe('BellDropdownComponent', () => {
  let fixture: ComponentFixture<BellDropdownComponent>;
  let comp: BellDropdownComponent;
  const filters = signal<unknown[]>([]);
  const bell = signal({ bell_unseen: 0, items: [] as unknown[] });
  const status = signal<'idle' | 'loading' | 'ready' | 'error'>('ready');
  const openListing = jasmine.createSpy('openListing');
  const refresh = jasmine.createSpy('refresh').and.resolveTo(undefined);

  beforeEach(async () => {
    refresh.calls.reset();
    filters.set([
      {
        id: 'f1',
        auto_name: 'Marina',
        unseen_count: 3,
        filters: {},
        notification_type: null,
        created_at: '',
      },
    ]);
    bell.set({ bell_unseen: 1, items: [] });
    await TestBed.configureTestingModule({
      imports: [BellDropdownComponent],
      providers: [
        {
          provide: NotifierStoreService,
          useValue: {
            filters,
            bell,
            status,
            openListing,
            refresh,
          },
        },
        {
          provide: UnitTypeLabelService,
          useValue: { getLabel: () => Promise.resolve('Apartment') },
        },
        { provide: PanelContentService, useValue: { openFilterPanel: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BellDropdownComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('строит строки: фильтр с unseen_count>0 виден, имя = auto_name', () => {
    expect(comp.rows().length).toBe(1);
    expect(comp.rows()[0].name).toBe('Marina');
    expect(comp.rows()[0].unseenCount).toBe(3);
  });

  it('фильтр с unseen_count=0 в строки не попадает (гейт)', () => {
    filters.set([
      {
        id: 'f0',
        auto_name: 'Z',
        unseen_count: 0,
        filters: {},
        notification_type: null,
        created_at: '',
      },
    ]);
    fixture.detectChanges();
    expect(comp.rows().length).toBe(0);
  });

  it('пусто (фильтры есть, новых нет) → состояние no-new', () => {
    filters.set([
      {
        id: 'f0',
        auto_name: 'Z',
        unseen_count: 0,
        filters: {},
        notification_type: null,
        created_at: '',
      },
    ]);
    fixture.detectChanges();
    expect(comp.viewState()).toBe('no-new');
  });

  it('нет фильтров → состояние no-filters', () => {
    filters.set([]);
    fixture.detectChanges();
    expect(comp.viewState()).toBe('no-filters');
  });

  it('клик по строке с превью → openListing(propertyId, filterId)', () => {
    bell.set({
      bell_unseen: 1,
      items: [
        {
          property_id: 'p1',
          filter_id: 'f1',
          match_type: 'new',
          matched_at: '2026-06-29T09:00:00Z',
          unseen: true,
          price: 2100000,
          previous_price: null,
          price_currency: 'AED',
          deal_type: 'sale',
          bedrooms: 2,
          unit_type_id: 'ut1',
          location_label: 'Marina',
          community_label: null,
          thumb_url: null,
        },
      ],
    });
    fixture.detectChanges();
    comp.onRowClick(comp.rows()[0]);
    expect(openListing).toHaveBeenCalledWith('p1', 'f1', jasmine.anything());
  });

  it('onRetry() → store.refresh()', () => {
    comp.onRetry();
    expect(refresh).toHaveBeenCalled();
  });
});
