import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { PropertyDetailComponent } from './property-detail.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyOwnerService } from '../../services/property-owner.service';
import { SavedPropertiesService } from '../../services/saved-properties.service';
import { SeenTrackingService } from '../../services/seen-tracking.service';
import { SnackService } from '../../../core/snack/snack.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import {
  FilterOptions,
  PropertyDetail,
  PropertyFeedItem,
  PropertyPhoto,
  PropertyProject,
} from '../../types/database';

// ─── Заглушки сервисов ───────────────────────────────────────────────────────
class FakeSupabase {
  rpcResult: unknown = null;
  // Перегружаемый мок: если переопределить rpc, используется он; иначе — rpcResult.
  rpc = async <T>(_name: string, _args?: unknown): Promise<T> => {
    return this.rpcResult as T;
  };
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
class FakeSnack {
  lastParams: unknown = null;
  open(params: unknown): void {
    this.lastParams = params;
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

// ─── Минимальный PropertyDetail для тестов LM Task 7 ────────────────────────
const baseDetail: PropertyDetail = {
  id: 'p1',
  owner_id: 'u1',
  listing_type: 'official',
  deal_type: 'sale',
  price: 900_000,
  previous_price: null,
  price_currency: 'AED',
  bedrooms: 2,
  bathrooms: 2,
  is_maid: false,
  area_sqft: 1200,
  view_ids: [],
  commission_included: false,
  location_full_path: 'Dubai > Marina',
  developer_name_ref: null,
  developer_logo_url: null,
  views_count: 0,
  last_actualized_at: new Date().toISOString(),
  is_network: false,
  is_owner: true,
  status: 'active',
  rejection_reason: null,
  agent: null,
} as unknown as PropertyDetail;

const makeComponent = (
  ownerSvcOverride?: jasmine.SpyObj<PropertyOwnerService>,
  dialogOverride?: jasmine.SpyObj<MatDialog>,
): {
  comp: PropertyDetailComponent;
  fixture: ComponentFixture<PropertyDetailComponent>;
  supa: FakeSupabase;
  photos: FakePhotos;
  create: FakeCreate;
  saved: FakeSaved;
  snack: FakeSnack;
  seen: jasmine.SpyObj<SeenTrackingService>;
} => {
  const supa = new FakeSupabase();
  const photos = new FakePhotos();
  const create = new FakeCreate();
  const saved = new FakeSaved();
  const snack = new FakeSnack();
  const seen = jasmine.createSpyObj<SeenTrackingService>('SeenTrackingService', [
    'recordContact',
    'recordView',
    'markShown',
  ]);
  seen.recordContact.and.resolveTo(undefined);
  seen.recordView.and.resolveTo(undefined);
  seen.markShown.and.resolveTo(undefined);

  // По умолчанию ownerSvc — заглушка, не требующая реального сервиса.
  const ownerSvc =
    ownerSvcOverride ??
    jasmine.createSpyObj<PropertyOwnerService>('PropertyOwnerService', [
      'actualizeProperty',
      'archiveProperty',
      'renewProperty',
      'deleteProperty',
      'editProperty',
    ]);
  if (!ownerSvcOverride) {
    (ownerSvc.actualizeProperty as jasmine.Spy).and.resolveTo(undefined);
    (ownerSvc.archiveProperty as jasmine.Spy).and.resolveTo(undefined);
    (ownerSvc.renewProperty as jasmine.Spy).and.resolveTo(undefined);
    (ownerSvc.deleteProperty as jasmine.Spy).and.resolveTo(undefined);
    (ownerSvc.editProperty as jasmine.Spy).and.resolveTo('active');
  }
  // changedTick — сигнал (не метод): createSpyObj его не создаёт. Компонент читает его
  // в эффекте рефетча, поэтому фейк обязан его иметь.
  (ownerSvc as unknown as { changedTick: WritableSignal<number> }).changedTick =
    signal(0);

  const providers: unknown[] = [
    { provide: MrsqmSupabaseService, useValue: supa },
    { provide: PropertyPhotoService, useValue: photos },
    { provide: PropertyCreateService, useValue: create },
    { provide: SavedPropertiesService, useValue: saved },
    { provide: SnackService, useValue: snack },
    { provide: SeenTrackingService, useValue: seen },
    { provide: PropertyOwnerService, useValue: ownerSvc },
    { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
  ];
  if (dialogOverride) {
    providers.push({ provide: MatDialog, useValue: dialogOverride });
  }

  TestBed.configureTestingModule({
    imports: [PropertyDetailComponent],
    providers: providers as Parameters<
      typeof TestBed.configureTestingModule
    >[0]['providers'],
  });
  const fixture = TestBed.createComponent(PropertyDetailComponent);
  fixture.componentRef.setInput('property', feedItem());
  return {
    comp: fixture.componentInstance,
    fixture,
    supa,
    photos,
    create,
    saved,
    snack,
    seen,
  };
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

  it('бамп changedTick перечитывает открытый объект (рефетч после правки владельца, без reload)', async () => {
    const { comp, fixture, supa } = makeComponent();
    supa.rpcResult = detail({ id: 'p1' });
    // Флуш стартового эффекта (property → loadProperty один раз), чтобы дальше
    // повторный вызов был атрибутирован именно бампу тика (id объекта не меняется).
    fixture.detectChanges();
    await fixture.whenStable();

    const loadSpy = spyOn(comp, 'loadProperty').and.resolveTo(undefined);
    const owner = TestBed.inject(PropertyOwnerService);
    owner.changedTick.update((n) => n + 1);
    fixture.detectChanges(); // флуш эффекта рефетча
    expect(loadSpy).toHaveBeenCalled();
  });

  it('goEdit() навигирует на /mrsqm/edit/:id', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ id: 'p1', is_owner: true });
    await comp.loadProperty();
    const routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const navSpy = spyOn(routerSpy, 'navigateByUrl').and.resolveTo(true);
    comp.goEdit();
    expect(navSpy).toHaveBeenCalledWith('/mrsqm/edit/p1');
  });

