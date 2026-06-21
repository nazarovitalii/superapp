import { TestBed } from '@angular/core/testing';
import { FeedFilterPanelComponent, FloorChip } from './feed-filter-panel.component';
import { FeedFilterService } from '../../services/feed-filter.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { DeveloperSearchItem, FilterOptions } from '../../types/database';

// Минимальный мок FilterOptions для тестов этажей.
const MOCK_OPTIONS: FilterOptions = {
  categories: [],
  unit_types: [
    { id: 'ut1', value: 'apartment', label_en: 'Apartment', parent_id: null },
    { id: 'ut2', value: 'house', label_en: 'House', parent_id: null },
  ],
  sub_types: [],
  deal_types: [],
  listing_types: [],
  furnished_options: [],
  handover_options: [],
  occupancy_options: [],
  price_periods: [],
  bedrooms: [],
  bathrooms: [],
  views: [],
  positions: [],
  amenities: [],
  floor_levels: [{ id: 'L1', value: 'low', label_en: 'Low' }],
  floors_in_unit_apt: [{ id: 'A1', value: 'duplex', label_en: 'Duplex' }],
  floors_in_unit_house: [{ id: 'H1', value: 'g0', label_en: 'G+0' }],
  completion_quarters: [],
};

describe('FeedFilterPanelComponent — floorChips + toggleFloorChip', () => {
  let component: FeedFilterPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedFilterPanelComponent],
      providers: [
        {
          provide: PropertyCreateService,
          useValue: { getFilterOptions: () => Promise.resolve(MOCK_OPTIONS) },
        },
        FeedFilterService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeedFilterPanelComponent);
    component = fixture.componentInstance;
    // Устанавливаем опции синхронно — не ждём async _loadOptions.
    component.options.set(MOCK_OPTIONS);
  });

  it('тип не выбран → floorChips содержит group level И group units', () => {
    // unitTypeId = null по умолчанию
    const chips = component.floorChips();
    expect(chips.some((c) => c.group === 'level')).toBeTrue();
    expect(chips.some((c) => c.group === 'units')).toBeTrue();
  });

  it('тип не выбран → floor_levels попадают как level, floors_in_unit_apt и floors_in_unit_house как units', () => {
    const chips = component.floorChips();
    const levelChips = chips.filter((c) => c.group === 'level');
    const unitChips = chips.filter((c) => c.group === 'units');
    // floor_levels = [L1]
    expect(levelChips.map((c) => c.id)).toContain('L1');
    // floors_in_unit_apt = [A1], floors_in_unit_house = [H1]
    expect(unitChips.map((c) => c.id)).toContain('A1');
    expect(unitChips.map((c) => c.id)).toContain('H1');
  });

  it('выбран apartment → floorChips только group level (floorLevel=true, floorsInUnit=false)', () => {
    component.setUnitType('ut1'); // apartment
    const chips = component.floorChips();
    expect(chips.every((c) => c.group === 'level')).toBeTrue();
    expect(chips.some((c) => c.group === 'units')).toBeFalse();
  });

  it('выбран house → floorChips только group units (floorLevel=false, floorsInUnit=true)', () => {
    component.setUnitType('ut2'); // house
    const chips = component.floorChips();
    expect(chips.every((c) => c.group === 'units')).toBeTrue();
    expect(chips.some((c) => c.group === 'level')).toBeFalse();
  });

  it('toggleFloorChip group units → пишет id в floorsInUnitIds, НЕ в floorLevelIds', () => {
    const chip: FloorChip = { id: 'H1', label: 'G+0', group: 'units' };
    component.toggleFloorChip(chip);
    expect(component.draft().floorsInUnitIds).toContain('H1');
    expect(component.draft().floorLevelIds).not.toContain('H1');
  });

  it('toggleFloorChip group level → пишет id в floorLevelIds, НЕ в floorsInUnitIds', () => {
    const chip: FloorChip = { id: 'L1', label: 'Low', group: 'level' };
    component.toggleFloorChip(chip);
    expect(component.draft().floorLevelIds).toContain('L1');
    expect(component.draft().floorsInUnitIds).not.toContain('L1');
  });

  it('повторный toggleFloorChip снимает выбор', () => {
    const chip: FloorChip = { id: 'L1', label: 'Low', group: 'level' };
    component.toggleFloorChip(chip);
    expect(component.draft().floorLevelIds).toContain('L1');
    component.toggleFloorChip(chip);
    expect(component.draft().floorLevelIds).not.toContain('L1');
  });

  it('options() = null → floorChips() возвращает пустой массив, не бросает ошибку', () => {
    component.options.set(null);
    expect(() => component.floorChips()).not.toThrow();
    expect(component.floorChips()).toEqual([]);
  });
});

