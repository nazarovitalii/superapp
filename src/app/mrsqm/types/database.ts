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
  area_sqft: number | null;
  area_sqm: number | null;
  furnished: string | null;
  handover: string | null;
  occupancy_status: string | null;
  is_distress: boolean;
  is_negotiable: boolean;
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
  area_sqft: number | null;
  location_name: string | null;
  community_name: string | null;
  description: string | null;
  furnished: Furnished | null;
  handover: Handover | null;
  is_distress: boolean;
  photos: string[] | null;
  published_at: string;
  owner_full_name: string | null;
  owner_photo_url: string | null;
  owner_agency_name: string | null;
  is_network: boolean;
  developer_name: string | null;
}

export interface PropertyDetail extends PropertyFeedItem {
  location_full_path: string | null;
  completion_year: number | null;
  completion_q: number | null;
  occupancy_status: string | null;
  owner_whatsapp_phone: string | null;
  owner_broker_license: string | null;
  owner_languages: string[] | null;
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
  p_bedrooms?: number[] | null;
  p_price_min?: number | null;
  p_price_max?: number | null;
  p_listing_type?: string | null;
  p_is_distress?: boolean | null;
} & Record<string, unknown>;

export interface LocationSearchResult {
  id: string;
  name: string;
  full_path: string | null;
  level: string | null;
}
