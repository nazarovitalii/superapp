import { TestBed } from '@angular/core/testing';
import { FeedFilterService, SavedFilterPayload } from './feed-filter.service';

describe('FeedFilterService — методы локаций', () => {
  let service: FeedFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FeedFilterService] });
    service = TestBed.inject(FeedFilterService);
  });

  // ─── addLocation ──────────────────────────────────────────────────────────────

  it('addLocation добавляет локацию в пустой массив', () => {
    service.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    expect(service.locationFilters()).toEqual([{ id: 'loc-1', name: 'Dubai Marina' }]);
  });

  it('addLocation добавляет несколько разных локаций', () => {
    service.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    service.addLocation({ id: 'loc-2', name: 'JBR' });
    expect(service.locationFilters().length).toBe(2);
    expect(service.locationFilters()[1].id).toBe('loc-2');
  });

  it('addLocation игнорирует дубликат по id', () => {
    service.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    service.addLocation({ id: 'loc-1', name: 'Dubai Marina (dup)' });
    expect(service.locationFilters().length).toBe(1);
  });

  it('addLocation не добавляет сверх MAX_LOCATIONS (5)', () => {
    for (let i = 1; i <= 6; i++) {
      service.addLocation({ id: `loc-${i}`, name: `Loc ${i}` });
    }
    expect(service.locationFilters().length).toBe(5);
  });

  it('addLocation не мутирует предыдущий массив (spread)', () => {
    service.addLocation({ id: 'loc-1', name: 'A' });
    const before = service.locationFilters();
    service.addLocation({ id: 'loc-2', name: 'B' });
    // массив before не должен измениться
    expect(before.length).toBe(1);
  });

  // ─── removeLocation ───────────────────────────────────────────────────────────

  it('removeLocation убирает локацию по id', () => {
    service.addLocation({ id: 'loc-1', name: 'A' });
    service.addLocation({ id: 'loc-2', name: 'B' });
    service.removeLocation('loc-1');
    expect(service.locationFilters().length).toBe(1);
    expect(service.locationFilters()[0].id).toBe('loc-2');
  });

  it('removeLocation несуществующего id ничего не меняет', () => {
    service.addLocation({ id: 'loc-1', name: 'A' });
    service.removeLocation('loc-999');
    expect(service.locationFilters().length).toBe(1);
  });

  // ─── clearLocations ───────────────────────────────────────────────────────────

  it('clearLocations очищает массив', () => {
    service.addLocation({ id: 'loc-1', name: 'A' });
    service.addLocation({ id: 'loc-2', name: 'B' });
    service.clearLocations();
    expect(service.locationFilters()).toEqual([]);
  });

  it('clearLocations на пустом массиве не вызывает ошибок', () => {
    expect(() => service.clearLocations()).not.toThrow();
    expect(service.locationFilters()).toEqual([]);
  });
});

