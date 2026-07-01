import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import {
  BuildingInfo,
  CommunityLayout,
  DeveloperSearchItem,
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
  // limit: по умолчанию 8 для глобального поиска; передайте 50 для поиска
  // внутри комьюнити (AP-2), чтобы «Golf Vista» не обрезался до клиентского
  // фильтра по community_name.
  async searchLocations(query: string, limit = 8): Promise<LocationSearchItem[]> {
    const q = query.trim();
    if (q.length < 2) {
      return [];
    }
    const res = await this._supabase.rpc<{
      results?: LocationSearchItem[];
      error?: string;
    }>('search_locations', { p_mode: 'search', p_query: q, p_limit: limit });
    return res?.results ?? [];
  }

  // Город юзера (user_context.city_id) для LF-2 — пометка адресов из другого эмирата.
  // RLS context_select отдаёт только свою строку. null при отсутствии/ошибке (мягко).
  async getUserCityId(): Promise<string | null> {
    try {
      const { data } = await this._supabase.client
        .from('user_context')
        .select('city_id')
        .maybeSingle();
      return (data as { city_id: string | null } | null)?.city_id ?? null;
    } catch {
      return null;
    }
  }

  // Поиск локаций строго в пределах поддерева узла (RPC search_in_scope, AP-2).
  // Скоуп = последний выбранный узел цепочки; возвращает [] при коротком
  // запросе или пустом withinId — без вызова RPC.
  async searchInScope(
    query: string,
    withinId: string,
    limit = 50,
  ): Promise<LocationSearchItem[]> {
    const q = query.trim();
    if (q.length < 2 || !withinId) return [];
    const res = await this._supabase.rpc<{
      results?: LocationSearchItem[];
      error?: string;
    }>('search_in_scope', { p_query: q, p_within_id: withinId, p_limit: limit });
    return res?.results ?? [];
  }

  // Поиск девелоперов (RPC search_developers, AP-5). Возвращает [] при
  // запросе короче 2 символов. Ответ — { results: DeveloperSearchItem[] }.
  async searchDevelopers(query: string): Promise<DeveloperSearchItem[]> {
    const q = query.trim();
    if (q.length < 2) {
      return [];
    }
    const res = await this._supabase.rpc<{
      results?: DeveloperSearchItem[];
    }>('search_developers', { p_query: q });
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
        'developer_id, project_name, built_year, completion_year, completion_q, total_floors, total_units, project_status',
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
  // status выставляется БД: public → 'pending_review' (на модерацию), network → 'active'.
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