// ─── Застройщик: автокомплит мультиселект ────────────────────────────────────
describe('FeedFilterPanelComponent — developer autocomplete', () => {
  let component: FeedFilterPanelComponent;
  let searchDevelopersSpy: jasmine.Spy;

  const MOCK_DEV: DeveloperSearchItem = { id: 'd1', name: 'Emaar', logo_url: null };
  const MOCK_DEV2: DeveloperSearchItem = { id: 'd2', name: 'Damac', logo_url: null };

  beforeEach(async () => {
    searchDevelopersSpy = jasmine
      .createSpy('searchDevelopers')
      .and.returnValue(Promise.resolve([MOCK_DEV, MOCK_DEV2]));

    await TestBed.configureTestingModule({
      imports: [FeedFilterPanelComponent],
      providers: [
        {
          provide: PropertyCreateService,
          useValue: {
            getFilterOptions: () => Promise.resolve(MOCK_OPTIONS),
            searchDevelopers: searchDevelopersSpy,
          },
        },
        FeedFilterService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeedFilterPanelComponent);
    component = fixture.componentInstance;
    component.options.set(MOCK_OPTIONS);
  });

  it('addDeveloper → draft().developerIds содержит id, pickedDevelopers содержит элемент', () => {
    component.addDeveloper(MOCK_DEV);
    expect(component.draft().developerIds).toContain('d1');
    expect(component.pickedDevelopers().some((d) => d.id === 'd1')).toBeTrue();
  });

  it('повторный addDeveloper с тем же id → без дублей', () => {
    component.addDeveloper(MOCK_DEV);
    component.addDeveloper(MOCK_DEV);
    expect(component.draft().developerIds.filter((v) => v === 'd1').length).toBe(1);
    expect(component.pickedDevelopers().filter((d) => d.id === 'd1').length).toBe(1);
  });

  it('removeDeveloper → id убран из developerIds и pickedDevelopers', () => {
    component.addDeveloper(MOCK_DEV);
    component.removeDeveloper('d1');
    expect(component.draft().developerIds).not.toContain('d1');
    expect(component.pickedDevelopers().some((d) => d.id === 'd1')).toBeFalse();
  });

  it('onDeveloperQuery с 1 символом → developerResults пуст, RPC не вызывался', async () => {
    await component.onDeveloperQuery('e');
    expect(searchDevelopersSpy).not.toHaveBeenCalled();
    expect(component.developerResults()).toEqual([]);
  });

  it('onDeveloperQuery с ≥2 символами → developerResults = результат мока', async () => {
    await component.onDeveloperQuery('Emaar');
    expect(searchDevelopersSpy).toHaveBeenCalledWith('Emaar');
    expect(component.developerResults()).toEqual([MOCK_DEV, MOCK_DEV2]);
  });

  it('reset() → очищает developerQuery, developerResults, pickedDevelopers', () => {
    component.addDeveloper(MOCK_DEV);
    component.reset();
    expect(component.developerQuery()).toBe('');
    expect(component.developerResults()).toEqual([]);
    expect(component.pickedDevelopers()).toEqual([]);
    expect(component.draft().developerIds).toEqual([]);
  });
});

// ─── toggleOccupancy — мультиселект ──────────────────────────────────────────
describe('FeedFilterPanelComponent — toggleOccupancy', () => {
  let component: FeedFilterPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedFilterPanelComponent],
      providers: [
        {
          provide: PropertyCreateService,
          useValue: { getFilterOptions: () => Promise.resolve(MOCK_OPTIONS) },
        },
        FeedFilterService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeedFilterPanelComponent);
    component = fixture.componentInstance;
    component.options.set(MOCK_OPTIONS);
  });

  it('toggleOccupancy добавляет значение в массив', () => {
    component.toggleOccupancy('vacant');
    expect(component.draft().occupancyStatus).toEqual(['vacant']);
  });

  it('toggleOccupancy добавляет два разных значения', () => {
    component.toggleOccupancy('vacant');
    component.toggleOccupancy('occupied');
    expect(component.draft().occupancyStatus).toEqual(['vacant', 'occupied']);
  });

  it('повторный toggleOccupancy убирает значение', () => {
    component.toggleOccupancy('vacant');
    component.toggleOccupancy('occupied');
    component.toggleOccupancy('vacant');
    expect(component.draft().occupancyStatus).toEqual(['occupied']);
  });
});

