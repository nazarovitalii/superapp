import { inject, Injectable, signal } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

// Действия владельца над своим объектом — через SECURITY DEFINER RPC
// (миграция applied/2026-06-16-property-owner-actions.sql). Каждая проверяет
// owner_id = auth.uid() на сервере; клиент эту проверку не дублирует.
export type ArchiveStatus = 'archived_sold' | 'archived_withdrawn';

@Injectable({ providedIn: 'root' })
export class PropertyOwnerService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Тик «владелец что-то изменил» — лента слушает и перезагружается (W-7).
  // Бампается только после успешного RPC; ошибка — бампа нет.
  readonly changedTick = signal(0);

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
    this.changedTick.update((n) => n + 1);
  }

  // Актуализация: поднять объект в ленте (last_actualized_at = now()).
  async actualizeProperty(propertyId: string): Promise<void> {
    await this._supabase.rpc<boolean>('actualize_property', {
      p_property_id: propertyId,
    });
    this.changedTick.update((n) => n + 1);
  }

  // Архивация: смена статуса (продан / снят).
  async archiveProperty(propertyId: string, status: ArchiveStatus): Promise<void> {
    await this._supabase.rpc<boolean>('archive_property', {
      p_property_id: propertyId,
      p_status: status,
    });
    this.changedTick.update((n) => n + 1);
  }

  // Продление просроченного объекта (expired→active).
  async renewProperty(propertyId: string): Promise<void> {
    await this._supabase.rpc<boolean>('renew_property', { p_property_id: propertyId });
    this.changedTick.update((n) => n + 1);
  }

  // Переопубликация отклонённого/снятого: правка цены+описания + смена статуса.
  // Возвращает итоговый статус (серверная истина), клиент его не пересчитывает.
  async republishProperty(
    propertyId: string,
    price: number,
    description: string | null,
  ): Promise<string> {
    const status = await this._supabase.rpc<string>('republish_property', {
      p_property_id: propertyId,
      p_price: price,
      p_description: description,
    });
    this.changedTick.update((n) => n + 1);
    return status;
  }

  // Полное удаление объекта (только из архива). Чистка Storage — серверная.
  async deleteProperty(propertyId: string): Promise<void> {
    await this._supabase.rpc<boolean>('delete_property', { p_property_id: propertyId });
    this.changedTick.update((n) => n + 1);
  }
}
