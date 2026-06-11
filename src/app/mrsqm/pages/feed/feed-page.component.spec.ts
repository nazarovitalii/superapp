import { TestBed } from '@angular/core/testing';
import { FeedPageComponent } from './feed-page.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { FeedFilterService } from '../../services/feed-filter.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';

// Заглушка Supabase: фиксируем параметры вызова get_feed.
class FakeSupabase {
  lastFn: string | null = null;
  lastParams: Record<string, unknown> | null = null;
  response: unknown = { results: [], count_total: 0, limit: 20, offset: 0 };
  shouldThrow = false;

  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    this.lastFn = fn;
    this.lastParams = params ?? null;
    if (this.shouldThrow) throw new Error('rpc fail');
    return this.response as T;
  }
}

class FakePanels {
  selectedProperty = (): null => null;
  openProperty(): void {
    /* noop */
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('FeedPageComponent', () => {
  let fake: FakeSupabase;
  let filter: FeedFilterService;

  const build = (): FeedPageComponent => {
    TestBed.configureTestingModule({
      providers: [
        FeedFilterService,
        { provide: MrsqmSupabaseService, useValue: fake },
        { provide: PanelContentService, useClass: FakePanels },
      ],
    });
    filter = TestBed.inject(FeedFilterService);
    return TestBed.createComponent(FeedPageComponent).componentInstance;
  };

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.resetTestingModule();
  });

  it('вызывает get_feed с dealType и дефолтной пагинацией', async () => {
    build();
    await flush();
    expect(fake.lastFn).toBe('get_feed');
    expect(fake.lastParams?.['p_deal_type']).toBe('sale');
    expect(fake.lastParams?.['p_limit']).toBe(20);
  });

  it('маппит фильтры в параметры RPC (bedrooms как массив, listing, цена, distress)', async () => {
    const c = build();
    await flush();
    filter.dealType.set('rent');
    filter.filters.set({
      propertyType: null,
      bedrooms: 3,
      priceMin: 1000,
      priceMax: 5000,
      listingType: 'pocket',
      distressOnly: true,
    });
    await flush();
    expect(fake.lastParams?.['p_deal_type']).toBe('rent');
    expect(fake.lastParams?.['p_bedrooms']).toEqual([3]);
    expect(fake.lastParams?.['p_price_min']).toBe(1000);
    expect(fake.lastParams?.['p_price_max']).toBe(5000);
    expect(fake.lastParams?.['p_listing_type']).toBe('pocket');
    expect(fake.lastParams?.['p_is_distress']).toBe(true);
    expect(c.properties().length).toBe(0);
  });

  it('listingType=all → p_listing_type null', async () => {
    build();
    await flush();
    filter.filters.update((f) => ({ ...f, listingType: 'all' }));
    await flush();
    expect(fake.lastParams?.['p_listing_type']).toBeNull();
  });

  it('пустой результат — валиден, ошибки нет', async () => {
    const c = build();
    await flush();
    expect(c.properties().length).toBe(0);
    expect(c.loadError()).toBe(false);
  });

  it('ошибка RPC выставляет loadError, моками не подменяет', async () => {
    fake.shouldThrow = true;
    const c = build();
    await flush();
    expect(c.loadError()).toBe(true);
    expect(c.properties().length).toBe(0);
  });

  it('hasMore=true когда загружено меньше count_total', async () => {
    fake.response = {
      results: new Array(20).fill(0).map((_, i) => ({ id: `p${i}` })),
      count_total: 50,
      limit: 20,
      offset: 0,
    };
    const c = build();
    await flush();
    expect(c.hasMore()).toBe(true);
    expect(c.countTotal()).toBe(50);
  });
});
