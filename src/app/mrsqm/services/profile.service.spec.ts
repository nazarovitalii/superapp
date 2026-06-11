import { TestBed } from '@angular/core/testing';
import { ProfileService } from './profile.service';
import { MrsqmSupabaseService } from './supabase.service';

// Заглушка Supabase: цепочка from().select()....maybeSingle()/returns().
class FakeSupabase {
  profileData: unknown = { full_name: 'Test Agent' };
  listingsData: unknown = [];
  lastTable: string | null = null;

  client = {
    from: (table: string) => {
      this.lastTable = table;
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: this.profileData, error: null }),
        returns: async () => ({ data: this.listingsData, error: null }),
      };
      return chain;
    },
  };
}

describe('ProfileService', () => {
  let fake: FakeSupabase;
  let svc: ProfileService;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [ProfileService, { provide: MrsqmSupabaseService, useValue: fake }],
    });
    svc = TestBed.inject(ProfileService);
  });

  it('getProfile читает из user_context', async () => {
    const p = await svc.getProfile('u1');
    expect(fake.lastTable).toBe('user_context');
    expect(p?.full_name).toBe('Test Agent');
  });

  it('getMyListings маппит embed-локацию в location_name', async () => {
    fake.listingsData = [
      {
        id: 'p1',
        deal_type: 'sale',
        listing_type: 'pocket',
        status: 'active',
        visibility: 'network',
        price: 1000,
        price_currency: 'AED',
        price_period: null,
        bedrooms: 1,
        area_sqft: 400,
        unit_type_id: 'ut1',
        created_at: '2026-06-11',
        locations: { name: 'Golf Vita A' },
      },
    ];
    const list = await svc.getMyListings('u1');
    expect(fake.lastTable).toBe('properties');
    expect(list.length).toBe(1);
    expect(list[0].location_name).toBe('Golf Vita A');
  });

  it('getMyListings ставит location_name null при отсутствии локации', async () => {
    fake.listingsData = [
      {
        id: 'p2',
        deal_type: 'rent',
        listing_type: 'official',
        status: 'draft',
        visibility: 'public',
        price: 500,
        price_currency: 'AED',
        price_period: 'yearly',
        bedrooms: null,
        area_sqft: null,
        unit_type_id: null,
        created_at: '2026-06-11',
        locations: null,
      },
    ];
    const list = await svc.getMyListings('u1');
    expect(list[0].location_name).toBeNull();
  });
});
