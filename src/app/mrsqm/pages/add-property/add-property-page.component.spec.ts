import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AddPropertyPageComponent } from './add-property-page.component';
import { revealIndexFromFraction } from './reveal-slider.util';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyFormAService } from '../../services/property-form-a.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { SnackService } from '../../../core/snack/snack.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import {
  BuildingInfo,
  DeveloperSearchItem,
  FilterOptions,
  LocationSearchItem,
  LocationInfo,
} from '../../types/database';

// Минимальный FilterOptions-объект, чтобы _loadOptions не падал.
const FAKE_OPTIONS: FilterOptions = {
  categories: [],
  unit_types: [],
  sub_types: [],
  handover_options: [
    { value: 'ready', label_en: 'Ready', label_ru: 'Готово' },
    { value: 'offplan', label_en: 'Off-Plan', label_ru: 'Off-Plan' },
  ],
  occupancy_options: [],
  listing_types: [],
  completion_quarters: [],
  floor_levels: [],
  floors_in_unit_apt: [],
  floors_in_unit_house: [],
  views: [],
  positions: [],
  amenities: [],
  furnished_options: [],
} as unknown as FilterOptions;

// Стаб PropertyCreateService — только методы, нужные компоненту при инициализации.
class FakePropertyCreateService {
  async getFilterOptions(): Promise<FilterOptions> {
    return FAKE_OPTIONS;
  }
  async getBuildingInfo(_locationId: string): Promise<BuildingInfo | null> {
    return null;
  }
  async getCommunityLayouts(_communityId: string): Promise<[]> {
    return [];
  }
  async searchLocations(_query: string, _limit?: number): Promise<LocationSearchItem[]> {
    return [];
  }
  async locationInfo(_id: string): Promise<LocationInfo | null> {
    return null;
  }
  async createProperty(_payload: unknown): Promise<string> {
    return 'new-id';
  }
  async searchDevelopers(_query: string): Promise<DeveloperSearchItem[]> {
    return [];
  }
  async searchInScope(
    _query: string,
    _withinId: string,
    _limit?: number,
  ): Promise<LocationSearchItem[]> {
    return [];
  }
}

// Стаб PropertyPhotoService.
class FakePhotoService {
  async uploadAndAttach(_id: string, _files: File[], _fp: File[] = []): Promise<void> {}
}

// Стаб PropertyFormAService.
class FakeFormAService {
  async uploadFormA(_propertyId: string, _ownerId: string, _file: File): Promise<string> {
    return 'owner-1/prop-id/uuid.pdf';
  }
  async insertFormA(_row: unknown): Promise<void> {}
}

// Стаб MrsqmAuthService.
class FakeAuthService {
  currentUser = (): null => null;
  isAuthenticated = (): boolean => false;
  isInitializing = (): boolean => false;
}

// Эталонный заполненный BuildingInfo с completed-проектом.
const completedBuildingInfo = (): BuildingInfo => ({
  project_name: 'Finished Tower',
  built_year: 2020,
  completion_year: 2020,
  completion_q: null,
  total_floors: 30,
  total_units: 200,
  project_status: 'completed',
});

// Эталонный BuildingInfo с НЕ-completed статусом.
const activeBuildingInfo = (): BuildingInfo => ({
  project_name: 'Active Tower',
  built_year: null,
  completion_year: null,
  completion_q: null,
  total_floors: null,
  total_units: null,
  project_status: 'under_construction',
});

// ── Ожидаемые константы (FC-4, порядок после B3: Описание→Фото) ──────────────
const EXPECTED_STEPS = [
  'Категория',
  'Адрес',
  'Параметры',
  'Цена',
  'Состояние',
  'Листинг',
  'Описание',
  'Фото',
] as const;
const EXPECTED_STEP_ICONS = [
  'category',
  'place',
  'tune',
  'payments',
  'event_available',
  'verified',
  'description',
  'photo_library',
] as const;

