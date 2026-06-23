import { inject, Injectable, signal } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilter, SavedFilterPayload } from './feed-filter.service';

// Сервис CRUD для сохранённых наборов фильтров ленты.
// list/save/remove — через RPC; update — прямой UPDATE под RLS.
@Injectable({ providedIn: 'root' })
export class SavedFilterService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Список сохранённых фильтров текущего юзера (RPC get_saved_filters → .results).
  async list(): Promise<SavedFilter[]> {
    try {
      const res = await this._supabase.rpc<{ results?: SavedFilter[]; count?: number }>(
        'get_saved_filters',
      );
      return res?.results ?? [];
    } catch (e) {
      console.error('[SavedFilterService] list() ошибка:', e);
      return [];
    }
  }

  // Создать сохранённый фильтр (RPC save_filter).
  // Возвращает созданный объект с сервера.
  async save(name: string, payload: SavedFilterPayload): Promise<SavedFilter> {
    const res = await this._supabase.rpc<SavedFilter>('save_filter', {
      p_auto_name: name,
      p_filters: payload,
    });
    if (!res) {
      throw new Error('Не удалось сохранить фильтр: пустой ответ');
    }
    return res;
  }

  // Обновить filters существующего набора (прямой UPDATE под RLS filters_update).
  // p_user_id не передаём — RLS берёт auth.uid() из JWT.
  async update(id: string, payload: SavedFilterPayload): Promise<void> {
    const { error } = await this._supabase.client
      .from('saved_filters')
      .update({ filters: payload })
      .eq('id', id);
    if (error) {
      throw error;
    }
  }

  // Оптимистичный локальный seen-по-фильтру: Map<filterId, Set<propertyId>>.
  // Вычитается из серверного unseen_count до следующего list() (там сброс — сервер уже учёл).
  private readonly _localFilterSeen = signal<Map<string, Set<string>>>(new Map());

  // Сколько объектов помечено локально просмотренными в данном фильтре.
  localSeenCount(filterId: string): number {
    return this._localFilterSeen().get(filterId)?.size ?? 0;
  }

  // Пометить объекты просмотренными в фильтре (оптимистично, без round-trip).
  markSeenLocally(filterId: string, propertyIds: string[]): void {
    if (!propertyIds.length) return;
    const map = new Map(this._localFilterSeen());
    const set = new Set(map.get(filterId) ?? []);
    for (const id of propertyIds) set.add(id);
    map.set(filterId, set);
    this._localFilterSeen.set(map);
  }

  // Сброс локального seen (после list(): сервер уже отдал актуальные unseen_count).
  clearLocalSeen(): void {
    if (this._localFilterSeen().size) {
      this._localFilterSeen.set(new Map());
    }
  }

  // Тик перезагрузки списка фильтров: бампается после серверной пометки seen
  // (feed-page), панель перечитывает get_saved_filters → бейдж = чистое число бекенда.
  readonly reloadTick = signal(0);

  bumpReload(): void {
    this.reloadTick.update((t) => t + 1);
  }

  // Мягкое удаление фильтра (RPC delete_filter).
  async remove(id: string): Promise<void> {
    try {
      await this._supabase.rpc('delete_filter', { p_filter_id: id });
    } catch (e) {
      console.error('[SavedFilterService] remove() ошибка:', e);
      throw e;
    }
  }
}
