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
  public_location_id: null,
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
  is_maid: false,
  is_hotel_pool: false,
  area_sqft: 1200,
  area_sqm: 111.48,
  plot_sqft: null,
  plot_sqm: null,
  floor_number: null,
  floor_level_id: null,
  floors_in_unit: null,
  layout_id: null,
  view_ids: null,
  position_ids: null,
  amenity_ids: null,
  furnished: 'unfurnished',
  handover: 'ready',
  occupancy_status: 'vacant',
  lease_until: null,
  developer_id: null,
  completion_year: null,
  completion_q: null,
  is_distress: false,
  is_negotiable: false,
  title_deed_number: null,
  title_deed_year: null,
  plot_number: null,
  municipality_number: null,
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

  it('searchLocations прокидывает results из RPC с дефолтным limit=8', async () => {
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

  // AP-2: limit прокидывается в RPC
  it('searchLocations(query, 50) передаёт p_limit: 50 в RPC (AP-2)', async () => {
    fake.rpcResult = { results: [] };
    await svc.searchLocations('golf vista', 50);
    expect(fake.rpcCalls[0].params).toEqual({
      p_mode: 'search',
      p_query: 'golf vista',
      p_limit: 50,
    });
  });

  // AP-5: searchDevelopers
  it('searchDevelopers возвращает [] при запросе короче 2 символов без вызова RPC', async () => {
    const res = await svc.searchDevelopers('e');
    expect(res).toEqual([]);
    expect(fake.rpcCalls.length).toBe(0);
  });

  it('searchDevelopers вызывает RPC search_developers с p_query', async () => {
    fake.rpcResult = { results: [{ id: 'd1', name: 'Emaar', logo_url: null }] };
    const res = await svc.searchDevelopers('Emaar');
    expect(res.length).toBe(1);
    expect(fake.rpcCalls[0].fn).toBe('search_developers');
    expect(fake.rpcCalls[0].params).toEqual({ p_query: 'Emaar' });
  });

  it('searchDevelopers возвращает [] если results отсутствует в ответе RPC', async () => {
    fake.rpcResult = {};
    const res = await svc.searchDevelopers('Damac');
    expect(res).toEqual([]);
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
