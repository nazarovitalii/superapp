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
export type Furnished = 'yes' | 'no';
export type Handover = 'ready' | 'offplan';
export type Visibility = 'public' | 'network';
export type PropertyStatus = 'active' | 'pending' | 'archived';

export interface PropertyFeedItem {
  id: string;
  owner_id: string;
  deal_type: DealType;
  listing_type: ListingType;
  property_type: string | null;
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

export interface FeedResponse {
  results: PropertyFeedItem[];
  count_visible: number;
  count_hidden: number;
  count_nearby: number;
  plan: Plan;
  limit: number;
  offset: number;
}

export interface LocationSearchResult {
  id: string;
  name: string;
  full_path: string | null;
  level: string | null;
}
