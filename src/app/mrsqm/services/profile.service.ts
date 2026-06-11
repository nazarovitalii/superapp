import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { MyListing, UserProfile } from '../types/database';

// Сырой ответ properties с embed-локацией (PostgREST).
interface PropertyRow {
  id: string;
  deal_type: MyListing['deal_type'];
  listing_type: string;
  status: MyListing['status'];
  visibility: string;
  price: number;
  price_currency: string;
  price_period: string | null;
  bedrooms: number | null;
  area_sqft: number | null;
  unit_type_id: string | null;
  created_at: string;
  locations: { name: string | null } | null;
}

// Сервис страницы профиля: денормализованный профиль + мои объекты.
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Профиль из user_context (RLS ограничивает строкой текущего юзера).
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this._supabase.client
      .from('user_context')
      .select(
        'full_name, agency_name, emirate_name, plan, subscription_status, ' +
          'referral_code, friends_count, active_listings, total_listings_ever, broker_license',
      )
      .eq('user_id', userId)
      .maybeSingle<UserProfile>();
    if (error) {
      throw error;
    }
    return data;
  }

  // Мои объекты — прямой запрос к properties под RLS owner_id=auth.uid().
  // get_agent_listings не используем (сломан: лимит аргументов jsonb_build_object).
  async getMyListings(userId: string): Promise<MyListing[]> {
    const { data, error } = await this._supabase.client
      .from('properties')
      .select(
        'id, deal_type, listing_type, status, visibility, price, price_currency, ' +
          'price_period, bedrooms, area_sqft, unit_type_id, created_at, locations(name)',
      )
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .returns<PropertyRow[]>();
    if (error) {
      throw error;
    }
    return (data ?? []).map((r) => ({
      id: r.id,
      deal_type: r.deal_type,
      listing_type: r.listing_type,
      status: r.status,
      visibility: r.visibility,
      price: r.price,
      price_currency: r.price_currency,
      price_period: r.price_period,
      bedrooms: r.bedrooms,
      area_sqft: r.area_sqft,
      unit_type_id: r.unit_type_id,
      created_at: r.created_at,
      location_name: r.locations?.name ?? null,
    }));
  }
}