describe('FeedFilterService — FeedFilters v2 и activeFilterCount', () => {
  let service: FeedFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FeedFilterService] });
    service = TestBed.inject(FeedFilterService);
  });

  // ─── EMPTY_FILTERS ────────────────────────────────────────────────────────────

  it('EMPTY_FILTERS содержит все новые поля с правильными значениями', () => {
    const f = service.filters();
    // Проверяем существующие поля
    expect(f.unitTypeId).toBe(null);
    expect(f.subTypeIds).toEqual([]);
    expect(f.bedrooms).toEqual([]);
    expect(f.bathrooms).toEqual([]);
    expect(f.priceMin).toBe(null);
    expect(f.priceMax).toBe(null);
    expect(f.areaMin).toBe(null);
    expect(f.areaMax).toBe(null);
    expect(f.furnished).toBe(null);
    expect(f.listingType).toBe('all');
    // Проверяем новые числовые поля
    expect(f.plotMin).toBe(null);
    expect(f.plotMax).toBe(null);
    // Проверяем новые массивы
    expect(f.developerIds).toEqual([]);
    expect(f.viewIds).toEqual([]);
    expect(f.positionIds).toEqual([]);
    expect(f.amenityIds).toEqual([]);
    expect(f.floorLevelIds).toEqual([]);
    expect(f.floorsInUnitIds).toEqual([]);
    expect(f.completionYears).toEqual([]);
    expect(f.completionQ).toEqual([]);
    expect(f.cheques).toEqual([]);
    // Проверяем новые булевы/строковые поля
    expect(f.isMaid).toBe(null);
    expect(f.isHotelPool).toBe(null);
    expect(f.isVastu).toBe(null);
    expect(f.isStudy).toBe(null);
    expect(f.isReduced).toBe(null);
    expect(f.isBelowOp).toBe(null);
    expect(f.pricePeriod).toBe(null);
    expect(f.occupancyStatus).toEqual([]);
  });

  // ─── activeFilterCount ────────────────────────────────────────────────────────

  it('activeFilterCount() возвращает 0 для EMPTY_FILTERS', () => {
    service.reset();
    expect(service.activeFilterCount()).toBe(0);
  });

  it('activeFilterCount() считает +1 за непустой массив (viewIds)', () => {
    service.patch({ viewIds: ['view-1'] });
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() считает plotMin/plotMax как одну группу', () => {
    service.patch({ plotMin: 100, plotMax: 200 });
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() считает plotMin и plotMax отдельно при одном значении', () => {
    service.patch({ plotMin: 100 });
    expect(service.activeFilterCount()).toBe(1);
    service.patch({ plotMax: 200 });
    expect(service.activeFilterCount()).toBe(1); // всё еще 1 — пара считается как 1
  });

  it('activeFilterCount() считает +1 за не-null булево поле (isStudy)', () => {
    service.patch({ isStudy: true });
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() считает +1 за не-null строковое поле (pricePeriod)', () => {
    service.patch({ pricePeriod: 'yearly' });
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() складывает новые группы: isStudy + cheques = 2', () => {
    service.patch({ isStudy: true, cheques: [2] });
    expect(service.activeFilterCount()).toBe(2);
  });

  it('activeFilterCount() складывает существующие и новые: price + viewIds = 2', () => {
    service.patch({ priceMin: 100, priceMax: 200, viewIds: ['x'] });
    expect(service.activeFilterCount()).toBe(2);
  });

  it('activeFilterCount() считает несколько новых массивов отдельно', () => {
    service.patch({
      developerIds: ['dev-1'],
      amenityIds: ['am-1'],
      completionYears: [2025],
    });
    expect(service.activeFilterCount()).toBe(3);
  });

  it('activeFilterCount() считает все новые булевы отдельно', () => {
    service.patch({
      isMaid: true,
      isHotelPool: false, // false тоже не null!
      isVastu: true,
    });
    expect(service.activeFilterCount()).toBe(3);
  });

  it('activeFilterCount() не считает false как активный фильтр… если false не отличается от null', () => {
    // По контракту: boolean | null — false это активное значение, true = активное значение.
    // null = не установлено. Если пользователь выбрал false (например, "NO maid"), это активный фильтр.
    service.patch({ isMaid: false });
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() при реcете обнуляется', () => {
    service.patch({
      viewIds: ['x'],
      isStudy: true,
      plotMin: 100,
    });
    expect(service.activeFilterCount()).toBeGreaterThan(0);
    service.reset();
    expect(service.activeFilterCount()).toBe(0);
  });

  it('activeFilterCount() игнорирует пустые массивы', () => {
    service.patch({
      viewIds: [],
      developerIds: [],
      cheques: [],
    });
    expect(service.activeFilterCount()).toBe(0);
  });

  it('activeFilterCount() игнорирует null значения', () => {
    service.patch({
      isMaid: null,
      isStudy: null,
      pricePeriod: null,
      occupancyStatus: [],
      plotMin: null,
      plotMax: null,
    });
    expect(service.activeFilterCount()).toBe(0);
  });

  // ─── Живые контролы: локации, handover, scope, category ─────────────────────

  it('activeFilterCount() +2 за две добавленные локации', () => {
    service.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    service.addLocation({ id: 'loc-2', name: 'JBR' });
    expect(service.activeFilterCount()).toBe(2);
  });

  it('activeFilterCount() +1 за выбранный handover (ready)', () => {
    service.setHandover('ready');
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() +1 за scope !== "public" (friends)', () => {
    service.scope.set('friends');
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() +1 за выбранную категорию (без типа)', () => {
    service.setCategory('residential');
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() суммирует: 2 локации + handover + scope = 4', () => {
    service.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    service.addLocation({ id: 'loc-2', name: 'JBR' });
    service.setHandover('ready');
    service.scope.set('friends');
    expect(service.activeFilterCount()).toBe(4);
  });

  it('activeFilterCount() не считает dealType (у него всегда есть значение)', () => {
    service.set('rent');
    expect(service.activeFilterCount()).toBe(0);
  });

  it('activeFilterCount() обнуляется после clearLocations + reset + сброса scope/handover', () => {
    service.addLocation({ id: 'loc-1', name: 'A' });
    service.setHandover('offplan');
    service.scope.set('friends');
    service.patch({ viewIds: ['x'] });
    // Сбрасываем всё
    service.clearLocations();
    service.setHandover('ready');
    service.setHandover('ready'); // повторный → null
    service.scope.set('public');
    service.reset();
    expect(service.activeFilterCount()).toBe(0);
  });

  // ─── occupancyStatus — мультиселект ──────────────────────────────────────────

  it('activeFilterCount() считает непустой occupancyStatus как +1', () => {
    service.patch({ occupancyStatus: ['vacant'] });
    expect(service.activeFilterCount()).toBe(1);
  });

  it('activeFilterCount() не считает пустой occupancyStatus', () => {
    service.patch({ occupancyStatus: [] });
    expect(service.activeFilterCount()).toBe(0);
  });
});