describe('AddPropertyPageComponent — структура шагов (FC-4)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('STEPS содержит 8 шагов', () => {
    expect(component.steps.length).toBe(8);
  });

  it('STEPS имеет ожидаемый порядок (FC-4)', () => {
    expect([...component.steps]).toEqual([...EXPECTED_STEPS]);
  });

  it('STEP_ICONS имеет ожидаемый порядок (FC-4)', () => {
    expect([...component.stepIcons]).toEqual([...EXPECTED_STEP_ICONS]);
  });

  // ── _validateStep: гейт шага 1 (Адрес) ───────────────────────────────────

  it('шаг 1 (Адрес): без locationId → возвращает строку-ошибку', () => {
    component.step.set(1);
    component.locationId.set(null);
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 1 (Адрес): c locationId → возвращает null', () => {
    component.step.set(1);
    component.locationId.set('some-location-id');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toBeNull();
  });

  // ── _validateStep: гейт шага 2 (Параметры) ───────────────────────────────

  it('шаг 2 (Параметры): bua-тип без areaSqft → возвращает ошибку', () => {
    component.step.set(2);
    // Имитируем тип с полем bua через fields() — устанавливаем unitTypeId на
    // тип, у которого typeFieldsFor возвращает bua=true. Самый прямой способ:
    // убедиться, что ветка bua сработала. Так как options могут быть пустыми,
    // подменим computed fields напрямую через форсирование areaSqft.
    // Способ: выставим unit_type с value 'apartment' (bua=true по typeFieldsFor).
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt-id', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt-id');
    component.areaSqft.set('');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 2 (Параметры): bua-тип с areaSqft и beds/baths → возвращает null', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt-id', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt-id');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set('fl1');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toBeNull();
  });

  // ── _validateStep: гейт шага 3 (Цена) ────────────────────────────────────

  it('шаг 3 (Цена): без price → возвращает ошибку', () => {
    component.step.set(3);
    component.price.set('');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 3 (Цена): с ценой → возвращает null', () => {
    component.step.set(3);
    component.price.set('1,200,000');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toBeNull();
  });

  // ── _validateStep: гейт шага 5 (Листинг) — Form A (SP-B) ────────────────

  it('шаг 5 (Листинг): official без contractNumber → возвращает ошибку', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.contractNumber.set('');
    component.formAFile.set(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 5 (Листинг): official без formAFile → возвращает ошибку', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.formAFile.set(null);
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 5 (Листинг): official без contractStart → возвращает ошибку (SP-C1)', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.contractStart.set('');
    component.contractEnd.set('2027-07-01');
    component.formAFile.set(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 5 (Листинг): official без contractEnd → возвращает ошибку (SP-C1)', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.contractStart.set('2026-07-01');
    component.contractEnd.set('');
    component.formAFile.set(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 5 (Листинг): official c contractNumber, датами и formAFile → возвращает null', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.contractStart.set('2026-07-01');
    component.contractEnd.set('2027-07-01');
    component.formAFile.set(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toBeNull();
  });

  it('шаги без обязательной валидации (4, 6, 7) → возвращают null', () => {
    for (const s of [4, 6, 7]) {
      component.step.set(s);
      expect((component as any)._validateStep()).toBeNull(); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  });

  // ── _validateStep: спальни/санузлы обязательные (B2) ─────────────────────

  it('шаг 2 (Параметры): тип с rooms, без bedrooms → возвращает ошибку', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt-id', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt-id');
    component.bedrooms.set(null);
    component.bathrooms.set(1);
    component.areaSqft.set('1200');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 2 (Параметры): тип с rooms, без bathrooms → возвращает ошибку', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt-id', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt-id');
    component.bedrooms.set(2);
    component.bathrooms.set(null);
    component.areaSqft.set('1200');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 2 (Параметры): тип с rooms, оба заполнены, с areaSqft → возвращает null', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt-id', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt-id');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set('fl1');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toBeNull();
  });

  it('шаг 2 (Параметры): тип без rooms (land), beds/baths null → не возвращает ошибку beds/baths', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [{ id: 'land-id', value: 'land', label_en: 'Land', parent_id: null }],
    } as unknown as FilterOptions);
    component.unitTypeId.set('land-id');
    component.bedrooms.set(null);
    component.bathrooms.set(null);
    component.plotSqft.set('3500');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    // land не имеет rooms → проверка beds/baths не применяется
    expect(result).toBeNull();
  });
});

describe('AddPropertyPageComponent — Off-Plan гейтинг (FC-3)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  // ── offPlanLocked ─────────────────────────────────────────────────────────

  it('offPlanLocked() === false, когда buildingInfo === null', () => {
    component.buildingInfo.set(null);
    expect(component.offPlanLocked()).toBeFalse();
  });

  it('offPlanLocked() === false, когда project_status !== "completed"', () => {
    component.buildingInfo.set(activeBuildingInfo());
    expect(component.offPlanLocked()).toBeFalse();
  });

  it('offPlanLocked() === true, когда project_status === "completed"', () => {
    component.buildingInfo.set(completedBuildingInfo());
    expect(component.offPlanLocked()).toBeTrue();
  });

  // ── selectHandover ────────────────────────────────────────────────────────

  it('selectHandover("offplan") не меняет handover, когда offPlanLocked === true', () => {
    component.buildingInfo.set(completedBuildingInfo());
    component.handover.set('ready');
    component.selectHandover('offplan');
    expect(component.handover()).toBe('ready');
  });

  it('selectHandover("offplan") меняет handover, когда offPlanLocked === false', () => {
    component.buildingInfo.set(null);
    component.handover.set('ready');
    component.selectHandover('offplan');
    expect(component.handover()).toBe('offplan');
  });

  it('selectHandover("ready") всегда меняет handover (блокировка не касается ready)', () => {
    component.buildingInfo.set(completedBuildingInfo());
    component.handover.set('offplan');
    component.selectHandover('ready');
    expect(component.handover()).toBe('ready');
  });

  // ── _reconcileHandover ────────────────────────────────────────────────────

  it('_reconcileHandover() форсирует ready, если completed-проект и выбран offplan', () => {
    component.buildingInfo.set(completedBuildingInfo());
    component.handover.set('offplan');
    // В тестах допустимо обращение к приватному методу через приведение типа.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    (component as any)._reconcileHandover();
    expect(component.handover()).toBe('ready');
  });

  it('_reconcileHandover() ничего не делает, если проект не completed', () => {
    component.buildingInfo.set(null);
    component.handover.set('offplan');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    (component as any)._reconcileHandover();
    expect(component.handover()).toBe('offplan');
  });

  it('_reconcileHandover() ничего не делает, если уже выбрана ready', () => {
    component.buildingInfo.set(completedBuildingInfo());
    component.handover.set('ready');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    (component as any)._reconcileHandover();
    expect(component.handover()).toBe('ready');
  });
});

