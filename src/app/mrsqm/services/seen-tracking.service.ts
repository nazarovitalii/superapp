import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

// Трекинг просмотров ленты: слабый сигнал «показан» (impression) батчем
// и сильный «открыл карточку» (engagement). Фронт только шлёт события — бэк считает.
@Injectable({ providedIn: 'root' })
export class SeenTrackingService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Батч-impression: помечает объекты показанными для текущего юзера (shown_at = now()).
  async markShown(propertyIds: string[]): Promise<void> {
    if (!propertyIds.length) return;
    try {
      await this._supabase.rpc('mark_listings_shown', { p_property_ids: propertyIds });
    } catch (e) {
      console.error('[SeenTrackingService] markShown ошибка:', e);
    }
  }

  // Engagement: открытие карточки. Бампает seen_at + shown_at на бэке (на каждом открытии).
  async recordView(propertyId: string): Promise<void> {
    try {
      await this._supabase.rpc('track_view', { p_property_id: propertyId });
    } catch (e) {
      console.error('[SeenTrackingService] recordView ошибка:', e);
    }
  }

  // Стадия 2: нажатие кнопки контакта (WA/TG) — сильнейший сигнал воронки (seen_contact).
  // Бэк бампает contact_at + seen_at + shown_at. Fire-and-forget.
  async recordContact(propertyId: string): Promise<void> {
    try {
      await this._supabase.rpc('mark_listing_contact', { p_property_id: propertyId });
    } catch (e) {
      console.error('[SeenTrackingService] recordContact ошибка:', e);
    }
  }

  // Стадия (Баг B): пометить объекты просмотренными в контексте сохранённого фильтра.
  // Гасит бейдж этого фильтра ровно на показанные внутри него объекты. Fire-and-forget.
  async markFilterSeen(filterId: string, propertyIds: string[]): Promise<void> {
    if (!propertyIds.length) return;
    try {
      await this._supabase.rpc('mark_filter_seen', {
        p_filter_id: filterId,
        p_property_ids: propertyIds,
      });
    } catch (e) {
      console.error('[SeenTrackingService] markFilterSeen ошибка:', e);
    }
  }
}