describe('FeedFilterService — snapshot / applySnapshot / dirty-трекинг', () => {
  let service: FeedFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FeedFilterService] });
    service = TestBed.inject(FeedFilterService);
  });

  // ─── snapshot ───────────────────────────────────────────────────────────────

  it('snapshot() собирает начальное состояние по умолчанию', () => {
    const snap = service.snapshot();
    expect(snap.dealType).toBe('sale');
    expect(snap.handover).toBeNull();
    expect(snap.scope).toBe('public');
    expect(snap.category).toBeNull();
    expect(snap.locations).toEqual([]);
  });

  it('snapshot() отражает изменения в сигналах', () => {
    service.dealType.set('rent');
    service.setHandover('ready');
    service.scope.set('friends');
    service.setCategory('commercial');
    service.addLocation({ id: 'loc-1', name: 'Marina' });
    const snap = service.snapshot();
    expect(snap.dealType).toBe('rent');
    expect(snap.handover).toBe('ready');
    expect(snap.scope).toBe('friends');
    expect(snap.category).toBe('commercial');
    expect(snap.locations.length).toBe(1);
  });

  // ─── applySnapshot round-trip ───────────────────────────────────────────────

  it('applySnapshot восстанавливает всё состояние из снапшота', () => {
    // Меняем состояние
    service.dealType.set('rent');
    service.setHandover('offplan');
    service.scope.set('my');
    service.setCategory('commercial');
    service.addLocation({ id: 'loc-1', name: 'Marina' });
    service.patch({ priceMin: 500000 });

    const snap = service.snapshot();

    // Сброс к дефолту перед восстановлением
    service.dealType.set('sale');
    service.clearLoaded();
    service.reset();
    service.clearLocations();
    service.scope.set('public');
    service.category.set(null);
    service.handover.set(null);

    // Восстанавливаем
    service.applySnapshot(snap);

    expect(service.dealType()).toBe('rent');
    expect(service.handover()).toBe('offplan');
    expect(service.scope()).toBe('my');
    expect(service.category()).toBe('commercial');
    expect(service.locationFilters().length).toBe(1);
    expect(service.filters().priceMin).toBe(500000);
  });

  it('snapshot→applySnapshot round-trip сохраняет все поля FeedFilters', () => {
    service.patch({
      bedrooms: [2, 3],
      priceMin: 100000,
      developerIds: ['dev-1'],
      isStudy: true,
    });
    service.addLocation({ id: 'loc-2', name: 'JBR' });

    const snap = service.snapshot();
    service.reset();
    service.clearLocations();
    service.applySnapshot(snap);

    const f = service.filters();
    expect(f.bedrooms).toEqual([2, 3]);
    expect(f.priceMin).toBe(100000);
    expect(f.developerIds).toEqual(['dev-1']);
    expect(f.isStudy).toBe(true);
    expect(service.locationFilters()[0].id).toBe('loc-2');
  });

  // ─── markLoaded / isDirtySinceLoad ─────────────────────────────────────────

  it('isDirtySinceLoad() === false до загрузки фильтра', () => {
    expect(service.isDirtySinceLoad()).toBe(false);
  });

  it('после markLoaded isDirtySinceLoad() === false', () => {
    const payload: SavedFilterPayload = service.snapshot();
    service.markLoaded('filter-1', payload);
    expect(service.isDirtySinceLoad()).toBe(false);
  });

  it('isDirtySinceLoad() === true после изменения поля', () => {
    const payload: SavedFilterPayload = service.snapshot();
    service.markLoaded('filter-1', payload);
    // Меняем что-то после загрузки
    service.patch({ priceMin: 999000 });
    expect(service.isDirtySinceLoad()).toBe(true);
  });

  it('isDirtySinceLoad() === true после добавления локации', () => {
    const payload: SavedFilterPayload = service.snapshot();
    service.markLoaded('filter-1', payload);
    service.addLocation({ id: 'loc-99', name: 'Palm' });
    expect(service.isDirtySinceLoad()).toBe(true);
  });

  it('isDirtySinceLoad() === true после смены dealType', () => {
    const payload: SavedFilterPayload = service.snapshot();
    service.markLoaded('filter-1', payload);
    service.dealType.set('rent');
    expect(service.isDirtySinceLoad()).toBe(true);
  });

  it('clearLoaded() обнуляет loadedFilterId и isDirtySinceLoad()', () => {
    const payload: SavedFilterPayload = service.snapshot();
    service.markLoaded('filter-1', payload);
    service.patch({ priceMax: 2000000 });

    service.clearLoaded();

    expect(service.loadedFilterId()).toBeNull();
    expect(service.loadedSnapshotJson()).toBeNull();
    expect(service.isDirtySinceLoad()).toBe(false);
  });

  it('markLoaded восстанавливает состояние и применяет снапшот', () => {
    const payload: SavedFilterPayload = {
      filters: { ...service.filters(), priceMin: 750000 },
      dealType: 'sale',
      handover: 'ready',
      scope: 'public',
      category: 'residential',
      locations: [{ id: 'loc-10', name: 'DIFC' }],
    };
    service.markLoaded('filter-42', payload);
    expect(service.loadedFilterId()).toBe('filter-42');
    expect(service.filters().priceMin).toBe(750000);
    expect(service.handover()).toBe('ready');
    expect(service.category()).toBe('residential');
    expect(service.locationFilters()[0].id).toBe('loc-10');
    expect(service.isDirtySinceLoad()).toBe(false);
  });
});