// ── Вспомогательные ───────────────────────────────────────────────────────────
// Создаём фиктивный File с заданным именем (без реального содержимого).
const makeFile = (name: string): File => new File([], name, { type: 'image/jpeg' });

// CdkDragDrop-подобный event для тестирования pure-методов.
const makeDrop = (
  previousIndex: number,
  currentIndex: number,
): import('@angular/cdk/drag-drop').CdkDragDrop<string[]> =>
  ({ previousIndex, currentIndex }) as import('@angular/cdk/drag-drop').CdkDragDrop<
    string[]
  >;

// ─── Фото: reorder галереи (B4) ───────────────────────────────────────────────
describe('AddPropertyPageComponent — reorder галереи (B4)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
    // Заполняем три фото с различимыми именами.
    component.photos.set([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    component.previews.set(['url-a', 'url-b', 'url-c']);
  });

  it('dropPhoto: перестановка меняет оба массива синхронно', () => {
    component.dropPhoto(makeDrop(0, 2));
    expect(component.photos()[2].name).toBe('a.jpg');
    expect(component.previews()[2]).toBe('url-a');
    // Индекс 0 теперь должен содержать то, что было на 1-м месте.
    expect(component.photos()[0].name).toBe('b.jpg');
    expect(component.previews()[0]).toBe('url-b');
  });

  it('dropPhoto: не мутирует прежний массив (возвращает новый)', () => {
    const prevPhotos = component.photos();
    const prevPreviews = component.previews();
    component.dropPhoto(makeDrop(0, 1));
    expect(component.photos()).not.toBe(prevPhotos);
    expect(component.previews()).not.toBe(prevPreviews);
  });

  it('dropPhoto с одинаковыми индексами: массивы не меняются', () => {
    const prevPhotos = component.photos();
    const prevPreviews = component.previews();
    component.dropPhoto(makeDrop(1, 1));
    expect(component.photos()).toBe(prevPhotos);
    expect(component.previews()).toBe(prevPreviews);
  });

  it('makePhotoMain: ставит фото на позицию 0 в обоих массивах', () => {
    component.makePhotoMain(2);
    expect(component.photos()[0].name).toBe('c.jpg');
    expect(component.previews()[0]).toBe('url-c');
  });

  it('makePhotoMain(0): ничего не меняет', () => {
    const prevPhotos = component.photos();
    const prevPreviews = component.previews();
    component.makePhotoMain(0);
    expect(component.photos()).toBe(prevPhotos);
    expect(component.previews()).toBe(prevPreviews);
  });
});

// ─── Floor Plan: ограничение до 4 и reorder (B4) ─────────────────────────────
describe('AddPropertyPageComponent — Floor Plan до 4 (B4)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('MAX_FLOOR_PLANS === 4', () => {
    expect(component.MAX_FLOOR_PLANS).toBe(4);
  });

  it('dropFloorPlan: перестановка синхронна для floorPlans + floorPlanPreviews', () => {
    component.floorPlans.set([
      makeFile('fp1.jpg'),
      makeFile('fp2.jpg'),
      makeFile('fp3.jpg'),
    ]);
    component.floorPlanPreviews.set(['u1', 'u2', 'u3']);
    component.dropFloorPlan(makeDrop(0, 2));
    expect(component.floorPlans()[2].name).toBe('fp1.jpg');
    expect(component.floorPlanPreviews()[2]).toBe('u1');
  });

  it('dropFloorPlan: не мутирует прежний массив', () => {
    component.floorPlans.set([makeFile('fp1.jpg'), makeFile('fp2.jpg')]);
    component.floorPlanPreviews.set(['u1', 'u2']);
    const prev = component.floorPlans();
    component.dropFloorPlan(makeDrop(0, 1));
    expect(component.floorPlans()).not.toBe(prev);
  });

  it('removeFloorPlan: удаляет элемент синхронно', () => {
    component.floorPlans.set([makeFile('fp1.jpg'), makeFile('fp2.jpg')]);
    component.floorPlanPreviews.set(['u1', 'u2']);
    component.removeFloorPlan(0);
    expect(component.floorPlans().length).toBe(1);
    expect(component.floorPlans()[0].name).toBe('fp2.jpg');
    expect(component.floorPlanPreviews()[0]).toBe('u2');
  });
});

