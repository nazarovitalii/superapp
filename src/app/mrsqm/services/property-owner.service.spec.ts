import { TestBed } from '@angular/core/testing';
import { PropertyOwnerService } from './property-owner.service';
import { MrsqmSupabaseService } from './supabase.service';

class FakeSupabase {
  calls: { fn: string; params?: Record<string, unknown> }[] = [];
  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    this.calls.push({ fn, params });
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
});
