import { TestBed } from '@angular/core/testing';
import { FeedFilterService } from './feed-filter.service';

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
