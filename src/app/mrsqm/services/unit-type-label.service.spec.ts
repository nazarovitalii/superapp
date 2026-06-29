import { TestBed } from '@angular/core/testing';
import { UnitTypeLabelService } from './unit-type-label.service';
import { PropertyCreateService } from './property-create.service';

describe('UnitTypeLabelService', () => {
  let svc: UnitTypeLabelService;
  let getFilterOptions: jasmine.Spy;

  beforeEach(() => {
    getFilterOptions = jasmine.createSpy('getFilterOptions').and.resolveTo({
      unit_types: [{ id: 'ut-1', label_en: 'Apartment', value: 'apartment' }],
      sub_types: [{ id: 'st-1', label_en: 'Penthouse', value: 'penthouse' }],
    });
    TestBed.configureTestingModule({
      providers: [
        UnitTypeLabelService,
        { provide: PropertyCreateService, useValue: { getFilterOptions } },
      ],
    });
    svc = TestBed.inject(UnitTypeLabelService);
  });

  it('резолвит unit_type_id → label_en', async () => {
    expect(await svc.getLabel('ut-1')).toBe('Apartment');
  });

  it('sub_type_id приоритетнее unit_type_id', async () => {
    expect(await svc.getLabel('ut-1', 'st-1')).toBe('Penthouse');
  });

  it('неизвестный id → null', async () => {
    expect(await svc.getLabel('nope')).toBeNull();
  });

  it('кэширует — getFilterOptions зовётся один раз на два вызова', async () => {
    await svc.getLabel('ut-1');
    await svc.getLabel('ut-1');
    expect(getFilterOptions).toHaveBeenCalledTimes(1);
  });

  it('параллельные первые вызовы → getFilterOptions зовётся один раз', async () => {
    const p1 = svc.getLabel('ut-1');
    const p2 = svc.getLabel('ut-1');
    await Promise.all([p1, p2]);
    expect(getFilterOptions).toHaveBeenCalledTimes(1);
  });
});
