import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EditPropertyPageComponent } from './edit-property.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyOwnerService } from '../../services/property-owner.service';
import { PropertyFormAService } from '../../services/property-form-a.service';
import { SnackService } from '../../../core/snack/snack.service';

describe('EditPropertyPageComponent', () => {
  let fixture: ComponentFixture<EditPropertyPageComponent>;

  const detailStub = {
    id: 'p1',
    owner_id: 'owner1',
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
    is_exclusive: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPropertyPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
        },
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
        {
          provide: PropertyFormAService,
          useValue: {
            uploadFormA: () => Promise.resolve('owner1/p1/file.pdf'),
            insertFormA: () => Promise.resolve(undefined),
          },
        },
        { provide: SnackService, useValue: { open: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditPropertyPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('грузит деталь и стартует на шаге 0', () => {
    const c = fixture.componentInstance;
    expect(c.detail()?.id).toBe('p1');
    expect(c.step()).toBe(0);
    expect(c.steps.length).toBe(5);
  });

  it('next() с шага 0 переходит на шаг 1', () => {
    const c = fixture.componentInstance;
    c.next();
    expect(c.step()).toBe(1);
  });

  it('prev() со шага 0 не уходит в минус', () => {
    const c = fixture.componentInstance;
    c.prev();
    expect(c.step()).toBe(0);
  });

  it('next() на шаге цены блокирует пустую цену и пропускает корректную', () => {
    const c = fixture.componentInstance;
    c.next(); // → шаг 1 (Цена и состояние)
    expect(c.step()).toBe(1);
    c.price.set('');
    c.next();
    expect(c.step()).toBe(1); // остался — валидация не пустила
    expect(c.error()).toBeTruthy();
    c.price.set('150');
    c.next();
    expect(c.step()).toBe(2);
    expect(c.error()).toBeNull();
  });

  it('prefill заполняет редактируемые сигналы из detail', () => {
    const c = fixture.componentInstance;
    expect(c.price()).toBe('100');
    expect(c.description()).toBe('d');
    expect(c.isMaid()).toBe(false);
  });

  it('бегунок: addrPath реконструируется, leaf = полный адрес при public_location_id=null', async () => {
    const c = fixture.componentInstance;
    await fixture.whenStable();
    expect(c.addrPath().length).toBeGreaterThan(0);
    expect(c.publicLocationId()).toBeNull();
  });

  it('шаг «Описание» (index 3) биндит сигнал description', () => {
    const c = fixture.componentInstance;
    c.step.set(3);
    fixture.detectChanges();
    const ta: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(ta.value).toBe('d');
  });

  it('onOriginalPriceInput форматирует OP с разделителями', () => {
    const c = fixture.componentInstance;
    c.onOriginalPriceInput('1400000');
    expect(c.originalPrice()).toBe('1,400,000');
    c.onOriginalPriceInput('');
    expect(c.originalPrice()).toBe('');
  });

  it('deleteExisting зовёт сервис и перечитывает фото', async () => {
    const c = fixture.componentInstance;
    const svc = TestBed.inject(PropertyPhotoService);
    const delSpy = spyOn(svc, 'deletePhoto').and.resolveTo(undefined);
    spyOn(svc, 'getPhotos').and.resolveTo([]);
    await c.deleteExisting({
      full_url: 'f',
      thumb_url: 't',
      order_index: 0,
      photo_type: 'gallery',
    });
    expect(delSpy).toHaveBeenCalledWith(
      'p1',
      jasmine.objectContaining({ full_url: 'f' }),
    );
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

  // ─── SP-C1: Form A + is_exclusive тесты ─────────────────────────────────────

  it('префилл is_exclusive из detail', () => {
    const c = fixture.componentInstance;
    // По умолчанию detailStub.is_exclusive=false → isExclusive()===false
    expect(c.isExclusive()).toBe(false);
    // Принудительно префиллим с is_exclusive=true
    c['_prefill']({ ...detailStub, is_exclusive: true } as never);
    expect(c.isExclusive()).toBe(true);
  });

  it('onFormAFile отклоняет не-PDF', () => {
    const c = fixture.componentInstance;
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    const event = { target: input } as unknown as Event;
    c.onFormAFile(event);
    expect(c.formAFile()).toBeNull();
    expect(c.formAFileName()).toBe('');
  });

  it('onFormAFile принимает PDF', () => {
    const c = fixture.componentInstance;
    const file = new File(['%PDF'], 'form-a.pdf', { type: 'application/pdf' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    const event = { target: input } as unknown as Event;
    c.onFormAFile(event);
    expect(c.formAFile()).toBe(file);
    expect(c.formAFileName()).toBe('form-a.pdf');
  });

  it('submitLabel: official + formAFile → Опубликовать; pocket → Сохранить', () => {
    const c = fixture.componentInstance;
    // pocket листинг (detailStub) — сохранить
    expect(c.submitLabel()).toBe('Сохранить');
    // официальный + файл → опубликовать
    c.listingType.set('official');
    const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    c.formAFile.set(file);
    expect(c.submitLabel()).toBe('Опубликовать');
    // убрать файл — official тип остаётся (pocket→official = будет модерация)
    c.formAFile.set(null);
    // detail.listing_type = pocket, current = official → тоже модерация
    expect(c.submitLabel()).toBe('Опубликовать');
    // вернуть pocket
    c.listingType.set('pocket');
    expect(c.submitLabel()).toBe('Сохранить');
  });

  it('official + новый Form A: uploadFormA+insertFormA вызваны ДО editProperty, с isExclusive', async () => {
    const c = fixture.componentInstance;
    const owner = TestBed.inject(PropertyOwnerService);
    const formASvc = TestBed.inject(PropertyFormAService);
    const editSpy = spyOn(owner, 'editProperty').and.resolveTo('pending_review');
    const uploadSpy = spyOn(formASvc, 'uploadFormA').and.resolveTo('owner1/p1/uuid.pdf');
    const insertSpy = spyOn(formASvc, 'insertFormA').and.resolveTo(undefined);

    c.price.set('150');
    c.listingType.set('official');
    c.isExclusive.set(true);
    c.contractNumber.set('CN-001');
    c.contractStart.set('2026-01-01');
    c.contractEnd.set('2027-01-01');
    const file = new File(['%PDF'], 'form-a.pdf', { type: 'application/pdf' });
    c.formAFile.set(file);

    await c.save();

    expect(uploadSpy).toHaveBeenCalledWith('p1', 'owner1', file);
    expect(insertSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        property_id: 'p1',
        contract_number: 'CN-001',
        uploaded_by: 'owner1',
      }),
    );
    // editProperty вызван ПОСЛЕ Form A
    expect(editSpy).toHaveBeenCalled();
    const payload = editSpy.calls.mostRecent().args[0];
    expect(payload.isExclusive).toBe(true);
  });

  it('обычная правка без нового Form A: Form A-сервис не зван, editProperty с isExclusive', async () => {
    const c = fixture.componentInstance;
    const owner = TestBed.inject(PropertyOwnerService);
    const formASvc = TestBed.inject(PropertyFormAService);
    const editSpy = spyOn(owner, 'editProperty').and.resolveTo('active');
    const uploadSpy = spyOn(formASvc, 'uploadFormA').and.resolveTo('path');
    const insertSpy = spyOn(formASvc, 'insertFormA').and.resolveTo(undefined);

    c.price.set('150');
    // listingType остаётся 'pocket' (из detailStub)
    c.isExclusive.set(false);

    await c.save();

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(editSpy).toHaveBeenCalled();
    const payload = editSpy.calls.mostRecent().args[0];
    expect(payload.isExclusive).toBe(false);
  });

  it('сбой Form A: editProperty НЕ вызван, _notify ERROR', async () => {
    const c = fixture.componentInstance;
    const owner = TestBed.inject(PropertyOwnerService);
    const formASvc = TestBed.inject(PropertyFormAService);
    const editSpy = spyOn(owner, 'editProperty').and.resolveTo('active');
    spyOn(formASvc, 'uploadFormA').and.rejectWith(new Error('upload failed'));
    spyOn(formASvc, 'insertFormA').and.resolveTo(undefined);
    const snack = TestBed.inject(SnackService);
    const notifySpy = spyOn(snack, 'open');

    c.price.set('150');
    c.listingType.set('official');
    c.contractNumber.set('CN-001');
    c.contractStart.set('2026-01-01');
    c.contractEnd.set('2027-01-01');
    const file = new File(['%PDF'], 'form-a.pdf', { type: 'application/pdf' });
    c.formAFile.set(file);

    await c.save();

    expect(editSpy).not.toHaveBeenCalled();
    expect(notifySpy).toHaveBeenCalledWith(jasmine.objectContaining({ type: 'ERROR' }));
  });
});