// ─── positionChips — карта позиций по типу ───────────────────────────────────
describe('FeedFilterPanelComponent — positionChips', () => {
  let component: FeedFilterPanelComponent;

  // Мок с полными позициями для тестов positionChips.
  const MOCK_OPTIONS_POS: FilterOptions = {
    ...MOCK_OPTIONS,
    unit_types: [
      { id: 'ut-apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      {
        id: 'ut-hotel',
        value: 'hotel_apartment',
        label_en: 'Hotel Apartment',
        parent_id: null,
      },
      { id: 'ut-office', value: 'office', label_en: 'Office', parent_id: null },
      { id: 'ut-house', value: 'house', label_en: 'House', parent_id: null },
    ],
    positions: [
      { id: 'pos-bb', value: 'back_to_back', label_en: 'Back to Back' },
      { id: 'pos-sr', value: 'single_row', label_en: 'Single Row' },
      { id: 'pos-co', value: 'corner', label_en: 'Corner' },
      { id: 'pos-mi', value: 'middle', label_en: 'Middle' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedFilterPanelComponent],
      providers: [
        {
          provide: PropertyCreateService,
          useValue: { getFilterOptions: () => Promise.resolve(MOCK_OPTIONS_POS) },
        },
        FeedFilterService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeedFilterPanelComponent);
    component = fixture.componentInstance;
    component.options.set(MOCK_OPTIONS_POS);
  });

  it('тип не выбран → positionChips содержит все 4 позиции', () => {
    const chips = component.positionChips();
    expect(chips.length).toBe(4);
    const values = chips.map((c) => c.value);
    expect(values).toContain('back_to_back');
    expect(values).toContain('single_row');
    expect(values).toContain('corner');
    expect(values).toContain('middle');
  });

  it('apartment → positionChips НЕ содержит back_to_back и single_row', () => {
    component.setUnitType('ut-apt');
    const chips = component.positionChips();
    const values = chips.map((c) => c.value);
    expect(values).not.toContain('back_to_back');
    expect(values).not.toContain('single_row');
    expect(values).toContain('corner');
    expect(values).toContain('middle');
  });

  it('hotel_apartment → positionChips НЕ содержит back_to_back и single_row', () => {
    component.setUnitType('ut-hotel');
    const chips = component.positionChips();
    const values = chips.map((c) => c.value);
    expect(values).not.toContain('back_to_back');
    expect(values).not.toContain('single_row');
  });

  it('office → positionChips только corner + middle', () => {
    component.setUnitType('ut-office');
    const chips = component.positionChips();
    expect(chips.length).toBe(2);
    const values = chips.map((c) => c.value);
    expect(values).toContain('corner');
    expect(values).toContain('middle');
  });

  it('house → positionChips содержит все 4 позиции', () => {
    component.setUnitType('ut-house');
    const chips = component.positionChips();
    expect(chips.length).toBe(4);
    const values = chips.map((c) => c.value);
    expect(values).toContain('back_to_back');
    expect(values).toContain('single_row');
  });

  it('options() = null → positionChips() возвращает пустой массив', () => {
    component.options.set(null);
    expect(component.positionChips()).toEqual([]);
  });
});