// ─── Бегунок приватности: selectReveal (B5) ──────────────────────────────────
describe('AddPropertyPageComponent — selectReveal (B5)', () => {
  let component: AddPropertyPageComponent;

  // Фиктивные уровни адреса: Dubai(0) → Damac Hills(1, community) → Street(2) → Unit(3, leaf)
  const FAKE_PATH = [
    { id: 'l0', name: 'Dubai', level: 'city' },
    { id: 'l1', name: 'Damac Hills', level: 'community' },
    { id: 'l2', name: 'Street', level: 'street' },
    { id: 'l3', name: 'Unit 101', level: 'unit' },
  ] as import('../../types/database').LocationBreadcrumbItem[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
    // Устанавливаем путь и начальный revealIndex на leaf.
    component.addrPath.set(FAKE_PATH);
    component.revealIndex.set(3);
  });

  it('communityIndex() === 1 для FAKE_PATH', () => {
    expect(component.communityIndex()).toBe(1);
  });

  it('selectReveal: устанавливает revealIndex при i >= communityIndex', () => {
    component.selectReveal(2);
    expect(component.revealIndex()).toBe(2);
  });

  it('selectReveal: НЕ меняет revealIndex при i < communityIndex (гард)', () => {
    component.revealIndex.set(2);
    component.selectReveal(0); // ниже community → гард блокирует
    expect(component.revealIndex()).toBe(2);
  });

  it('selectReveal: допускает выбор самого communityIndex', () => {
    component.selectReveal(1);
    expect(component.revealIndex()).toBe(1);
  });

  it('selectReveal: допускает выбор leafIndex', () => {
    component.revealIndex.set(1);
    component.selectReveal(3);
    expect(component.revealIndex()).toBe(3);
  });
});

// ─── FB-1: дедуп leaf на адрес-бегунке (building self-ref) ───────────────────
describe('AddPropertyPageComponent — pickLocation дедуп leaf (FB-1)', () => {
  let component: AddPropertyPageComponent;
  let service: FakePropertyCreateService;

  const makeInfo = (
    breadcrumb: import('../../types/database').LocationBreadcrumbItem[],
  ): import('../../types/database').LocationInfo => ({
    location: {
      id: 'b1',
      name: 'Sadaf 4',
      level: 'building',
      lat: null,
      lng: null,
      is_popular: false,
      completion_status: null,
      developer_ids: [],
    },
    breadcrumb,
    children: [], // leaf
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    component = TestBed.createComponent(AddPropertyPageComponent).componentInstance;
    service = TestBed.inject(
      PropertyCreateService,
    ) as unknown as FakePropertyCreateService;
  });

  it('breadcrumb уже заканчивается выбранным узлом → leaf НЕ дублируется', async () => {
    spyOn(service, 'locationInfo').and.resolveTo(
      makeInfo([
        { id: 'c0', name: 'Dubai', level: 'city' },
        { id: 'c1', name: 'JBR', level: 'community' },
        { id: 'b1', name: 'Sadaf 4', level: 'building' }, // self уже в конце
      ]),
    );
    await component.pickLocation('b1');
    const path = component.addrPath();
    expect(path.map((p) => p.id)).toEqual(['c0', 'c1', 'b1']);
    expect(path.filter((p) => p.id === 'b1').length).toBe(1);
  });

  it('breadcrumb без выбранного узла → self аппендится в конец', async () => {
    spyOn(service, 'locationInfo').and.resolveTo(
      makeInfo([
        { id: 'c0', name: 'Dubai', level: 'city' },
        { id: 'c1', name: 'JBR', level: 'community' },
      ]),
    );
    await component.pickLocation('b1');
    expect(component.addrPath().map((p) => p.id)).toEqual(['c0', 'c1', 'b1']);
  });
});

