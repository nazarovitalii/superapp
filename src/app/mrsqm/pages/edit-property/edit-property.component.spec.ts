import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EditPropertyPageComponent } from './edit-property.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyOwnerService } from '../../services/property-owner.service';
import { SnackService } from '../../../core/snack/snack.service';

describe('EditPropertyPageComponent', () => {
  let fixture: ComponentFixture<EditPropertyPageComponent>;

  const detailStub = {
    id: 'p1',
    is_owner: true,
    status: 'active',
    category_id: 'c1',
    unit_type_id: 'u1',
    deal_type: 'sale',
    price: 100,
    location_full_path: 'Dubai / Marina',
    description: 'd',
    location_id: 'leaf',
    public_location_id: null,
    // Поля для теста prefill (Task 5)
    is_maid: false,
    is_study: false,
    is_hotel_pool: false,
    is_vastu: false,
    area_sqft: null,
    plot_sqft: null,
    floor_level_id: null,
    floor_number: null,
    floors_in_unit_id: null,
    view_ids: null,
    position_ids: null,
    amenity_ids: null,
    furnished: null,
    price_period: null,
    occupancy_status: 'vacant',
    lease_until: null,
    listing_type: 'pocket',
    visibility: 'public',
    public_location_path: null,
    original_price: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPropertyPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } },
        { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
        {
          provide: MrsqmSupabaseService,
          useValue: { rpc: () => Promise.resolve(detailStub) },
        },
        {
          provide: PropertyCreateService,
          useValue: {
            getFilterOptions: () =>
              Promise.resolve({
                categories: [],
                unit_types: [
                  { id: 'u1', value: 'apartment', label_en: 'Apt', parent_id: 'c1' },
                ],
                sub_types: [],
                views: [],
                positions: [],
                amenities: [],
                floor_levels: [],
                floors_in_unit_apt: [],
                floors_in_unit_house: [],
              }),
            locationInfo: () =>
              Promise.resolve({
                location: { id: 'leaf', name: 'Tower A', level: 'building' },
                breadcrumb: [
                  { id: 'city', name: 'Dubai', level: 'city' },
                  { id: 'comm', name: 'Marina', level: 'community' },
                ],
                children: [],
                developer_ids: [],
              }),
          },
        },
        {
          provide: PropertyPhotoService,
          useValue: {
            getPhotos: () => Promise.resolve([]),
            deletePhoto: () => Promise.resolve(undefined),
            reorder: () => Promise.resolve(undefined),
            uploadAndAttach: () => Promise.resolve(undefined),
          },
        },
        {
          provide: PropertyOwnerService,
          useValue: { editProperty: () => Promise.resolve('active') },
        },
        { provide: SnackService, useValue: { open: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditPropertyPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('грузит деталь и стартует на табе params', () => {
    const c = fixture.componentInstance;
    expect(c.detail()?.id).toBe('p1');
    expect(c.tab()).toBe('params');
  });

  it('setTab переключает таб', () => {
    fixture.componentInstance.setTab('photos');
    expect(fixture.componentInstance.tab()).toBe('photos');
  });

  it('prefill заполняет редактируемые сигналы из detail', () => {
    const c = fixture.componentInstance;
    expect(c.price()).toBe('100');         // detailStub.price = 100
    expect(c.description()).toBe('d');
    expect(c.isMaid()).toBe(false);
  });

  it('бегунок: addrPath реконструируется, leaf = полный адрес при public_location_id=null', async () => {
    const c = fixture.componentInstance;
    // locationInfo застаблен выше; ждём реконструкции
    await fixture.whenStable();
    expect(c.addrPath().length).toBeGreaterThan(0);
    // public_location_id null → revealIndex = leaf → publicLocationId null
    expect(c.publicLocationId()).toBeNull();
  });

  it('таб «Описание» биндит сигнал description', () => {
    const c = fixture.componentInstance;
    c.setTab('description');
    fixture.detectChanges();
    const ta: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(ta.value).toBe('d');
  });

  it('deleteExisting зовёт сервис и перечитывает фото', async () => {
    const c = fixture.componentInstance;
    const svc = TestBed.inject(PropertyPhotoService) as any;
    spyOn(svc, 'deletePhoto').and.resolveTo(undefined);
    spyOn(svc, 'getPhotos').and.resolveTo([]);
    await c.deleteExisting({ full_url: 'f', thumb_url: 't', order_index: 0, photo_type: 'gallery' });
    expect(svc.deletePhoto).toHaveBeenCalledWith('p1', jasmine.objectContaining({ full_url: 'f' }));
  });

  it('save() собирает payload и зовёт editProperty', async () => {
    const c = fixture.componentInstance;
    const owner = TestBed.inject(PropertyOwnerService);
    const spy = spyOn(owner, 'editProperty').and.resolveTo('active');
    c.price.set('150');
    await c.save();
    expect(spy).toHaveBeenCalled();
    const payload = spy.calls.mostRecent().args[0];
    expect(payload.propertyId).toBe('p1');
    expect(payload.price).toBe(150);
  });
});
