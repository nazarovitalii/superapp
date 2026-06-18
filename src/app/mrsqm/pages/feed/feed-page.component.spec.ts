import { TestBed } from '@angular/core/testing';
import { FeedPageComponent } from './feed-page.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { FeedFilterService } from '../../services/feed-filter.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { FilterOptions, PropertyFeedItem } from '../../types/database';
import { SnackService } from '../../../core/snack/snack.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';

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

// Заглушка auth — нужна для scope-фильтра «Мои объекты».
class FakeAuth {
  currentUser = (): null => null;
}

class FakeSnack {
  calls: unknown[] = [];
  open(params: unknown): void {
    this.calls.push(params);
  }
}

class FakeSaved {
  toggleResult = true;
  shouldThrow = false;
  async getSavedIds(): Promise<Set<string>> {
    return new Set();
  }
  async toggle(_id: string): Promise<boolean> {
    if (this.shouldThrow) throw new Error('rpc fail');
    return this.toggleResult;
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('FeedPageComponent', () => {
  let fake: FakeSupabase;
  let filter: FeedFilterService;
  let fakeSnack: FakeSnack;
  let fakeSaved: FakeSaved;

  const build = (): FeedPageComponent => {
    TestBed.configureTestingModule({
      providers: [
        FeedFilterService,
        { provide: MrsqmSupabaseService, useValue: fake },
        { provide: PanelContentService, useClass: FakePanels },
        { provide: MrsqmAuthService, useClass: FakeAuth },
        { provide: SnackService, useValue: fakeSnack },
        { provide: SavedPropertiesService, useValue: fakeSaved },
      ],
    });
    filter = TestBed.inject(FeedFilterService);
    return TestBed.createComponent(FeedPageComponent).componentInstance;
  };

  beforeEach(() => {
    fake = new FakeSupabase();
    fakeSnack = new FakeSnack();
    fakeSaved = new FakeSaved();
    TestBed.resetTestingModule();
  });

  it('вызывает get_feed с dealType и дефолтной пагинацией', async () => {
    build();
    await flush();
    expect(fake.lastFn).toBe('get_feed');
    expect(fake.lastParams?.['p_deal_type']).toBe('sale');
    expect(fake.lastParams?.['p_limit']).toBe(20);
  });

  it('маппит фильтры в параметры RPC (мультиселекты, цена, площадь, сортировка)', async () => {
    const c = build();
    await flush();
    filter.dealType.set('rent');
    filter.sortBy.set('price_desc');
    filter.handover.set('ready');
    filter.filters.set({
      unitTypeId: 'ut-1',
      subTypeIds: [],
      bedrooms: [2, 3],
      bathrooms: [2],
      priceMin: 1000,
      priceMax: 5000,
      areaMin: 500,
      areaMax: 2000,
      furnished: 'furnished',
      listingType: 'pocket',
    });
    await flush();
    expect(fake.lastParams?.['p_deal_type']).toBe('rent');
    expect(fake.lastParams?.['p_sort_by']).toBe('price_desc');
    expect(fake.lastParams?.['p_unit_type_id']).toBe('ut-1');
    expect(fake.lastParams?.['p_bedrooms']).toEqual([2, 3]);
    expect(fake.lastParams?.['p_bathrooms']).toEqual([2]);
    expect(fake.lastParams?.['p_price_min']).toBe(1000);
    expect(fake.lastParams?.['p_price_max']).toBe(5000);
    expect(fake.lastParams?.['p_area_sqft_min']).toBe(500);
    expect(fake.lastParams?.['p_area_sqft_max']).toBe(2000);
    expect(fake.lastParams?.['p_furnished']).toBe('furnished');
    expect(fake.lastParams?.['p_handover']).toBe('ready');
    expect(fake.lastParams?.['p_listing_type']).toBe('pocket');
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

  it('выбранный адрес → p_location_ids в get_feed', async () => {
    build();
    await flush();
    filter.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    await flush();
    expect(fake.lastParams?.['p_location_ids']).toEqual(['loc-1']);
  });

  it('несколько адресов → p_location_ids содержит все id', async () => {
    build();
    await flush();
    filter.addLocation({ id: 'loc-1', name: 'Dubai Marina' });
    filter.addLocation({ id: 'loc-2', name: 'JBR' });
    await flush();
    expect(fake.lastParams?.['p_location_ids']).toEqual(['loc-1', 'loc-2']);
  });

  it('pickLocation дважды разными id → 2 в locationFilters', async () => {
    const c = build();
    await flush();
    c.pickLocation({
      id: 'l1',
      name: 'Marina',
    } as import('../../types/database').LocationSearchItem);
    c.pickLocation({
      id: 'l2',
      name: 'JBR',
    } as import('../../types/database').LocationSearchItem);
    expect(filter.locationFilters().length).toBe(2);
  });

  it('pickAgent чистит все локации', async () => {
    const c = build();
    await flush();
    filter.addLocation({ id: 'loc-1', name: 'Marina' });
    filter.addLocation({ id: 'loc-2', name: 'JBR' });
    c.pickAgent('Ivan Agent');
    expect(filter.locationFilters()).toEqual([]);
    expect(filter.agentQuery()).toBe('Ivan Agent');
  });

  it('removeLocation убирает нужный чип, остальные остаются', async () => {
    const c = build();
    await flush();
    filter.addLocation({ id: 'loc-1', name: 'Marina' });
    filter.addLocation({ id: 'loc-2', name: 'JBR' });
    c.removeLocation('loc-1');
    expect(filter.locationFilters().length).toBe(1);
    expect(filter.locationFilters()[0].id).toBe('loc-2');
  });

  it('агент из автокомплита фильтрует загруженные строки на клиенте', async () => {
    const c = build();
    await flush();
    c.properties.set([
      { id: 'a', visibility: 'public', owner_full_name: 'Ivan Agent' },
      { id: 'b', visibility: 'public', owner_full_name: 'Petr Broker' },
    ] as unknown as Parameters<typeof c.properties.set>[0]);
    expect(c.visibleProperties().length).toBe(2);
    filter.agentQuery.set('ivan');
    expect(c.visibleProperties().length).toBe(1);
    expect(c.visibleProperties()[0].id).toBe('a');
  });

  it('охват Public показывает и network-объекты (совпадает со счётчиком get_feed)', async () => {
    // API-11: count_total считает public+network, поэтому таблица под Public
    // не должна фильтровать строго 'public' — иначе пусто при ненулевом счётчике.
    const c = build();
    await flush();
    c.properties.set([
      { id: 'a', visibility: 'public', owner_full_name: 'A' },
      { id: 'b', visibility: 'network', owner_full_name: 'B' },
    ] as unknown as Parameters<typeof c.properties.set>[0]);
    expect(filter.scope()).toBe('public');
    expect(c.visibleProperties().length).toBe(2);
  });

  it('выбор unit_type ставит категорию + unitTypeId и чистит подтипы', async () => {
    const c = build();
    await flush();
    filter.filters.update((f) => ({ ...f, subTypeIds: ['old'] }));
    c.selectUnitType('residential', 'ut-9');
    expect(filter.category()).toBe('residential');
    expect(filter.filters().unitTypeId).toBe('ut-9');
    expect(filter.filters().subTypeIds).toEqual([]);
  });

  it('toggleSubType добавляет и убирает подтип', () => {
    const c = build();
    c.toggleSubType('s1');
    expect(filter.filters().subTypeIds).toEqual(['s1']);
    c.toggleSubType('s1');
    expect(filter.filters().subTypeIds).toEqual([]);
  });

  // ─── U-2: сигнал typePanelCat ───────────────────────────────────────────────
  it('typePanelCat по умолчанию = residential', () => {
    const c = build();
    expect(c.typePanelCat()).toBe('residential');
  });

  it('setTypePanelCat переключает таб панели на commercial', () => {
    const c = build();
    c.setTypePanelCat('commercial');
    expect(c.typePanelCat()).toBe('commercial');
  });

  it('setTypePanelCat переключает обратно на residential', () => {
    const c = build();
    c.setTypePanelCat('commercial');
    c.setTypePanelCat('residential');
    expect(c.typePanelCat()).toBe('residential');
  });

  it('onTypeMenuOpened синхронизирует typePanelCat с текущей категорией фильтра', () => {
    const c = build();
    filter.selectCategoryAll('commercial');
    // До открытия — дефолт
    expect(c.typePanelCat()).toBe('residential');
    c.onTypeMenuOpened();
    expect(c.typePanelCat()).toBe('commercial');
  });

  it('onTypeMenuOpened при null-категории оставляет residential', () => {
    const c = build();
    // фильтр не выбран → category() = null
    c.onTypeMenuOpened();
    expect(c.typePanelCat()).toBe('residential');
  });

  // ─── W-4: Commercial allowlist ───────────────────────────────────────────────
  it('typeTree commercial оставляет только разрешённые типы; типы вне allowlist отсеиваются', () => {
    const c = build();
    // Мок FilterOptions с residential и commercial категориями
    // (поля вне typeTree оставляем пустыми через приведение типа)
    const mockOptions = {
      categories: [
        { id: 'cat-res', value: 'residential', label_en: 'Residential', parent_id: null },
        { id: 'cat-com', value: 'commercial', label_en: 'Commercial', parent_id: null },
      ],
      unit_types: [
        // Residential — должны остаться нетронутыми
        { id: 'ut-apt', value: 'apartment', label_en: 'Apartment', parent_id: 'cat-res' },
        { id: 'ut-vil', value: 'villa', label_en: 'Villa', parent_id: 'cat-res' },
        // Commercial из allowlist — должны остаться
        { id: 'ut-off', value: 'office', label_en: 'Office', parent_id: 'cat-com' },
        {
          id: 'ut-hot',
          value: 'hotel_apartment',
          label_en: 'Hotel Apartment',
          parent_id: 'cat-com',
        },
        { id: 'ut-shp', value: 'shop', label_en: 'Shop', parent_id: 'cat-com' },
        // Commercial НЕ из allowlist — должны отфильтроваться
        { id: 'ut-shr', value: 'showroom', label_en: 'Showroom', parent_id: 'cat-com' },
        {
          id: 'ut-lab',
          value: 'labour_camp',
          label_en: 'Labour Camp',
          parent_id: 'cat-com',
        },
      ],
      sub_types: [],
    } as unknown as FilterOptions;
    c.filterOptions.set(mockOptions);

    const tree = c.typeTree();

    // Residential не затронут — оба типа на месте
    expect(tree.residential.units.length).toBe(2);
    expect(tree.residential.units.map((u) => u.label)).toEqual(['Apartment', 'Villa']);

    // Commercial: только Office, Hotel Apartment, Shop — Showroom и Labour Camp отсеяны
    expect(tree.commercial.units.length).toBe(3);
    const commercialLabels = tree.commercial.units.map((u) => u.label.toLowerCase());
    expect(commercialLabels).toContain('office');
    expect(commercialLabels).toContain('hotel apartment');
    expect(commercialLabels).toContain('shop');
    expect(commercialLabels).not.toContain('showroom');
    expect(commercialLabels).not.toContain('labour camp');
  });

  it('typeTree commercial пуст если filterOptions null', () => {
    const c = build();
    c.filterOptions.set(null);
    expect(c.typeTree().commercial.units).toEqual([]);
  });

  // ─── W-1: локации — сворачивание панели ─────────────────────────────────────
  it('removeLocation последней локации сбрасывает locExpanded в false', async () => {
    const c = build();
    await flush();
    filter.addLocation({ id: 'loc-1', name: 'Marina' });
    // Вручную раскрываем панель
    c.locExpanded.set(true);
    expect(c.locExpanded()).toBe(true);
    // Удаляем единственную локацию
    c.removeLocation('loc-1');
    expect(filter.locationFilters().length).toBe(0);
    expect(c.locExpanded()).toBe(false);
  });

  it('removeLocation одной из двух локаций НЕ сбрасывает locExpanded', async () => {
    const c = build();
    await flush();
    filter.addLocation({ id: 'loc-1', name: 'Marina' });
    filter.addLocation({ id: 'loc-2', name: 'JBR' });
    c.locExpanded.set(true);
    c.removeLocation('loc-1');
    // Ещё есть одна локация — панель остаётся раскрытой
    expect(c.locExpanded()).toBe(true);
  });

  // ─── Тост-подтверждение избранного ──────────────────────────────────────────
  const minimalFeedItem = (id = 'p1'): PropertyFeedItem =>
    ({ id }) as unknown as PropertyFeedItem;

  it('toggleSaved: добавление вызывает SnackService.open с «Добавлено в избранное»', async () => {
    fakeSaved.toggleResult = true; // toggle вернёт isSaved=true
    const c = build();
    await flush();
    await c.toggleSaved(minimalFeedItem());
    expect(fakeSnack.calls.length).toBe(1);
    const call = fakeSnack.calls[0] as { msg: string; type: string; ico: string };
    expect(call.msg).toBe('Добавлено в избранное');
    expect(call.type).toBe('SUCCESS');
    expect(call.ico).toBe('bookmark');
  });

  it('toggleSaved: удаление вызывает SnackService.open с «Убрано из избранного»', async () => {
    fakeSaved.toggleResult = false; // toggle вернёт isSaved=false
    const c = build();
    await flush();
    // Предварительно помечаем как сохранённый, чтобы оптимистично удалить
    c.savedIds.set(new Set(['p1']));
    await c.toggleSaved(minimalFeedItem());
    expect(fakeSnack.calls.length).toBe(1);
    const call = fakeSnack.calls[0] as { msg: string; type: string; ico: string };
    expect(call.msg).toBe('Убрано из избранного');
    expect(call.type).toBe('SUCCESS');
    expect(call.ico).toBe('bookmark_border');
  });

  it('toggleSaved: ошибка RPC вызывает SnackService.open с «Не удалось обновить избранное»', async () => {
    fakeSaved.shouldThrow = true;
    const c = build();
    await flush();
    await c.toggleSaved(minimalFeedItem());
    expect(fakeSnack.calls.length).toBe(1);
    const call = fakeSnack.calls[0] as { msg: string; type: string };
    expect(call.msg).toBe('Не удалось обновить избранное');
    expect(call.type).toBe('ERROR');
  });

  it('toggleSaved: успешное добавление помечает объект сохранённым (иконка заполняется)', async () => {
    fakeSaved.toggleResult = true; // сервер: action=saved
    const c = build();
    await flush();
    expect(c.savedIds().has('p1')).toBe(false);
    await c.toggleSaved(minimalFeedItem());
    // savedIds содержит id → [isSaved] карточки = true → mat-icon = 'bookmark'
    expect(c.savedIds().has('p1')).toBe(true);
  });

  it('toggleSaved: ошибка сервера откатывает оптимистичную отметку', async () => {
    fakeSaved.shouldThrow = true;
    const c = build();
    await flush();
    await c.toggleSaved(minimalFeedItem());
    // оптимистично добавили, затем откатили — объект не остаётся помеченным
    expect(c.savedIds().has('p1')).toBe(false);
  });
});
