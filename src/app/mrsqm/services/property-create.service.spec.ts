import { TestBed } from '@angular/core/testing';
import { PropertyCreateService } from './property-create.service';
import { MrsqmSupabaseService } from './supabase.service';
import { PropertyInsert } from '../types/database';

// Заглушка Supabase: подменяем rpc() и from('properties').insert().
class FakeSupabase {
  rpcCalls: { fn: string; params?: Record<string, unknown> }[] = [];
  rpcResult: unknown = {};
  insertPayload: unknown = null;
  insertResult: { data: { id: string } | null; error: unknown } = {
    data: { id: 'new-id' },
    error: null,
  };

  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    this.rpcCalls.push({ fn, params });
    return this.rpcResult as T;
  }

  client = {
    from: () => ({
      insert: (payload: unknown) => {
        this.insertPayload = payload;
        return {
          select: () => ({
            single: async () => this.insertResult,
          }),
        };
      },
    }),
  };
}

const samplePayload = (): PropertyInsert => ({
  owner_id: 'u1',
  location_id: 'loc1',
  category_id: 'cat1',
  unit_type_id: 'ut1',
  sub_type_id: null,
  deal_type: 'sale',
  listing_type: 'pocket',
  price: 1000000,
  price_currency: 'AED',
  price_period: null,
  bedrooms: 2,
  bathrooms: 2,
  area_sqft: 1200,
  area_sqm: 111.48,
  furnished: 'no',
  handover: 'ready',
  occupancy_status: 'vacant',
  is_distress: false,
  is_negotiable: false,
  visibility: 'public',
  status: 'pending_review',
  description: null,
});

describe('PropertyCreateService', () => {
  let fake: FakeSupabase;
  let svc: PropertyCreateService;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [
        PropertyCreateService,
        { provide: MrsqmSupabaseService, useValue: fake },
      ],
    });
    svc = TestBed.inject(PropertyCreateService);
  });

  it('searchLocations возвращает [] при запросе короче 2 символов без вызова RPC', async () => {
    const res = await svc.searchLocations('a');
    expect(res).toEqual([]);
    expect(fake.rpcCalls.length).toBe(0);
  });

  it('searchLocations прокидывает results из RPC', async () => {
    fake.rpcResult = { results: [{ id: 'l1', name: 'Marina' }] };
    const res = await svc.searchLocations('marina');
    expect(res.length).toBe(1);
    expect(fake.rpcCalls[0].fn).toBe('search_locations');
    expect(fake.rpcCalls[0].params).toEqual({
      p_mode: 'search',
      p_query: 'marina',
      p_limit: 8,
    });
  });

  it('getFilterOptions кэширует результат (один вызов RPC)', async () => {
    fake.rpcResult = { categories: [] };
    await svc.getFilterOptions();
    await svc.getFilterOptions();
    expect(fake.rpcCalls.filter((c) => c.fn === 'get_filter_options').length).toBe(1);
  });

  it('createProperty вставляет payload и возвращает id', async () => {
    const id = await svc.createProperty(samplePayload());
    expect(id).toBe('new-id');
    expect((fake.insertPayload as PropertyInsert).location_id).toBe('loc1');
  });

  it('createProperty кидает ошибку при error от Supabase', async () => {
    fake.insertResult = { data: null, error: { message: 'rls denied' } };
    await expectAsync(svc.createProperty(samplePayload())).toBeRejected();
  });
});
