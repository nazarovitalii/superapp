export type UserRole = 'agent' | 'admin' | 'moderator' | 'superadmin';
export type Plan = 'free' | 'pro';

// Профиль пользователя из таблицы `users` (id = auth.uid()).
// Только поля, нужные клиенту; чтение под RLS users_select_own.
export interface MrsqmUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}

// Денормализованный профиль из VIEW/таблицы user_context (страница профиля).
// Бейдж/score не включаем — система бейджей вне MVP.
export interface UserProfile {
  full_name: string | null;
  agency_name: string | null;
  agency_members_count: number | null;
  emirate_name: string | null;
  plan: string | null;
  subscription_status: string | null;
  plan_expires_at: string | null;
  referral_code: string | null;
  referrals_count: number | null;
  friends_count: number | null;
  comments_count: number | null;
  saved_filters_count: number | null;
  total_searches: number | null;
  active_listings: number | null;
  total_listings_ever: number | null;
  broker_license: string | null;
  broker_license_expiry: string | null;
  channel_origin: string | null;
  whatsapp_verified: boolean | null;
  last_active_at: string | null;
  created_at_user: string | null;
}

// Контактные поля из таблицы users (отдельно — другой источник).
export interface UserContacts {
  phone: string | null;
  whatsapp_phone: string | null;
  tg_username: string | null;
  email: string | null;
}

// Мой объект (прямой запрос к properties под RLS owner_id=auth.uid()).
// Берём свои объекты любого статуса (включая draft/pending) — get_agent_listings
// сейчас сломан (превышение лимита аргументов jsonb_build_object).
export interface MyListing {
  id: string;
  deal_type: DealType;
  listing_type: string;
  status: PropertyStatus;
  visibility: string;
  price: number;
  price_currency: string;
  price_period: string | null;
  bedrooms: number | null;
  area_sqft: number | null;
  unit_type_id: string | null;
  created_at: string;
  location_name: string | null;
}

export type SubStatus = 'active' | 'expired';
export type DealType = 'sale' | 'rent';
export type ListingType = 'official' | 'pocket';

// ─── Справочники из RPC get_filter_options ───────────────────────────────
// Опция со строковым value (deal_type, listing_type, handover, occupancy, period).
export interface FilterOptionValue {
  value: string;
  label_en: string;
  label_ar?: string | null;
}
// Опция с uuid id (category, unit_type, sub_type, furnished). parent_id — иерархия.
export interface FilterOptionId {
  id: string;
  value: string;
  label_en: string;
  label_ar?: string | null;
  parent_id?: string | null;
}
// Числовая опция (bedrooms, bathrooms).
export interface FilterOptionNum {
  value: number;
  label_en: string;
}

export interface FilterOptions {
  categories: FilterOptionId[];
  unit_types: FilterOptionId[];
  sub_types: FilterOptionId[];
  deal_types: FilterOptionValue[];
  listing_types: FilterOptionValue[];
  furnished_options: FilterOptionId[];
  handover_options: FilterOptionValue[];
  occupancy_options: FilterOptionValue[];
  price_periods: FilterOptionValue[];
  bedrooms: FilterOptionNum[];
  bathrooms: FilterOptionNum[];
  // Доп. справочники для формы добавления (поля по типам объектов).
  views: FilterOptionId[];
  positions: FilterOptionId[];
  amenities: FilterOptionId[];
  floor_levels: FilterOptionId[];
  floors_in_unit_apt: FilterOptionId[];
  floors_in_unit_house: FilterOptionId[];
  completion_quarters: FilterOptionValue[];
}

// ─── RPC search_locations (p_mode='info') — каскад адреса ─────────────────
export interface LocationChild {
  id: string;
  name: string;
  level: string;
  stats_listings: number;
}
export interface LocationBreadcrumbItem {
  level: string;
  id: string;
  name: string;
}
export interface LocationInfo {
  location: {
    id: string;
    name: string;
    level: string;
    lat: number | null;
    lng: number | null;
    is_popular: boolean;
    completion_status: string | null;
    developer_ids: string[];
  };
  breadcrumb: LocationBreadcrumbItem[];
  children: LocationChild[];
}

// Building info из location_developers по leaf-локации (read-only блок формы).
export interface BuildingInfo {
  project_name: string | null;
  built_year: number | null;
  completion_year: number | null;
  completion_q: string | null;
  total_floors: number | null;
  total_units: number | null;
  project_status: string | null;
}

// Планировка из справочника комьюнити (community_layouts).
export interface CommunityLayout {
  id: string;
  name: string;
}

// Строка для INSERT в property_photos после загрузки в Storage.
export interface PropertyPhotoInsert {
  property_id: string;
  photo_type: string; // gallery | primary | floor_plan | exterior | interior
  order_index: number;
  full_url: string;
  thumb_url: string;
  width: number | null;
  height: number | null;
  file_size_kb: number | null;
}

