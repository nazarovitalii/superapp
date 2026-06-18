// Какие поля показывать на шаге «Параметры» для каждого типа объекта.
// Ключ — value unit_type из get_filter_options (живая БД, сверено 2026-06-15).
// Матрица согласована с создателем (docs/property-fields-matrix.csv); там, где
// живая таксономия БД расходится с CSV (напр. hotel_apartment в БД — коммерческий
// тип, а не подтип Apartment), берём реальные value БД.

export interface TypeFields {
  subType: boolean; // выбор подтипа (apartment / house)
  rooms: boolean; // спальни + санузлы
  maid: boolean; // чекбокс is_maid «Maid room»
  hotelPool: boolean; // чекбокс is_hotel_pool «Hotel apartment»
  vastu: boolean; // чекбокс is_vastu «Vastu»
  bua: boolean; // площадь BUA (area_sqft)
  plot: boolean; // площадь участка (plot_sqft)
  floorLevel: boolean; // Low / Middle / High (floor_level_id)
  floorsInUnit: boolean; // G+0…G+3 (дома)
  layout: boolean; // планировка из справочника комьюнити (layout_id)
  views: boolean; // виды из окна (мультиселект)
  positions: boolean; // расположение (мультиселект)
  amenities: boolean; // удобства (мультиселект)
  furnished: boolean; // меблировка
}

const NONE: TypeFields = {
  subType: false,
  rooms: false,
  maid: false,
  hotelPool: false,
  vastu: false,
  bua: false,
  plot: false,
  floorLevel: false,
  floorsInUnit: false,
  layout: false,
  views: false,
  positions: false,
  amenities: false,
  furnished: false,
};

const f = (over: Partial<TypeFields>): TypeFields => ({ ...NONE, ...over });

// Конфиг по value unit_type. Незнакомые типы → дефолт (площадь + меблировка).
const CONFIG: Record<string, TypeFields> = {
  // ── Residential ──────────────────────────────────────────────────────────
  apartment: f({
    subType: true,
    rooms: true,
    maid: true,
    hotelPool: true,
    vastu: true,
    bua: true,
    floorLevel: true,
    views: true,
    positions: true,
    amenities: true,
    furnished: true,
  }),
  house: f({
    subType: true,
    rooms: true,
    maid: true,
    vastu: true,
    bua: true,
    plot: true,
    floorsInUnit: true,
    layout: true,
    views: true,
    positions: true,
    amenities: true,
    furnished: true,
  }),
  land: f({ plot: true }),
  floor: f({ bua: true }),
  bulk_unit: f({ bua: true }),
  building: f({ bua: true, plot: true }),

  // ── Commercial ───────────────────────────────────────────────────────────
  // hotel_apartment в живой БД — коммерческий тип; ведёт себя как апартаменты.
  hotel_apartment: f({
    rooms: true,
    hotelPool: true,
    bua: true,
    floorLevel: true,
    views: true,
    furnished: true,
  }),
  office: f({
    bua: true,
    floorLevel: true,
    views: true,
    furnished: true,
  }),
  shop: f({ bua: true, plot: true }),
  retail: f({ bua: true }),
  warehouse: f({ bua: true, plot: true }),
  labour_camp: f({ bua: true, plot: true }),
  villa_commercial: f({
    bua: true,
    plot: true,
    views: true,
    amenities: true,
    furnished: true,
  }),
  bulk_unit_commercial: f({ bua: true }),
  land_commercial: f({ plot: true }),
  floor_commercial: f({ bua: true }),
  building_commercial: f({ bua: true, plot: true }),
  factory: f({ bua: true, plot: true }),
  industrial_land: f({ plot: true }),
  mixed_use_land: f({ plot: true }),
  showroom: f({ bua: true }),
  other_commercial: f({ bua: true, furnished: true }),
};

const DEFAULT_FIELDS: TypeFields = f({ bua: true, furnished: true });

// Поля для выбранного типа. value === null → пусто (тип ещё не выбран).
export const typeFieldsFor = (unitTypeValue: string | null | undefined): TypeFields =>
  unitTypeValue ? (CONFIG[unitTypeValue] ?? DEFAULT_FIELDS) : NONE;
