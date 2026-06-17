import { TestBed } from '@angular/core/testing';
import { PropertyDetailComponent } from './property-detail.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyCreateService } from '../../services/property-create.service';
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
  supa: FakeSupabase;
  photos: FakePhotos;
  create: FakeCreate;
} => {
  const supa = new FakeSupabase();
  const photos = new FakePhotos();
  const create = new FakeCreate();
  TestBed.configureTestingModule({
    imports: [PropertyDetailComponent],
    providers: [
      { provide: MrsqmSupabaseService, useValue: supa },
      { provide: PropertyPhotoService, useValue: photos },
      { provide: PropertyCreateService, useValue: create },
    ],
  });
  const fixture = TestBed.createComponent(PropertyDetailComponent);
  fixture.componentRef.setInput('property', feedItem());
  return { comp: fixture.componentInstance, supa, photos, create };
};

describe('PropertyDetailComponent', () => {
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
});
