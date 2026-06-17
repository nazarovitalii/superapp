import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

// Действия владельца над своим объектом — через SECURITY DEFINER RPC
// (миграция applied/2026-06-16-property-owner-actions.sql). Каждая проверяет
// owner_id = auth.uid() на сервере; клиент эту проверку не дублирует.
export type ArchiveStatus = 'archived_sold' | 'archived_withdrawn';

@Injectable({ providedIn: 'root' })
export class PropertyOwnerService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Редактирование: только цена и описание.
  async updateProperty(
    propertyId: string,
    price: number,
    description: string | null,
  ): Promise<void> {
    await this._supabase.rpc<boolean>('update_property', {
      p_property_id: propertyId,
      p_price: price,
      p_description: description,
    });
  }

  // Актуализация: поднять объект в ленте (last_actualized_at = now()).
  async actualizeProperty(propertyId: string): Promise<void> {
    await this._supabase.rpc<boolean>('actualize_property', {
      p_property_id: propertyId,
    });
  }

  // Архивация: смена статуса (продан / снят).
  async archiveProperty(propertyId: string, status: ArchiveStatus): Promise<void> {
    await this._supabase.rpc<boolean>('archive_property', {
      p_property_id: propertyId,
      p_status: status,
    });
  }
}
