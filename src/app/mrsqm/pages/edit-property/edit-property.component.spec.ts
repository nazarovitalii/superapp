import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { EditPropertyPageComponent } from './edit-property.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';

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
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPropertyPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } },
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
        { provide: PropertyPhotoService, useValue: { getPhotos: () => Promise.resolve([]) } },
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

  it('бегунок: addrPath реконструируется, leaf = полный адрес при public_location_id=null', async () => {
    const c = fixture.componentInstance;
    // locationInfo застаблен выше; ждём реконструкции
    await fixture.whenStable();
    expect(c.addrPath().length).toBeGreaterThan(0);
    // public_location_id null → revealIndex = leaf → publicLocationId null
    expect(c.publicLocationId()).toBeNull();
  });
});