// ─── Результат RPC search_locations (p_mode='search') ────────────────────
export interface LocationSearchItem {
  id: string;
  name: string;
  level: string;
  city_name: string | null;
  community_name: string | null;
}

// ─── Payload для INSERT в properties (под RLS owner_id = auth.uid()) ──────
// owner_id не передаём — ставится из auth.uid() на клиенте перед вставкой.
export interface PropertyInsert {
  owner_id: string;
  location_id: string;
  // Уровень адреса, раскрываемый публично (бегунок). NULL = полный адрес.
  public_location_id: string | null;
  category_id: string | null;
  unit_type_id: string | null;
  sub_type_id: string | null;
  deal_type: DealType;
  listing_type: string;
  price: number;
  price_currency: string;
  price_period: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  is_maid: boolean;
  is_hotel_pool: boolean;
  is_vastu?: boolean | null;
  area_sqft: number | null;
  area_sqm: number | null;
  plot_sqft: number | null;
  plot_sqm: number | null;
  floor_number: number | null;
  floor_level_id: string | null;
  floors_in_unit: string | null;
  layout_id: string | null;
  view_ids: string[] | null;
  position_ids: string[] | null;
  amenity_ids: string[] | null;
  furnished: string | null;
  handover: string | null;
  occupancy_status: string | null;
  lease_until: string | null; // дата «занято до» (occupied), YYYY-MM-01
  developer_id: string | null;
  completion_year: number | null;
  completion_q: string | null;
  is_distress: boolean;
  is_negotiable: boolean;
  title_deed_number: string | null;
  title_deed_year: number | null;
  plot_number: string | null;
  municipality_number: string | null;
  visibility: string;
  // status: network → 'active' сразу, public → 'pending_review' (модерация).
  // Модерации в БД нет — статус задаёт клиент по visibility (продуктовое правило).
  status: PropertyStatus;
  description: string | null;
}
// Значения сверены с CHECK-констрейнтами БД (properties_*_check).
export type Furnished = 'furnished' | 'unfurnished';
export type Handover = 'ready' | 'offplan';
export type OccupancyStatus = 'vacant' | 'occupied' | 'vacant_on_transfer';
export type Visibility = 'public' | 'network';
// properties_status_check — 7 значений; объект создаётся в 'draft'.
export type PropertyStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'rejected'
  | 'expired'
  | 'archived_sold'
  | 'archived_withdrawn';

export interface PropertyFeedItem {
  id: string;
  owner_id: string;
  deal_type: DealType;
  listing_type: ListingType;
  // property_type — НЕ из get_feed (там unit_type_id uuid); резолвится в ленте
  // в название через get_filter_options. location_level — уровень leaf-локации.
  property_type: string | null;
  unit_type_id?: string | null;
  sub_type_id?: string | null;
  location_level?: string | null;
  price: number;
  price_currency: string;
  price_period: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  // Комната прислуги — суффикс «+m» к беды в строке ленты.
  is_maid?: boolean | null;
  area_sqft: number | null;
  // Площадь участка — для домов/вилл (выводим под BUA в карточке).
  plot_sqft?: number | null;
  location_name: string | null;
  community_name: string | null;
  // Кол-во комментариев — иконка комментариев в строке ленты при > 0.
  comments_count?: number | null;
  description: string | null;
  furnished: Furnished | null;
  handover: Handover | null;
  is_distress: boolean;
  // Предыдущая цена — если > price, в строке показываем старую зачёркнутой.
  previous_price?: number | null;
  photos: string[] | null;
  // Флаг «есть фото» из get_feed (EXISTS на property_photos) — иконка 📷.
  has_photos?: boolean | null;
  published_at: string;
  // Дата актуализации (поднимает объект в ленте) и видимость — есть в jsonb get_feed.
  last_actualized_at?: string | null;
  visibility?: string | null;
  owner_full_name: string | null;
  owner_photo_url: string | null;
  owner_agency_name: string | null;
  is_network: boolean;
  developer_name: string | null;
}

// Агент-владелец объекта — вложенный объект `agent` в ответе get_property.
// Контакты (whatsapp_phone, broker_license) БД отдаёт по правам (свой/Pro/сеть),
// иначе NULL — клиент эту логику НЕ дублирует.
export interface PropertyAgent {
  id: string;
  full_name: string | null;
  tg_username: string | null;
  whatsapp_phone: string | null;
  photo_url: string | null;
  about: string | null;
  languages: string[] | null;
  agency_name: string | null;
  emirate_name: string | null;
  broker_license: string | null;
  // Кол-во активных листингов агента (слой 2b).
  active_listings_count: number | null;
}