// ─── revealIndexFromFraction (U-0a) ──────────────────────────────────────────
describe('revealIndexFromFraction', () => {
  // n=4 уровня, точки в центрах сегментов: 0→1/8, 1→3/8, 2→5/8, 3→7/8.

  it('fraction=0 (крайний левый) → minIndex, когда 0 < minIndex (клам слева)', () => {
    // minIndex=1, n=4: idx=Math.round(0*4-0.5)=Math.round(-0.5)=0 → клам к 1
    expect(revealIndexFromFraction(0, 4, 1)).toBe(1);
  });

  it('fraction=0 → 0, когда minIndex=0 (нет ограничения)', () => {
    expect(revealIndexFromFraction(0, 4, 0)).toBe(0);
  });

  it('fraction в центре первого сегмента (1/8) → 0 (если ≥ minIndex)', () => {
    // fraction=0.125, n=4: idx=Math.round(0.125*4-0.5)=Math.round(0)=0
    expect(revealIndexFromFraction(0.125, 4, 0)).toBe(0);
  });

  it('fraction в центре среднего сегмента (5/8) → 2', () => {
    // fraction=0.625, n=4: idx=Math.round(0.625*4-0.5)=Math.round(2)=2
    expect(revealIndexFromFraction(0.625, 4, 0)).toBe(2);
  });

  it('fraction=1 (крайний правый) → n-1 (клам справа)', () => {
    // idx=Math.round(1*4-0.5)=Math.round(3.5)=4 → клам к 3
    expect(revealIndexFromFraction(1, 4, 0)).toBe(3);
  });

  it('fraction > 1 (за правой границей) → n-1', () => {
    expect(revealIndexFromFraction(2, 4, 0)).toBe(3);
  });

  it('fraction < 0 (за левой границей) → minIndex', () => {
    expect(revealIndexFromFraction(-0.5, 4, 1)).toBe(1);
  });

  it('n=2: левая половина → 0, правая → 1', () => {
    expect(revealIndexFromFraction(0.25, 2, 0)).toBe(0);
    expect(revealIndexFromFraction(0.75, 2, 0)).toBe(1);
  });
});

// ─── Девелопер-автокомплит: AP-5 ─────────────────────────────────────────────
describe('AddPropertyPageComponent — developer-автокомплит (AP-5)', () => {
  let component: AddPropertyPageComponent;

  const fakeDev = (): DeveloperSearchItem => ({
    id: 'dev-1',
    name: 'Emaar Properties',
    logo_url: null,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  // ── showDeveloperField ────────────────────────────────────────────────────

  it('showDeveloperField() === false, когда не leaf', () => {
    component.locationId.set(null);
    component.buildingInfo.set(null);
    expect(component.showDeveloperField()).toBeFalse();
  });

  it('showDeveloperField() === false, когда leaf и buildingInfo !== null', () => {
    component.locationId.set('leaf-id');
    component.buildingInfo.set(activeBuildingInfo());
    expect(component.showDeveloperField()).toBeFalse();
  });

  it('showDeveloperField() === true, когда leaf и buildingInfo === null', () => {
    component.locationId.set('leaf-id');
    component.buildingInfo.set(null);
    expect(component.showDeveloperField()).toBeTrue();
  });

  // ── pickDeveloper ────────────────────────────────────────────────────────

  it('pickDeveloper: устанавливает pickedDeveloperId и pickedDeveloperName', () => {
    component.pickDeveloper(fakeDev());
    expect(component.pickedDeveloperId()).toBe('dev-1');
    expect(component.pickedDeveloperName()).toBe('Emaar Properties');
  });

  it('pickDeveloper: очищает devResults и devQuery', () => {
    component.devResults.set([fakeDev()]);
    component.devQuery.set('Emaar');
    component.pickDeveloper(fakeDev());
    expect(component.devResults()).toEqual([]);
    expect(component.devQuery()).toBe('');
  });

  // ── clearDeveloper ───────────────────────────────────────────────────────

  it('clearDeveloper: сбрасывает pickedDeveloperId и pickedDeveloperName', () => {
    component.pickDeveloper(fakeDev());
    component.clearDeveloper();
    expect(component.pickedDeveloperId()).toBeNull();
    expect(component.pickedDeveloperName()).toBeNull();
  });

  it('clearDeveloper: очищает devQuery и devResults', () => {
    component.devQuery.set('Emaar');
    component.devResults.set([fakeDev()]);
    component.clearDeveloper();
    expect(component.devQuery()).toBe('');
    expect(component.devResults()).toEqual([]);
  });

  // ── resetLocation сбрасывает developer-состояние ─────────────────────────

  it('resetLocation: сбрасывает picked-developer', () => {
    component.pickDeveloper(fakeDev());
    component.resetLocation();
    expect(component.pickedDeveloperId()).toBeNull();
    expect(component.pickedDeveloperName()).toBeNull();
  });

  it('resetLocation: очищает devQuery и devResults', () => {
    component.devQuery.set('Emaar');
    component.devResults.set([fakeDev()]);
    component.resetLocation();
    expect(component.devQuery()).toBe('');
    expect(component.devResults()).toEqual([]);
  });
});

// ─── Новые поля: is_study / original_price / cheques ─────────────────────────
describe('AddPropertyPageComponent — новые поля формы', () => {
  let component: AddPropertyPageComponent;
  let create: FakePropertyCreateService;

  beforeEach(async () => {
    create = new FakePropertyCreateService();
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useValue: create },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('onOriginalPriceInput форматирует с разделителями тысяч', () => {
    component.onOriginalPriceInput('1400000');
    expect(component.originalPrice()).toBe('1,400,000');
  });

  it('chequeOptions = [1,2,3,4,6,12]', () => {
    expect([...component.chequeOptions]).toEqual([1, 2, 3, 4, 6, 12]);
  });

  it('payload (sale): пишет original_price, cheques=null, is_study', async () => {
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });
    const auth = TestBed.inject(MrsqmAuthService);
    (auth as unknown as { currentUser: () => unknown }).currentUser = () => ({
      id: 'u1',
    });
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.locationId.set('loc1');
    component.step.set(7);
    component.dealType.set('sale');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set('fl1');
    component.isStudy.set(true);
    component.originalPrice.set('1,400,000');
    component.price.set('1,200,000');
    await component.submit();
    const payload = captured[0] as {
      original_price: number | null;
      cheques: number | null;
      is_study: boolean;
    };
    expect(payload.original_price).toBe(1_400_000);
    expect(payload.cheques).toBeNull();
    expect(payload.is_study).toBe(true);
  });

  it('payload (rent): пишет cheques, original_price=null', async () => {
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });
    const auth = TestBed.inject(MrsqmAuthService);
    (auth as unknown as { currentUser: () => unknown }).currentUser = () => ({
      id: 'u1',
    });
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.locationId.set('loc1');
    component.step.set(7);
    component.dealType.set('rent');
    component.bedrooms.set(1);
    component.bathrooms.set(1);
    component.areaSqft.set('800');
    component.floorLevelId.set('fl1');
    component.cheques.set(4);
    component.originalPrice.set('999,000');
    component.price.set('90,000');
    await component.submit();
    const payload = captured[0] as {
      original_price: number | null;
      cheques: number | null;
    };
    expect(payload.cheques).toBe(4);
    expect(payload.original_price).toBeNull();
  });
});