// ─── FE-3: Каскад типа — живой (категория → unit_type → подтип) ──────────────
describe('FeedFilterPanelComponent — каскад типа (FE-3)', () => {
  let component: FeedFilterPanelComponent;
  let filterService: FeedFilterService;

  // Расширенный мок с категориями и подтипами.
  const MOCK_OPTIONS_CASCADE: FilterOptions = {
    ...MOCK_OPTIONS,
    categories: [
      { id: 'cat-res', value: 'residential', label_en: 'Residential', parent_id: null },
      { id: 'cat-com', value: 'commercial', label_en: 'Commercial', parent_id: null },
    ],
    unit_types: [
      { id: 'ut-apt', value: 'apartment', label_en: 'Apartment', parent_id: 'cat-res' },
      { id: 'ut-off', value: 'office', label_en: 'Office', parent_id: 'cat-com' },
    ],
    sub_types: [
      { id: 'st-s1', value: 'studio', label_en: 'Studio', parent_id: 'ut-apt' },
      { id: 'st-s2', value: '1br', label_en: '1BR', parent_id: 'ut-apt' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedFilterPanelComponent],
      providers: [
        {
          provide: PropertyCreateService,
          useValue: { getFilterOptions: () => Promise.resolve(MOCK_OPTIONS_CASCADE) },
        },
        FeedFilterService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeedFilterPanelComponent);
    component = fixture.componentInstance;
    filterService = TestBed.inject(FeedFilterService);
    component.options.set(MOCK_OPTIONS_CASCADE);
  });

  it('клик категории Residential → category() === "residential"', () => {
    filterService.selectCategoryAll('residential');
    expect(filterService.category()).toBe('residential');
  });

  it('selectCategoryAll чистит unitTypeId и subTypeIds', () => {
    filterService.selectUnitType('residential', 'ut-apt');
    filterService.toggleSubType('st-s1');
    filterService.selectCategoryAll('residential');
    expect(filterService.filters().unitTypeId).toBeNull();
    expect(filterService.filters().subTypeIds).toEqual([]);
  });

  it('clearType → category() = null, unitTypeId = null, subTypeIds = []', () => {
    filterService.selectUnitType('residential', 'ut-apt');
    filterService.toggleSubType('st-s1');
    filterService.clearType();
    expect(filterService.category()).toBeNull();
    expect(filterService.filters().unitTypeId).toBeNull();
    expect(filterService.filters().subTypeIds).toEqual([]);
  });

  it('клик unit_type → filters().unitTypeId === выбранный id', () => {
    filterService.selectCategoryAll('residential');
    filterService.selectUnitType('residential', 'ut-apt');
    expect(filterService.filters().unitTypeId).toBe('ut-apt');
  });

  it('selectUnitType чистит subTypeIds', () => {
    filterService.selectUnitType('residential', 'ut-apt');
    filterService.toggleSubType('st-s1');
    filterService.selectUnitType('residential', 'ut-apt');
    // Повторный selectUnitType чистит подтипы
    expect(filterService.filters().subTypeIds).toEqual([]);
  });

  it('toggleSubType добавляет id в filters().subTypeIds', () => {
    filterService.selectUnitType('residential', 'ut-apt');
    filterService.toggleSubType('st-s1');
    expect(filterService.filters().subTypeIds).toContain('st-s1');
  });

  it('повторный toggleSubType убирает id из filters().subTypeIds', () => {
    filterService.selectUnitType('residential', 'ut-apt');
    filterService.toggleSubType('st-s1');
    filterService.toggleSubType('st-s1');
    expect(filterService.filters().subTypeIds).toEqual([]);
  });

  it('subTypes() реагирует на живой filters().unitTypeId', () => {
    // До выбора — подтипов нет.
    expect(component.subTypes()).toEqual([]);
    filterService.selectUnitType('residential', 'ut-apt');
    // После выбора apartment — подтипы Studio и 1BR.
    expect(component.subTypes().length).toBe(2);
    expect(component.subTypes().map((s) => s.id)).toContain('st-s1');
  });

  it('floorChips реагируют на живой filters().unitTypeId', () => {
    // Опции с unit_type apartment и этажными справочниками.
    const OPTS_FLOOR: FilterOptions = {
      ...MOCK_OPTIONS_CASCADE,
      floor_levels: [{ id: 'L1', value: 'low', label_en: 'Low' }],
      floors_in_unit_apt: [{ id: 'A1', value: 'duplex', label_en: 'Duplex' }],
      floors_in_unit_house: [],
    };
    component.options.set(OPTS_FLOOR);
    // До выбора типа: union всех — level + units.
    expect(component.floorChips().some((c) => c.group === 'units')).toBeTrue();
    // Выбираем apartment (ut-apt) через сервис — floorChips только level.
    filterService.patch({ unitTypeId: 'ut-apt' });
    const chips = component.floorChips();
    // apartment: floorLevel=true, floorsInUnit=false → только group level.
    expect(chips.every((c) => c.group === 'level')).toBeTrue();
    expect(chips.some((c) => c.group === 'units')).toBeFalse();
  });

  it('positionChips реагируют на живой filters().unitTypeId', () => {
    const OPTS_POS: FilterOptions = {
      ...MOCK_OPTIONS_CASCADE,
      unit_types: [
        {
          id: 'ut-apt2',
          value: 'apartment',
          label_en: 'Apartment',
          parent_id: 'cat-res',
        },
      ],
      positions: [
        { id: 'p-bb', value: 'back_to_back', label_en: 'Back to Back' },
        { id: 'p-co', value: 'corner', label_en: 'Corner' },
        { id: 'p-mi', value: 'middle', label_en: 'Middle' },
      ],
    };
    component.options.set(OPTS_POS);
    // Сначала без типа — 3 позиции.
    expect(component.positionChips().length).toBe(3);
    // После выбора apartment через сервис — только corner + middle.
    filterService.patch({ unitTypeId: 'ut-apt2' });
    expect(component.positionChips().length).toBe(2);
    expect(component.positionChips().map((c) => c.value)).not.toContain('back_to_back');
  });

  it('apply() не затирает живой unitTypeId значением из draft', () => {
    // Устанавливаем тип живым способом (через сервис).
    filterService.selectUnitType('residential', 'ut-apt');
    expect(filterService.filters().unitTypeId).toBe('ut-apt');
    // draft().unitTypeId по-прежнему null (был инициализирован ДО выбора).
    // apply() должен сохранить живой unitTypeId.
    component.apply();
    expect(filterService.filters().unitTypeId).toBe('ut-apt');
  });

  it('после apply() живой subTypeIds сохраняется', () => {
    filterService.selectUnitType('residential', 'ut-apt');
    filterService.toggleSubType('st-s1');
    component.apply();
    expect(filterService.filters().subTypeIds).toContain('st-s1');
  });
});

