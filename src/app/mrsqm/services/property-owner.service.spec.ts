import { TestBed } from '@angular/core/testing';
import { PropertyOwnerService } from './property-owner.service';
import { MrsqmSupabaseService } from './supabase.service';

class FakeSupabase {
  calls: { fn: string; params?: Record<string, unknown> }[] = [];
  shouldReject = false;

  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    this.calls.push({ fn, params });
    if (this.shouldReject) throw new Error('rpc error');
    return true as T;
  }
}

describe('PropertyOwnerService', () => {
  let fake: FakeSupabase;
  let svc: PropertyOwnerService;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [
        PropertyOwnerService,
        { provide: MrsqmSupabaseService, useValue: fake },
      ],
    });
    svc = TestBed.inject(PropertyOwnerService);
  });

  it('updateProperty шлёт цену и описание', async () => {
    await svc.updateProperty('p1', 500000, 'desc');
    expect(fake.calls[0]).toEqual({
      fn: 'update_property',
      params: { p_property_id: 'p1', p_price: 500000, p_description: 'desc' },
    });
  });

  it('actualizeProperty шлёт id объекта', async () => {
    await svc.actualizeProperty('p1');
    expect(fake.calls[0]).toEqual({
      fn: 'actualize_property',
      params: { p_property_id: 'p1' },
    });
  });

  it('archiveProperty шлёт статус', async () => {
    await svc.archiveProperty('p1', 'archived_sold');
    expect(fake.calls[0]).toEqual({
      fn: 'archive_property',
      params: { p_property_id: 'p1', p_status: 'archived_sold' },
    });
  });

  // Тесты W-7: changedTick бампается после успешного RPC, НЕ бампается при reject.

  it('changedTick увеличивается после успешной актуализации', async () => {
    const before = svc.changedTick();
    await svc.actualizeProperty('p2');
    expect(svc.changedTick()).toBe(before + 1);
  });

  it('changedTick НЕ увеличивается при ошибке актуализации', async () => {
    fake.shouldReject = true;
    const before = svc.changedTick();
    await expectAsync(svc.actualizeProperty('p2')).toBeRejected();
    expect(svc.changedTick()).toBe(before);
  });

  it('changedTick увеличивается после успешной архивации', async () => {
    const before = svc.changedTick();
    await svc.archiveProperty('p3', 'archived_withdrawn');
    expect(svc.changedTick()).toBe(before + 1);
  });

  it('changedTick НЕ увеличивается при ошибке архивации', async () => {
    fake.shouldReject = true;
    const before = svc.changedTick();
    await expectAsync(svc.archiveProperty('p3', 'archived_withdrawn')).toBeRejected();
    expect(svc.changedTick()).toBe(before);
  });

  it('changedTick увеличивается после успешного редактирования', async () => {
    const before = svc.changedTick();
    await svc.updateProperty('p4', 100000, null);
    expect(svc.changedTick()).toBe(before + 1);
  });
});