  it('goEdit() не навигирует без detail', () => {
    const { comp } = makeComponent();
    const routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const navSpy = spyOn(routerSpy, 'navigateByUrl').and.resolveTo(true);
    comp.detail.set(null);
    comp.goEdit();
    expect(navSpy).not.toHaveBeenCalled();
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
    await fixture.whenStable();
    fixture.detectChanges();

    let buttons = fixture.nativeElement.querySelectorAll('.detail-tab');
    let hasMetricsButton = Array.from(buttons as NodeListOf<Element>).some((btn) =>
      btn.textContent?.includes('Metrics'),
    );
    expect(hasMetricsButton).toBe(false);

    // Теперь для owner
    supa.rpcResult = detail({ is_owner: true });
    await comp.loadProperty();
    await fixture.whenStable();
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

  it('кнопки действий показываются владельцу', async () => {
    const { comp, fixture, supa } = makeComponent();
    supa.rpcResult = detail({ is_owner: true, status: 'active' });
    await comp.loadProperty();
    await fixture.whenStable();
    fixture.detectChanges();
    const actions = fixture.nativeElement.querySelector('.owner-panel');
    expect(actions).not.toBeNull();
    // active → кнопка «Изменить» (по матрице LM; «Редактировать» — у rejected/withdrawn).
    expect(actions.textContent).toContain('Изменить');
  });

  // V-8: typeCategory / typeSubtype (заменяет typeLabel)
  it('typeCategory возвращает категорию из справочника', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail({ category_id: 'c1', unit_type_id: 'u1', sub_type_id: 's1' });
    create.options = {
      categories: [{ id: 'c1', value: 'residential', label_en: 'Residential' }],
      unit_types: [{ id: 'u1', value: 'apartment', label_en: 'Apartment' }],
      sub_types: [{ id: 's1', value: 'flat', label_en: 'Flat' }],
    };
    await comp.loadProperty();
    expect(comp.vm().typeCategory).toBe('Residential');
  });

  it('typeSubtype возвращает подтип, фолбэк на unit_type', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail({ category_id: 'c1', unit_type_id: 'u1', sub_type_id: 's1' });
    create.options = {
      categories: [{ id: 'c1', value: 'residential', label_en: 'Residential' }],
      unit_types: [{ id: 'u1', value: 'apartment', label_en: 'Apartment' }],
      sub_types: [{ id: 's1', value: 'flat', label_en: 'Flat' }],
    };
    await comp.loadProperty();
    expect(comp.vm().typeSubtype).toBe('Flat');
  });

