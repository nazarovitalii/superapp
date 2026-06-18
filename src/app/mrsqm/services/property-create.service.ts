import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import {
  BuildingInfo,
  CommunityLayout,
  FilterOptions,
  LocationInfo,
  LocationSearchItem,
  PropertyInsert,
} from '../types/database';

// Сервис формы «Добавить объект»: справочники, поиск локаций, создание объекта.
@Injectable({ providedIn: 'root' })
export class PropertyCreateService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Справочники для селектов формы (RPC get_filter_options). Кэшируем —
  // данные статичные, грузим один раз за сессию.
  private _filterOptions: FilterOptions | null = null;

  async getFilterOptions(): Promise<FilterOptions> {
    if (this._filterOptions) {
      return this._filterOptions;
    }
    const data = await this._supabase.rpc<FilterOptions>('get_filter_options');
    this._filterOptions = data;
    return data;
  }

  // Поиск локаций (RPC search_locations, p_mode='search'). Возвращает []
  // при коротком запросе или ошибке (RPC сам валидирует длину >= 2).
  async searchLocations(query: string): Promise<LocationSearchItem[]> {
    const q = query.trim();
    if (q.length < 2) {
      return [];
    }
    const res = await this._supabase.rpc<{
      results?: LocationSearchItem[];
      error?: string;
    }>('search_locations', { p_mode: 'search', p_query: q, p_limit: 8 });
    return res?.results ?? [];
  }

  // Инфо о локации (RPC search_locations, p_mode='info'): breadcrumb (предки),
  // children (прямые потомки для каскада до leaf), developer_ids. children=[] ⇒ leaf.
  async locationInfo(locationId: string): Promise<LocationInfo | null> {
    const res = await this._supabase.rpc<LocationInfo & { error?: string }>(
      'search_locations',
      { p_mode: 'info', p_location_id: locationId },
    );
    return res?.error ? null : (res ?? null);
  }

  // Building info из location_developers по leaf-локации (год постройки/сдачи,
  // этажность). Берём запись с наибольшим confidence. Ошибка/нет данных → null.
  async getBuildingInfo(locationId: string): Promise<BuildingInfo | null> {
    const { data, error } = await this._supabase.client
      .from('location_developers')
      .select(
        'project_name, built_year, completion_year, completion_q, total_floors, total_units, project_status',
      )
      .eq('location_id', locationId)
      .order('confidence', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<BuildingInfo>();
    return error ? null : (data ?? null);
  }

  // Планировки комьюнити (community_layouts по location_id комьюнити).
  async getCommunityLayouts(communityId: string): Promise<CommunityLayout[]> {
    const { data, error } = await this._supabase.client
      .from('community_layouts')
      .select('id, name')
      .eq('location_id', communityId)
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    return error ? [] : ((data as CommunityLayout[]) ?? []);
  }

  // Создать объект: прямой INSERT в properties под RLS (owner_id = auth.uid()).
  // status выставляется БД по умолчанию ('draft') → объект уходит на модерацию.
  // Возвращает id созданного объекта.
  async createProperty(payload: PropertyInsert): Promise<string> {
    const { data, error } = await this._supabase.client
      .from('properties')
      .insert(payload)
      .select('id')
      .single<{ id: string }>();
    if (error || !data) {
      throw error ?? new Error('Не удалось создать объект');
    }
    return data.id;
  }
}
