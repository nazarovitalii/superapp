import { TestBed } from '@angular/core/testing';
import { FeedFilterPanelComponent, FloorChip } from './feed-filter-panel.component';
import { FeedFilterService } from '../../services/feed-filter.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { FilterOptions } from '../../types/database';
import { signal } from '@angular/core';

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
