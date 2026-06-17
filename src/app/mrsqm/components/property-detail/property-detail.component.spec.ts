import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PropertyDetailComponent } from './property-detail.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';
import {
  FilterOptions,
  PropertyDetail,
  PropertyFeedItem,
  PropertyPhoto,
} from '../../types/database';

// ─── Заглушки сервисов ───────────────────────────────────────────────────────
class FakeSupabase {
  rpcResult: unknown = null;
  async rpc<T>(): Promise<T> {
    return this.rpcResult as T;
  }
}
class FakePhotos {
  photos: PropertyPhoto[] = [];
  async getPhotos(): Promise<PropertyPhoto[]> {
    return this.photos;
  }
}
class FakeCreate {
  options: Partial<FilterOptions> = {};
  async getFilterOptions(): Promise<FilterOptions> {
    return this.options as FilterOptions;
  }
}
class FakeSaved {
  saved = new Set<string>();
  async getSavedIds(): Promise<Set<string>> {
    return this.saved;
  }
  toggleResult = true;
  toggleCalls: string[] = [];
  async toggle(id: string): Promise<boolean> {
    this.toggleCalls.push(id);
    return this.toggleResult;
  }
}

const feedItem = (over: Partial<PropertyFeedItem> = {}): PropertyFeedItem => ({
  id: 'p1',
  owner_id: 'u1',
  deal_type: 'sale',
  listing_type: 'official',
  property_type: 'Apartment',
  price: 1_000_000,
  price_currency: 'AED',
  price_period: null,
  bedrooms: 2,
  bathrooms: 2,
  area_sqft: 1200,
  location_name: 'Marina',
  community_name: 'Dubai Marina',
  description: 'feed desc',
  furnished: 'furnished',
  handover: 'ready',
  is_distress: false,
  photos: null,
  published_at: '2026-06-01T00:00:00Z',
  owner_full_name: 'Feed Owner',
  owner_photo_url: null,
  owner_agency_name: 'Feed Agency',
  is_network: false,
  developer_name: null,
  ...over,
});

const detail = (over: Partial<PropertyDetail> = {}): PropertyDetail =>
  ({
    id: 'p1',
    owner_id: 'u1',
    listing_type: 'official',
    deal_type: 'sale',
    price: 900_000,
    previous_price: 1_000_000,
    price_currency: 'AED',
    bedrooms: 3,
    bathrooms: 2,
    is_maid: true,
    area_sqft: 1500,
    view_ids: ['v1'],
    is_distress: false,
    is_negotiable: true,
    commission_included: false,
    location_full_path: 'Dubai > Marina > Tower',
    developer_name_ref: 'Emaar',
    developer_logo_url: 'logo.png',
    views_count: 42,
    last_actualized_at: new Date().toISOString(),
    is_network: false,
    is_owner: false,
    agent: {
      id: 'u1',
      full_name: 'Ivan Agent',
      tg_username: 'ivan',
      whatsapp_phone: '+971500000000',
      photo_url: 'a.png',
      about: 'Top broker',
      languages: ['English', 'Russian'],
      agency_name: 'Real Agency',
      emirate_name: 'Dubai',
      broker_license: 'BRN123',
    },
    ...over,
  }) as PropertyDetail;

const makeComponent = (): {
  comp: PropertyDetailComponent;
  fixture: ComponentFixture<PropertyDetailComponent>;
  supa: FakeSupabase;
  photos: FakePhotos;
  create: FakeCreate;
  saved: FakeSaved;
} => {
  const supa = new FakeSupabase();
  const photos = new FakePhotos();
  const create = new FakeCreate();
  const saved = new FakeSaved();
  TestBed.configureTestingModule({
    imports: [PropertyDetailComponent],
    providers: [
      { provide: MrsqmSupabaseService, useValue: supa },
      { provide: PropertyPhotoService, useValue: photos },
      { provide: PropertyCreateService, useValue: create },
      { provide: SavedPropertiesService, useValue: saved },
    ],
  });
  const fixture = TestBed.createComponent(PropertyDetailComponent);
  fixture.componentRef.setInput('property', feedItem());
  return { comp: fixture.componentInstance, fixture, supa, photos, create, saved };
};