// ─── yearOptions (V-6) ────────────────────────────────────────────────────────
describe('AddPropertyPageComponent — yearOptions (V-6)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('yearOptions() возвращает ровно 6 значений', () => {
    expect(component.yearOptions().length).toBe(6);
  });

  it('yearOptions() первое значение — текущий год строкой', () => {
    const currentYear = new Date().getFullYear();
    expect(component.yearOptions()[0]).toBe(String(currentYear));
  });

  it('yearOptions() последнее значение — текущий год + 5 строкой', () => {
    const currentYear = new Date().getFullYear();
    expect(component.yearOptions()[5]).toBe(String(currentYear + 5));
  });

  it('yearOptions() содержит строки (не числа)', () => {
    for (const y of component.yearOptions()) {
      expect(typeof y).toBe('string');
    }
  });
});

// ─── Этаж обязателен (apartment floor_level, house floors_in_unit) ───────────
describe('AddPropertyPageComponent — обязательный этаж (шаг 2)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('apartment без floorLevelId → ошибка', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set(null);
    expect(typeof (component as any)._validateStep()).toBe('string');
  });

  it('house без floorsInUnit → ошибка', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [{ id: 'house', value: 'house', label_en: 'House', parent_id: null }],
    } as unknown as FilterOptions);
    component.unitTypeId.set('house');
    component.bedrooms.set(3);
    component.bathrooms.set(2);
    component.areaSqft.set('2500');
    component.floorsInUnit.set(null);
    expect(typeof (component as any)._validateStep()).toBe('string');
  });

  it('house с floorsInUnit (id) и площадью → null', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [{ id: 'house', value: 'house', label_en: 'House', parent_id: null }],
    } as unknown as FilterOptions);
    component.unitTypeId.set('house');
    component.bedrooms.set(3);
    component.bathrooms.set(2);
    component.areaSqft.set('2500');
    component.floorsInUnit.set('fiu-uuid');
    expect((component as any)._validateStep()).toBeNull();
  });
});

