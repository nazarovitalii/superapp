import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { FilterOptions, LocationSearchItem, PropertyInsert } from '../types/database';

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