  it('typeSubtype добавляет суффикс (hotel apartment) при is_hotel_pool', async () => {
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
    expect(comp.vm().typeSubtype).toBe('Flat (hotel apartment)');
  });

  it('typeSubtype null когда нет ни sub_type_id ни unit_type_id', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail({ unit_type_id: null, sub_type_id: null });
    create.options = {
      categories: [{ id: 'c1', value: 'residential', label_en: 'Residential' }],
    };
    await comp.loadProperty();
    expect(comp.vm().typeSubtype).toBeNull();
  });

  it('typeSubtype фолбэк на unit_type если sub_type_id отсутствует', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail({ unit_type_id: 'u1', sub_type_id: null });
    create.options = {
      unit_types: [{ id: 'u1', value: 'apartment', label_en: 'Apartment' }],
    };
    await comp.loadProperty();
    expect(comp.vm().typeSubtype).toBe('Apartment');
  });

  // ─── Слой 2b: Project-блок, active-listings, slider-адрес, vastu ─────────────

  const project = (over: Partial<PropertyProject> = {}): PropertyProject => ({
    project_group_name: 'Akoya',
    project_name: 'Akoya Cluster A',
    is_building: null,
    developer_name: 'DAMAC',
    project_status: 'under_construction',
    built_year: null,
    completion_q: 'Q4',
    completion_year: 2029,
    ...over,
  });

  it('_mapProject: is_building true → clusterLabel «Building»', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ project: project({ is_building: true }) });
    await comp.loadProperty();
    expect(comp.vm().project?.clusterLabel).toBe('Building');
  });

  it('_mapProject: is_building false → clusterLabel «Cluster»', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ project: project({ is_building: false }) });
    await comp.loadProperty();
    expect(comp.vm().project?.clusterLabel).toBe('Cluster');
  });

  it('_mapProject: is_building null → clusterLabel «Project»', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ project: project({ is_building: null }) });
    await comp.loadProperty();
    expect(comp.vm().project?.clusterLabel).toBe('Project');
  });

  it('_mapProject: status completed → completion «Ready», handover = built_year', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
      project: project({ project_status: 'completed', built_year: 2022 }),
    });
    await comp.loadProperty();
    expect(comp.vm().project?.completion).toBe('Ready');
    expect(comp.vm().project?.handover).toBe('2022');
  });

  it('_mapProject: status under_construction + q/year → completion «Off-Plan», handover «Q4 2029»', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
      project: project({
        project_status: 'under_construction',
        completion_q: 'Q4',
        completion_year: 2029,
      }),
    });
    await comp.loadProperty();
    expect(comp.vm().project?.completion).toBe('Off-Plan');
    expect(comp.vm().project?.handover).toBe('Q4 2029');
  });

  it('_mapProject: status planned → completion «Off-Plan»', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
      project: project({
        project_status: 'planned',
        completion_q: 'Q1',
        completion_year: 2030,
      }),
    });
    await comp.loadProperty();
    expect(comp.vm().project?.completion).toBe('Off-Plan');
  });

  it('_mapProject: неизвестный статус → completion null', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ project: project({ project_status: 'unknown_status' }) });
    await comp.loadProperty();
    expect(comp.vm().project?.completion).toBeNull();
  });

  it('_mapProject: project null → vm().project null', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ project: null });
    await comp.loadProperty();
    expect(comp.vm().project).toBeNull();
  });

  it('is_vastu true → vm().isVastu true', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_vastu: true });
    await comp.loadProperty();
    expect(comp.vm().isVastu).toBe(true);
  });

  it('is_vastu null → vm().isVastu false', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_vastu: null });
    await comp.loadProperty();
    expect(comp.vm().isVastu).toBe(false);
  });

  it('active_listings_count пробрасывается в vm().agentActiveListings', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
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
        active_listings_count: 15,
      },
    });
    await comp.loadProperty();
    expect(comp.vm().agentActiveListings).toBe(15);
  });

  it('agentActiveListings null когда agent нет', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ agent: null });
    await comp.loadProperty();
    expect(comp.vm().agentActiveListings).toBeNull();
  });

  it('public_location_path пробрасывается в vm().publicLocationPath', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ public_location_path: 'Dubai > Marina' });
    await comp.loadProperty();
    expect(comp.vm().publicLocationPath).toBe('Dubai > Marina');
  });

  it('владелец, адрес полный для всех (public_location_path null) → тег «(что видят все)»', async () => {
    const { comp, fixture, supa } = makeComponent();
    supa.rpcResult = detail({
      is_owner: true,
      location_full_path: 'Dubai > JBR > Sadaf 7',
      public_location_path: null,
    });
    await comp.loadProperty();
    await fixture.whenStable();
    fixture.detectChanges();
    const tags = Array.from(
      fixture.nativeElement.querySelectorAll('.loc-scope-tag') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent!.trim());
    // Нет «что видят другие» → одна строка, тег «(что видят все)», НЕ «(что видишь ты)».
    expect(tags).toEqual(['(что видят все)']);
  });

  it('владелец, адрес урезан → «(что видишь ты)» + «(что видят другие)»', async () => {
    const { comp, fixture, supa } = makeComponent();
    supa.rpcResult = detail({
      is_owner: true,
      location_full_path: 'Dubai > JBR > Sadaf 7',
      public_location_path: 'Dubai > JBR',
    });
    await comp.loadProperty();
    await fixture.whenStable();
    fixture.detectChanges();
    const tags = Array.from(
      fixture.nativeElement.querySelectorAll('.loc-scope-tag') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent!.trim());
    expect(tags).toEqual(['(что видишь ты)', '(что видят другие)']);
  });

  it('handover null когда completed без built_year', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
      project: project({ project_status: 'completed', built_year: null }),
    });
    await comp.loadProperty();
    expect(comp.vm().project?.handover).toBeNull();
  });

  it('handover null когда under_construction без completion_q', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({
      project: project({ project_status: 'under_construction', completion_q: null }),
    });
    await comp.loadProperty();
    expect(comp.vm().project?.handover).toBeNull();
  });

  it('is_reduced true → vm().isReduced true', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_reduced: true });
    await comp.loadProperty();
    expect(comp.vm().isReduced).toBe(true);
  });

  it('is_below_op true → vm().isBelowOp true', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_below_op: true });
    await comp.loadProperty();
    expect(comp.vm().isBelowOp).toBe(true);
  });

  it('флаги null → false', async () => {
    const { comp, supa } = makeComponent();
    supa.rpcResult = detail({ is_reduced: null, is_below_op: null });
    await comp.loadProperty();
    expect(comp.vm().isReduced).toBe(false);
    expect(comp.vm().isBelowOp).toBe(false);
  });

  it('floors_in_unit_id резолвится в label (Levels) по floors_in_unit_house', async () => {
    const { comp, supa, create } = makeComponent();
    supa.rpcResult = detail({ floors_in_unit_id: 'fiu2' });
    create.options = {
      floors_in_unit_house: [
        { id: 'fiu1', value: 'G+0', label_en: 'G+0' },
        { id: 'fiu2', value: 'G+1', label_en: 'G+1' },
      ],
    };
    await comp.loadProperty();
    expect(comp.vm().floorsInUnit).toBe('G+1');
  });

  it('бейджи «Торг»/«Срочно» не рендерятся (поля терминированы)', async () => {
    const { comp, fixture, supa } = makeComponent();
    supa.rpcResult = detail();
    await comp.loadProperty();
    await fixture.whenStable();
    fixture.detectChanges();
    const chips: string =
      fixture.nativeElement.querySelector('.type-chips')?.textContent ?? '';
    expect(chips).not.toContain('Торг');
    expect(chips).not.toContain('Срочно');
  });

  // ─── seen_contact: хук на кнопки WA/TG ──────────────────────────────────────

  it('openWhatsApp вызывает recordContact с id объекта', async () => {
    const { comp, supa, seen } = makeComponent();
    supa.rpcResult = detail({ id: 'p1' });
    await comp.loadProperty();
    comp.openWhatsApp('+971500000000');
    expect(seen.recordContact).toHaveBeenCalledWith('p1');
  });

  it('openTelegram вызывает recordContact с id объекта', async () => {
    const { comp, supa, seen } = makeComponent();
    supa.rpcResult = detail({ id: 'p1' });
    await comp.loadProperty();
    comp.openTelegram('@ivan');
    expect(seen.recordContact).toHaveBeenCalledWith('p1');
  });

  // ─── Воронка владельца (Stage 2, Task 3) ────────────────────────────────────

  it('setTab("metrics") у владельца вызывает RPC get_listing_delivery_stats и заполняет funnel()', async () => {
    const { comp, supa } = makeComponent();
    // Первый вызов rpc — get_property (в loadProperty). Второй — get_listing_delivery_stats.
    // Переопределим rpc-заглушку, чтобы различить вызовы.
    const rpcCalls: { name: string; args: unknown }[] = [];
    supa.rpc = async <T>(name: string, args: unknown): Promise<T> => {
      rpcCalls.push({ name, args });
      if (name === 'get_property')
        return detail({ id: 'p1', is_owner: true }) as unknown as T;
      if (name === 'get_listing_delivery_stats')
        return { seen_preview: 10, seen_full: 4, seen_contact: 1 } as unknown as T;
      return null as unknown as T;
    };

    await comp.loadProperty();
    expect(comp.isOwner()).toBe(true);
    expect(comp.funnel()).toBeNull(); // ещё не загружена

    comp.setTab('metrics');
    // _loadFunnel — async, ждём один микротик
    await Promise.resolve();

    expect(rpcCalls.some((c) => c.name === 'get_listing_delivery_stats')).toBe(true);
    const fn = comp.funnel();
    expect(fn).not.toBeNull();
    expect(fn?.seen_preview).toBe(10);
    expect(fn?.seen_full).toBe(4);
    expect(fn?.seen_contact).toBe(1);
  });

  it('setTab("metrics") у не-владельца НЕ вызывает RPC воронки', async () => {
    const { comp, supa } = makeComponent();
    const rpcCalls: string[] = [];
    supa.rpc = async <T>(name: string): Promise<T> => {
      rpcCalls.push(name);
      if (name === 'get_property')
        return detail({ id: 'p1', is_owner: false }) as unknown as T;
      return null as unknown as T;
    };

    await comp.loadProperty();
    comp.setTab('metrics');
    await Promise.resolve();

    expect(rpcCalls).not.toContain('get_listing_delivery_stats');
    expect(comp.funnel()).toBeNull();
  });

  it('повторный setTab("metrics") не вызывает RPC второй раз (lazy once)', async () => {
    const { comp, supa } = makeComponent();
    let callCount = 0;
    supa.rpc = async <T>(name: string): Promise<T> => {
      if (name === 'get_listing_delivery_stats') callCount++;
      if (name === 'get_property')
        return detail({ id: 'p1', is_owner: true }) as unknown as T;
      return { seen_preview: 5, seen_full: 2, seen_contact: 0 } as unknown as T;
    };

    await comp.loadProperty();
    comp.setTab('metrics');
    await Promise.resolve();
    comp.setTab('details');
    comp.setTab('metrics');
    await Promise.resolve();

    expect(callCount).toBe(1);
  });

  // ─── LM Task 7: логика баннера, кнопки, renew, confirmDelete ─────────────────

  it('ownerActions() возвращает набор по статусу', () => {
    const ownerSvc = jasmine.createSpyObj<PropertyOwnerService>('PropertyOwnerService', [
      'actualizeProperty',
      'archiveProperty',
      'renewProperty',
      'deleteProperty',
      'editProperty',
    ]);
    const { comp } = makeComponent(ownerSvc);
    comp.detail.set({ ...baseDetail, status: 'expired' });
    expect(comp.ownerActions()).toEqual(['renew', 'archive']);
    comp.detail.set({ ...baseDetail, status: 'archived_sold' });
    expect(comp.ownerActions()).toEqual(['delete']);
  });

  it('bannerTone() мапит статус в тон', () => {
    const ownerSvc = jasmine.createSpyObj<PropertyOwnerService>('PropertyOwnerService', [
      'actualizeProperty',
      'archiveProperty',
      'renewProperty',
      'deleteProperty',
      'editProperty',
    ]);
    const { comp } = makeComponent(ownerSvc);
    comp.detail.set({ ...baseDetail, status: 'rejected' });
    expect(comp.bannerTone()).toBe('error');
    comp.detail.set({ ...baseDetail, status: 'active' });
    expect(comp.bannerTone()).toBe('success');
  });

  it('renew() зовёт renewProperty и ставит active', async () => {
    const ownerSvc = jasmine.createSpyObj<PropertyOwnerService>('PropertyOwnerService', [
      'actualizeProperty',
      'archiveProperty',
      'renewProperty',
      'deleteProperty',
      'editProperty',
    ]);
    (ownerSvc.renewProperty as jasmine.Spy).and.resolveTo(undefined);
    const { comp } = makeComponent(ownerSvc);
    comp.detail.set({ ...baseDetail, status: 'expired' });
    await comp.renew();
    expect(ownerSvc.renewProperty).toHaveBeenCalledWith(baseDetail.id);
    expect(comp.detail()?.status).toBe('active');
  });

  it('confirmDelete() при подтверждении зовёт deleteProperty и эмитит closed', async () => {
    const ownerSvc = jasmine.createSpyObj<PropertyOwnerService>('PropertyOwnerService', [
      'actualizeProperty',
      'archiveProperty',
      'renewProperty',
      'deleteProperty',
      'editProperty',
    ]);
    (ownerSvc.deleteProperty as jasmine.Spy).and.resolveTo(undefined);

    const dialogRefSpy = jasmine.createSpyObj<MatDialogRef<unknown>>('MatDialogRef', [
      'afterClosed',
    ]);
    dialogRefSpy.afterClosed.and.returnValue(of(true));
    const dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    (dialogSpy.open as jasmine.Spy).and.returnValue(dialogRefSpy);

    const { comp } = makeComponent(ownerSvc, dialogSpy);
    const closedSpy = jasmine.createSpy();
    comp.closed.subscribe(closedSpy);
    comp.detail.set({ ...baseDetail, status: 'archived_sold' });
    await comp.confirmDelete();
    expect(ownerSvc.deleteProperty).toHaveBeenCalledWith(baseDetail.id);
    expect(closedSpy).toHaveBeenCalled();
  });

  it('confirmDelete() при отказе НЕ удаляет', async () => {
    const ownerSvc = jasmine.createSpyObj<PropertyOwnerService>('PropertyOwnerService', [
      'actualizeProperty',
      'archiveProperty',
      'renewProperty',
      'deleteProperty',
      'editProperty',
    ]);
    (ownerSvc.deleteProperty as jasmine.Spy).and.resolveTo(undefined);

    const dialogRefSpy = jasmine.createSpyObj<MatDialogRef<unknown>>('MatDialogRef', [
      'afterClosed',
    ]);
    dialogRefSpy.afterClosed.and.returnValue(of(false));
    const dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    (dialogSpy.open as jasmine.Spy).and.returnValue(dialogRefSpy);

    const { comp } = makeComponent(ownerSvc, dialogSpy);
    comp.detail.set({ ...baseDetail, status: 'archived_sold' });
    await comp.confirmDelete();
    expect(ownerSvc.deleteProperty).not.toHaveBeenCalled();
  });
});