// ─── Расположение: два взаимоисключающих набора ──────────────────────────────
describe('AddPropertyPageComponent — позиции (наборы)', () => {
  let component: AddPropertyPageComponent;

  const POS = [
    { id: 'b2b', value: 'back_to_back', label_en: 'Back to Back', parent_id: null },
    { id: 'sr', value: 'single_row', label_en: 'Single Row', parent_id: null },
    { id: 'mid', value: 'middle', label_en: 'Middle', parent_id: null },
    { id: 'cor', value: 'corner', label_en: 'Corner', parent_id: null },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useClass: FakeFormAService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
    // Ждём, пока _loadOptions завершится, и затем подменяем options под тест.
    await Promise.resolve();
    component.options.set({
      ...FAKE_OPTIONS,
      positions: POS,
      unit_types: [
        { id: 'house', value: 'house', label_en: 'House', parent_id: null },
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
  });

  it('house: оба набора доступны', () => {
    component.unitTypeId.set('house');
    expect(component.positionRowOptions().map((p) => p.value)).toEqual([
      'back_to_back',
      'single_row',
    ]);
    expect(component.positionUnitOptions().map((p) => p.value)).toEqual([
      'middle',
      'corner',
    ]);
  });

  it('apartment: только middle/corner', () => {
    component.unitTypeId.set('apt');
    expect(component.positionRowOptions()).toEqual([]);
    expect(component.positionUnitOptions().map((p) => p.value)).toEqual([
      'middle',
      'corner',
    ]);
  });

  it('togglePosition: выбор второго из набора снимает первый', () => {
    component.unitTypeId.set('house');
    component.togglePosition('b2b');
    expect(component.positionIds()).toEqual(['b2b']);
    component.togglePosition('sr'); // тот же набор → b2b снимается
    expect(component.positionIds()).toEqual(['sr']);
  });

  it('togglePosition: наборы независимы (можно по одному из каждого)', () => {
    component.unitTypeId.set('house');
    component.togglePosition('sr');
    component.togglePosition('mid');
    expect(component.positionIds().sort()).toEqual(['mid', 'sr']);
  });

  it('togglePosition: повторный клик снимает выбор', () => {
    component.unitTypeId.set('house');
    component.togglePosition('mid');
    component.togglePosition('mid');
    expect(component.positionIds()).toEqual([]);
  });
});

// ─── SP-B: Form A — onFormAFile, submit, статус official ─────────────────────
describe('AddPropertyPageComponent — Form A (SP-B)', () => {
  let component: AddPropertyPageComponent;
  let create: FakePropertyCreateService;
  let formA: FakeFormAService;

  const makePdfFile = (): File =>
    new File(['%PDF'], 'form-a.pdf', { type: 'application/pdf' });
  const makeNonPdfFile = (): File =>
    new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

  const setupOwner = (): void => {
    const auth = TestBed.inject(MrsqmAuthService);
    (auth as unknown as { currentUser: () => unknown }).currentUser = () => ({
      id: 'owner-1',
    });
  };

  const setRequiredFields = (): void => {
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.locationId.set('loc-1');
    component.step.set(7);
    component.dealType.set('sale');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set('fl-1');
    component.price.set('1,200,000');
  };

  beforeEach(async () => {
    create = new FakePropertyCreateService();
    formA = new FakeFormAService();

    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useValue: create },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: PropertyFormAService, useValue: formA },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        { provide: SnackService, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: PanelContentService,
          useValue: { openProperty: jasmine.createSpy('openProperty') },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  // ── onFormAFile ────────────────────────────────────────────────────────────

  it('onFormAFile: принимает PDF-файл', () => {
    const file = makePdfFile();
    const input = { files: [file], value: '' } as unknown as HTMLInputElement;
    const event = { target: input } as unknown as Event;
    component.onFormAFile(event);
    expect(component.formAFile()).toBe(file);
    expect(component.formAFileName()).toBe('form-a.pdf');
  });

  it('onFormAFile: отклоняет не-PDF и сбрасывает сигнал', () => {
    component.formAFile.set(makePdfFile());
    component.formAFileName.set('old.pdf');
    const nonPdf = makeNonPdfFile();
    const input = { files: [nonPdf], value: '' } as unknown as HTMLInputElement;
    const event = { target: input } as unknown as Event;
    component.onFormAFile(event);
    expect(component.formAFile()).toBeNull();
    expect(component.formAFileName()).toBe('');
  });

  it('onFormAFile: при пустом выборе сбрасывает файл', () => {
    const input = { files: [], value: '' } as unknown as HTMLInputElement;
    const event = { target: input } as unknown as Event;
    component.onFormAFile(event);
    expect(component.formAFile()).toBeNull();
  });

  // ── official submit: payload без title_deed-ключей, вызов uploadFormA + insertFormA ──

  it('official-submit: payload не содержит title_deed-ключей', async () => {
    setupOwner();
    setRequiredFields();
    spyOn(create, 'createProperty').and.callFake(async (_p: unknown) => 'new-id');
    spyOn(formA, 'uploadFormA').and.resolveTo('owner-1/new-id/uuid.pdf');
    spyOn(formA, 'insertFormA').and.resolveTo();

    component.listingType.set('official');
    component.visibility.set('public');
    component.contractNumber.set('CN-001');
    component.contractStart.set('2026-07-01');
    component.contractEnd.set('2027-07-01');
    component.formAFile.set(makePdfFile());

    await component.submit();

    const payload = (create.createProperty as jasmine.Spy).calls.mostRecent()
      .args[0] as Record<string, unknown>;
    expect('title_deed_number' in payload).toBeFalse();
    expect('title_deed_year' in payload).toBeFalse();
    expect('plot_number' in payload).toBeFalse();
    expect('municipality_number' in payload).toBeFalse();
  });

  it('official-submit: вызывает uploadFormA и insertFormA', async () => {
    setupOwner();
    setRequiredFields();
    spyOn(create, 'createProperty').and.resolveTo('new-id');
    const uploadSpy = spyOn(formA, 'uploadFormA').and.resolveTo(
      'owner-1/new-id/uuid.pdf',
    );
    const insertSpy = spyOn(formA, 'insertFormA').and.resolveTo();

    const pdfFile = makePdfFile();
    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.formAFile.set(pdfFile);

    await component.submit();

    expect(uploadSpy).toHaveBeenCalledWith('new-id', 'owner-1', pdfFile);
    expect(insertSpy).toHaveBeenCalled();
    const insertArg = insertSpy.calls.mostRecent().args[0] as Record<string, unknown>;
    expect(insertArg['property_id']).toBe('new-id');
    expect(insertArg['uploaded_by']).toBe('owner-1');
    expect('pdf_password' in insertArg).toBeTrue();
  });

  // ── status = pending_review для official (в том числе при network-visibility) ──

  it('official + network → status = pending_review', async () => {
    setupOwner();
    setRequiredFields();
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });
    spyOn(formA, 'uploadFormA').and.resolveTo('path');
    spyOn(formA, 'insertFormA').and.resolveTo();

    component.listingType.set('official');
    component.visibility.set('network');
    component.contractNumber.set('CN-001');
    component.formAFile.set(makePdfFile());

    await component.submit();

    const payload = captured[0] as Record<string, unknown>;
    expect(payload['status']).toBe('pending_review');
  });

  it('pocket + network → status = active', async () => {
    setupOwner();
    setRequiredFields();
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });

    component.listingType.set('pocket');
    component.visibility.set('network');

    await component.submit();

    const payload = captured[0] as Record<string, unknown>;
    expect(payload['status']).toBe('active');
  });

  it('pocket + public → status = pending_review', async () => {
    setupOwner();
    setRequiredFields();
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });

    component.listingType.set('pocket');
    component.visibility.set('public');

    await component.submit();

    const payload = captured[0] as Record<string, unknown>;
    expect(payload['status']).toBe('pending_review');
  });

  // ── is_exclusive в payload ────────────────────────────────────────────────

  it('official + isExclusive=true → payload.is_exclusive = true', async () => {
    setupOwner();
    setRequiredFields();
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });
    spyOn(formA, 'uploadFormA').and.resolveTo('path');
    spyOn(formA, 'insertFormA').and.resolveTo();

    component.listingType.set('official');
    component.isExclusive.set(true);
    component.contractNumber.set('CN-001');
    component.formAFile.set(makePdfFile());

    await component.submit();

    const payload = captured[0] as Record<string, unknown>;
    expect(payload['is_exclusive']).toBe(true);
  });

  it('pocket → payload.is_exclusive = false', async () => {
    setupOwner();
    setRequiredFields();
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });

    component.listingType.set('pocket');
    component.isExclusive.set(true); // игнорируется для pocket

    await component.submit();

    const payload = captured[0] as Record<string, unknown>;
    expect(payload['is_exclusive']).toBe(false);
  });

  // ── SP-B баг: сбой Form A — НЕ уходить в ленту (failure-mode) ───────────

  it('official-submit: uploadFormA реджектит → error выставлена, navigate НЕ вызван', async () => {
    setupOwner();
    setRequiredFields();
    spyOn(create, 'createProperty').and.resolveTo('new-id');
    spyOn(formA, 'uploadFormA').and.rejectWith(new Error('Storage error'));
    spyOn(formA, 'insertFormA').and.resolveTo();
    const router = TestBed.inject(Router);

    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.formAFile.set(makePdfFile());

    await component.submit();

    expect(component.error()).toContain('Объект сохранён');
    expect(router.navigateByUrl).not.toHaveBeenCalledWith('/mrsqm/feed');
  });

  it('official-submit: insertFormA реджектит → error выставлена, navigate НЕ вызван', async () => {
    setupOwner();
    setRequiredFields();
    spyOn(create, 'createProperty').and.resolveTo('new-id');
    spyOn(formA, 'uploadFormA').and.resolveTo('owner-1/new-id/uuid.pdf');
    spyOn(formA, 'insertFormA').and.rejectWith(new Error('DB error'));
    const router = TestBed.inject(Router);

    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.formAFile.set(makePdfFile());

    await component.submit();

    expect(component.error()).toContain('Объект сохранён');
    expect(router.navigateByUrl).not.toHaveBeenCalledWith('/mrsqm/feed');
  });

  it('official-submit: успех → navigate вызван с /mrsqm/feed (happy-path)', async () => {
    setupOwner();
    setRequiredFields();
    spyOn(create, 'createProperty').and.resolveTo('new-id');
    spyOn(formA, 'uploadFormA').and.resolveTo('owner-1/new-id/uuid.pdf');
    spyOn(formA, 'insertFormA').and.resolveTo();
    const router = TestBed.inject(Router);

    component.listingType.set('official');
    component.contractNumber.set('CN-001');
    component.formAFile.set(makePdfFile());

    await component.submit();

    expect(component.error()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/mrsqm/feed');
  });
});
