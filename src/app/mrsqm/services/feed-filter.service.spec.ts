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
