import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AddPropertyPageComponent } from './add-property-page.component';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { MrsqmAuthService } from '../../services/auth.service';
import {
  BuildingInfo,
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
  async searchLocations(_query: string): Promise<LocationSearchItem[]> {
    return [];
  }
  async locationInfo(_id: string): Promise<LocationInfo | null> {
    return null;
  }
  async createProperty(_payload: unknown): Promise<string> {
    return 'new-id';
  }
}

// Стаб PropertyPhotoService.
class FakePhotoService {
  async uploadAndAttach(_id: string, _files: File[], _fp: File[] = []): Promise<void> {}
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
        { provide: MrsqmAuthService, useClass: FakeAuthService },
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

  // ── _validateStep: гейт шага 5 (Листинг) ────────────────────────────────

  it('шаг 5 (Листинг): official без titleDeedNumber → возвращает ошибку', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.titleDeedNumber.set('');
    const result = (component as any)._validateStep(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  it('шаг 5 (Листинг): official c titleDeedNumber → возвращает null', () => {
    component.step.set(5);
    component.listingType.set('official');
    component.titleDeedNumber.set('TD-123456');
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
        { provide: MrsqmAuthService, useClass: FakeAuthService },
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
        { provide: MrsqmAuthService, useClass: FakeAuthService },
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
        { provide: MrsqmAuthService, useClass: FakeAuthService },
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
