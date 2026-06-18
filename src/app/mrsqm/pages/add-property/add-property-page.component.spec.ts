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
  async uploadAndAttach(_id: string, _files: File[]): Promise<void> {}
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