// ─── resetAll ─────────────────────────────────────────────────────────────────
describe('FeedFilterService — resetAll()', () => {
  let service: FeedFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FeedFilterService] });
    service = TestBed.inject(FeedFilterService);
  });

  it('resetAll: filters пустые после вызова', () => {
    service.patch({ bedrooms: [2, 3], priceMin: 500000, viewIds: ['v1'] });
    service.resetAll();
    const f = service.filters();
    expect(f.bedrooms).toEqual([]);
    expect(f.priceMin).toBeNull();
    expect(f.viewIds).toEqual([]);
  });

  it('resetAll: locations[] пустые', () => {
    service.addLocation({ id: 'loc-1', name: 'Marina' });
    service.addLocation({ id: 'loc-2', name: 'JBR' });
    service.resetAll();
    expect(service.locationFilters()).toEqual([]);
  });

  it('resetAll: handover = null', () => {
    service.setHandover('ready');
    service.resetAll();
    expect(service.handover()).toBeNull();
  });

  it('resetAll: scope = "public"', () => {
    service.scope.set('friends');
    service.resetAll();
    expect(service.scope()).toBe('public');
  });

  it('resetAll: category = null', () => {
    service.setCategory('commercial');
    service.resetAll();
    expect(service.category()).toBeNull();
  });

  it('resetAll: loadedFilterId = null (clearLoaded)', () => {
    const payload: SavedFilterPayload = service.snapshot();
    service.markLoaded('sf-1', payload);
    expect(service.loadedFilterId()).toBe('sf-1');
    service.resetAll();
    expect(service.loadedFilterId()).toBeNull();
  });

  it('resetAll: activeFilterCount() = 0 после полного сброса', () => {
    service.patch({ bedrooms: [2], viewIds: ['v1'] });
    service.addLocation({ id: 'loc-1', name: 'Marina' });
    service.setHandover('offplan');
    service.scope.set('friends');
    service.setCategory('residential');
    service.resetAll();
    expect(service.activeFilterCount()).toBe(0);
  });

  it('resetAll: dealType НЕ трогается', () => {
    service.set('rent');
    service.resetAll();
    expect(service.dealType()).toBe('rent');
  });
});