describe('PropertyDetailComponent', () => {
  it('без фото показывает «No Photo» без иконки', async () => {
    const { comp, fixture, supa, photos } = makeComponent();
    supa.rpcResult = detail();
    photos.photos = [];
    const loadPromise = comp.loadProperty();
    await loadPromise;
    await fixture.whenStable();
    fixture.detectChanges();
    // Проверяем, что компонент загрузился и готов к рендеру
    expect(comp.isLoading()).toBe(false);
    expect(comp.photos().length).toBe(0);
    const ph: HTMLElement | null = fixture.nativeElement.querySelector(
      '.gallery--placeholder',
    );
    expect(ph).not.toBeNull();
    expect(ph!.textContent).toContain('No Photo');
    expect(ph!.querySelector('mat-icon')).toBeNull();
  });

  it('резолвит агента из вложенного agent{} (фикс бага плоских полей)', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail();
    await comp.loadProperty();
    const vm = comp.vm();
    expect(vm.agentName).toBe('Ivan Agent');
    expect(vm.whatsapp).toBe('+971500000000');
    expect(vm.telegram).toBe('ivan');
    expect(vm.agentLangs).toEqual(['English', 'Russian']);
    expect(vm.agentEmirate).toBe('Dubai');
  });

  it('показывает снижение цены (previous_price > price)', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail();
    await comp.loadProperty();
    expect(comp.vm().previousPrice).toBe(1_000_000);
    expect(comp.vm().price).toBe(900_000);
  });

  it('не показывает снижение, если previous_price <= price', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ previous_price: 800_000, price: 900_000 });
    await comp.loadProperty();
    expect(comp.vm().previousPrice).toBeNull();
  });

  it('резолвит view_ids в названия через get_filter_options', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail();
    create.options = {
      views: [{ id: 'v1', value: 'sea', label_en: 'Sea View' }],
    };
    await comp.loadProperty();
    expect(comp.vm().views).toEqual(['Sea View']);
  });

  it('подгружает фото из property_photos', async () => {
    const { comp, supa, photos } = makeComponent();
    supa.rpcResult = detail();
    photos.photos = [
      {
        full_url: 'f1.webp',
        thumb_url: 't1.webp',
        order_index: 0,
        photo_type: 'gallery',
      },
      {
        full_url: 'f2.webp',
        thumb_url: 't2.webp',
        order_index: 1,
        photo_type: 'gallery',
      },
    ];
    await comp.loadProperty();
    expect(comp.photos().length).toBe(2);
    expect(comp.currentPhotoUrl()).toBe('f1.webp');
    comp.nextPhoto();
    expect(comp.currentPhotoUrl()).toBe('f2.webp');
  });

  it('при ошибке доступа get_property ({error}) использует данные feed-item', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = { error: 'property not found or access denied' };
    await comp.loadProperty();
    expect(comp.detail()).toBeNull();
    // фолбэк на объект из ленты
    expect(comp.vm().agentName).toBe('Feed Owner');
    expect(comp.vm().price).toBe(1_000_000);
  });

  it('isOwner берётся из detail.is_owner', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    expect(comp.isOwner()).toBe(true);
  });

  it('saveEdit обновляет цену и описание в detail', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    comp.startEdit();
    comp.editPrice.set('750000');
    comp.editDescription.set('обновлённое описание');
    await comp.saveEdit();
    expect(comp.detail()?.price).toBe(750_000);
    expect(comp.detail()?.description).toBe('обновлённое описание');
    expect(comp.isEditing()).toBe(false);
  });

  it('saveEdit отклоняет некорректную цену', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    comp.startEdit();
    comp.editPrice.set('abc');
    await comp.saveEdit();
    expect(comp.isEditing()).toBe(true);
    expect(comp.ownerMsg()).toBe('Укажите корректную цену');
  });

  it('archive меняет статус в detail', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    await comp.archive('archived_sold');
    expect(comp.detail()?.status).toBe('archived_sold');
  });

  it('таб по умолчанию — details', () => {
    const { comp } = makeComponent();
    expect(comp.activeTab()).toBe('details');
  });

  it('setTab переключает на metrics', () => {
    const { comp } = makeComponent();
    comp.setTab('metrics');
    expect(comp.activeTab()).toBe('metrics');
  });

  it('metricsVm берёт метрики из detail', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
      is_owner: true,
      views_count: 42,
      unique_views_count: 30,
      impressions_count: 100,
      contacts_count: 7,
      comments_count: 3,
    });
    await comp.loadProperty();
    const m = comp.metricsVm();
    expect(m.views).toBe(42);
    expect(m.uniqueViews).toBe(30);
    expect(m.impressions).toBe(100);
    expect(m.contacts).toBe(7);
    expect(m.comments).toBe(3);
  });

  it('reset активного таба при смене объекта', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    comp.setTab('metrics');
    expect(comp.activeTab()).toBe('metrics');
    // Теперь меняем объект — таб должен вернуться на 'details'
    await comp.loadProperty();
    expect(comp.activeTab()).toBe('details');
  });

  it('таб Metrics скрыт для non-owner, виден для owner', async () => {
    const { comp, fixture, supa } = makeComponent();

    // Проверим non-owner
    supa.rpcResult = detail({ is_owner: false });
    await comp.loadProperty();
    fixture.detectChanges();

    let buttons = fixture.nativeElement.querySelectorAll('.detail-tab');
    let hasMetricsButton = Array.from(buttons as NodeListOf<Element>).some((btn) =>
      btn.textContent?.includes('Metrics'),
    );
    expect(hasMetricsButton).toBe(false);

    // Теперь для owner
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    fixture.detectChanges();

    buttons = fixture.nativeElement.querySelectorAll('.detail-tab');
    hasMetricsButton = Array.from(buttons as NodeListOf<Element>).some((btn) =>
      btn.textContent?.includes('Metrics'),
    );
    expect(hasMetricsButton).toBe(true);
  });

  it('toggleSaved дёргает сервис и переключает isSaved', async () => {
    const { comp, supa, saved } = makeComponent();
    supa.rpcResult = detail();
    await comp.loadProperty();
    expect(comp.isSaved()).toBe(false);
    saved.toggleResult = true;
    await comp.toggleSaved();
    expect(saved.toggleCalls).toEqual(['p1']);
    expect(comp.isSaved()).toBe(true);
  });

  it('loadProperty подхватывает существующее избранное', async () => {
    const { comp, supa, saved } = makeComponent();
    saved.saved = new Set(['p1']);
    supa.rpcResult = detail();
    await comp.loadProperty();
    expect(comp.isSaved()).toBe(true);
  });

  it('typeLabel собирает категория + тип + подтип (+ hotel pool)', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail({
      category_id: 'c1',
      unit_type_id: 'u1',
      sub_type_id: 's1',
      is_hotel_pool: true,
    });
    create.options = {
      categories: [{ id: 'c1', value: 'residential', label_en: 'Residential' }],
      unit_types: [{ id: 'u1', value: 'apartment', label_en: 'Apartment' }],
      sub_types: [{ id: 's1', value: 'flat', label_en: 'Flat' }],
    };
    await comp.loadProperty();
    expect(comp.vm().typeLabel).toBe('Residential Apartment - Flat (hotel apartment)');
  });
});