// ─── Живые контролы: зеркало тулбара (FE-2) ──────────────────────────────────
describe('FeedFilterPanelComponent — живые контролы (FE-2)', () => {
  let component: FeedFilterPanelComponent;
  let filterService: FeedFilterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedFilterPanelComponent],
      providers: [
        {
          provide: PropertyCreateService,
          useValue: { getFilterOptions: () => Promise.resolve(MOCK_OPTIONS) },
        },
        FeedFilterService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FeedFilterPanelComponent);
    component = fixture.componentInstance;
    filterService = TestBed.inject(FeedFilterService);
    component.options.set(MOCK_OPTIONS);
  });

  // ─── Адреса (×) ───────────────────────────────────────────────────────────────
  it('removeLiveLocation вызывает removeLocation сервиса с нужным id', () => {
    const spy = spyOn(filterService, 'removeLocation');
    component.removeLiveLocation('loc-42');
    expect(spy).toHaveBeenCalledWith('loc-42');
  });

  it('removeLiveLocation убирает адрес из locationFilters (общий сигнал)', () => {
    filterService.addLocation({ id: 'loc-1', name: 'Marina' });
    filterService.addLocation({ id: 'loc-2', name: 'JBR' });
    component.removeLiveLocation('loc-1');
    expect(filterService.locationFilters().map((l) => l.id)).toEqual(['loc-2']);
  });

  // ─── Sale / Rent ──────────────────────────────────────────────────────────────
  it('setLiveDealType("sale") вызывает set("sale") сервиса', () => {
    const spy = spyOn(filterService, 'set');
    component.setLiveDealType('sale');
    expect(spy).toHaveBeenCalledWith('sale');
  });

  it('setLiveDealType("rent") вызывает set("rent") сервиса', () => {
    const spy = spyOn(filterService, 'set');
    component.setLiveDealType('rent');
    expect(spy).toHaveBeenCalledWith('rent');
  });

  it('после setLiveDealType("rent") dealType() === "rent"', () => {
    component.setLiveDealType('rent');
    expect(filterService.dealType()).toBe('rent');
  });

  it('после setLiveDealType("sale") dealType() === "sale"', () => {
    filterService.set('rent');
    component.setLiveDealType('sale');
    expect(filterService.dealType()).toBe('sale');
  });

  // ─── Ready / Off-Plan / All ───────────────────────────────────────────────────
  it('setLiveSegment("ready") вызывает setSegment("ready") сервиса', () => {
    const spy = spyOn(filterService, 'setSegment');
    component.setLiveSegment('ready');
    expect(spy).toHaveBeenCalledWith('ready');
  });

  it('setLiveSegment("offplan") вызывает setSegment("offplan") сервиса', () => {
    const spy = spyOn(filterService, 'setSegment');
    component.setLiveSegment('offplan');
    expect(spy).toHaveBeenCalledWith('offplan');
  });

  it('setLiveSegment(null) вызывает setSegment(null) — сброс в All', () => {
    const spy = spyOn(filterService, 'setSegment');
    component.setLiveSegment(null);
    expect(spy).toHaveBeenCalledWith(null);
  });

  it('после setLiveSegment("ready") handover() === "ready"', () => {
    component.setLiveSegment('ready');
    expect(filterService.handover()).toBe('ready');
  });

  it('после setLiveSegment(null) handover() === null (All)', () => {
    filterService.setSegment('offplan');
    component.setLiveSegment(null);
    expect(filterService.handover()).toBeNull();
  });

  // ─── Охват (scope) Public / Friends ──────────────────────────────────────────
  it('setLiveScope("public") устанавливает scope("public")', () => {
    filterService.scope.set('friends');
    component.setLiveScope('public');
    expect(filterService.scope()).toBe('public');
  });

  it('setLiveScope("friends") устанавливает scope("friends")', () => {
    component.setLiveScope('friends');
    expect(filterService.scope()).toBe('friends');
  });
});