// Проект из таблицы location_developers — вложенный объект `project` в ответе get_property.
// Null если для leaf-локации нет строки в location_developers (норма для не-Damac районов).
export interface PropertyProject {
  project_group_name: string | null;
  project_name: string | null;
  is_building: boolean | null;
  developer_name: string | null;
  project_status: string | null;
  built_year: number | null;
  completion_q: string | null;
  completion_year: number | null;
}

// Фото объекта из таблицы property_photos (прямой select под RLS photos_select).
export interface PropertyPhoto {
  full_url: string;
  thumb_url: string;
  order_index: number;
  photo_type: string;
}

// Полная карточка объекта — ответ RPC get_property (jsonb).
// Поля сверены с docs/database.md (get_property): плоские поля properties + локация
// + девелопер + флаги + вложенный agent{}. НЕ содержит photos (грузятся отдельно).
export interface PropertyDetail {
  id: string;
  owner_id: string;
  unit_id: string | null;
  location_id: string | null;
  category_id: string | null;
  unit_type_id: string | null;
  sub_type_id: string | null;
  listing_type: ListingType;
  deal_type: DealType;
  price: number;
  previous_price: number | null;
  price_currency: string;
  price_period: string | null;
  price_changed_at: string | null;
  is_negotiable: boolean | null;
  commission_included: boolean | null;
  visibility: string | null;
  status: PropertyStatus;
  bedrooms: number | null;
  bathrooms: number | null;
  is_maid: boolean | null;
  is_hotel_pool: boolean | null;
  area_sqft: number | null;
  area_sqm: number | null;
  plot_sqft: number | null;
  plot_sqm: number | null;
  floor_number: number | null;
  floor_level_id: string | null;
  floors_in_unit: string | null;
  layout_id: string | null;
  view_ids: string[] | null;
  position_ids: string[] | null;
  amenity_ids: string[] | null;
  furnished: Furnished | null;
  lat: number | null;
  lng: number | null;
  is_distress: boolean;
  occupancy_status: string | null;
  lease_until: string | null;
  description: string | null;
  title_deed_number: string | null;
  title_deed_year: number | null;
  plot_number: string | null;
  municipality_number: string | null;
  developer_id: string | null;
  developer_name: string | null;
  // d.name из JOIN developers (девелопер-справочник) + логотип.
  developer_name_ref: string | null;
  developer_logo_url: string | null;
  handover: Handover | null;
  completion_year: number | null;
  completion_q: string | null;
  last_actualized_at: string | null;
  published_at: string | null;
  views_count: number | null;
  unique_views_count: number | null;
  impressions_count: number | null;
  contacts_count: number | null;
  comments_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  location_name: string | null;
  location_level: string | null;
  location_full_path: string | null;
  // Уровень адреса, раскрытый публично (бегунок); null = полный адрес скрыт.
  public_location_path: string | null;
  // Флаг Vastu — суффикс «+vastu» к числу спален.
  is_vastu: boolean | null;
  is_network: boolean;
  is_owner: boolean;
  agent: PropertyAgent | null;
  // Проект из location_developers (слой 2b); null = локация не привязана к девелоперу.
  project: PropertyProject | null;
  // Ошибка доступа: get_property возвращает { error, property_id } вместо объекта.
  error?: string;
}

// Ответ RPC get_feed — сверено с живой схемой: только эти 4 ключа.
export interface FeedResponse {
  results: PropertyFeedItem[];
  count_total: number;
  limit: number;
  offset: number;
}

// Параметры get_feed, которые шлёт лента (подмножество; остальное — DEFAULT NULL).
// p_user_id НЕ передаём — RPC берёт auth.uid() из JWT.
// type (не interface) + index signature — чтобы был совместим с rpc(Record<string,unknown>).
export type FeedParams = {
  p_deal_type: DealType;
  p_limit: number;
  p_offset: number;
  p_unit_type_id?: string | null;
  p_bedrooms?: number[] | null;
  p_bathrooms?: number[] | null;
  p_price_min?: number | null;
  p_price_max?: number | null;
  p_area_sqft_min?: number | null;
  p_area_sqft_max?: number | null;
  p_furnished?: string | null;
  p_handover?: string | null;
  p_listing_type?: string | null;
  // default | price_asc | price_desc | date_asc | date_desc (см. get_feed ORDER BY)
  p_sort_by?: string;
  p_category_id?: string | null;
  p_sub_type_ids?: string[] | null;
  p_description?: string | null;
} & Record<string, unknown>;

export interface LocationSearchResult {
  id: string;
  name: string;
  full_path: string | null;
  level: string | null;
}

// ─── Результат RPC search_developers ─────────────────────────────────────────
export interface DeveloperSearchItem {
  id: string;
  name: string;
  logo_url: string | null;
}
