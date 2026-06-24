import { inject, Injectable, signal } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

// Действия владельца над своим объектом — через SECURITY DEFINER RPC
// (миграция applied/2026-06-16-property-owner-actions.sql). Каждая проверяет
// owner_id = auth.uid() на сервере; клиент эту проверку не дублирует.
export type ArchiveStatus = 'archived_sold' | 'archived_withdrawn';

// Полное редактирование объекта (WP-M). Поля = whitelist RPC edit_property.
// Неизменяемые поля (категория/тип/сделка/адрес/beds/baths) сюда НЕ входят —
// сервер их физически не принимает (защита от devtools-обхода).
export interface EditPropertyPayload {
  propertyId: string;
  price: number;
  description: string | null;
  isMaid: boolean;
  isStudy: boolean;
  isHotelPool: boolean;
  isVastu: boolean;
  areaSqft: number | null;
  plotSqft: number | null;
  floorLevelId: string | null;
  floorNumber: number | null;
  floorsInUnitId: string | null;
  viewIds: string[] | null;
  positionIds: string[] | null;
  amenityIds: string[] | null;
  furnished: string | null;
  pricePeriod: string | null;
  occupancyStatus: string | null;
  leaseUntil: string | null;
  listingType: string | null;
  visibility: string | null;
  publicLocationId: string | null;
  originalPrice: number | null;
}

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

  // Полное редактирование (WP-M): заменяет узкие updateProperty/republishProperty.
  // Возвращает итоговый статус (серверная истина) — клиент его не пересчитывает.
  async editProperty(p: EditPropertyPayload): Promise<string> {
    const status = await this._supabase.rpc<string>('edit_property', {
      p_property_id: p.propertyId,
      p_price: p.price,
      p_description: p.description,
      p_is_maid: p.isMaid,
      p_is_study: p.isStudy,
      p_is_hotel_pool: p.isHotelPool,
      p_is_vastu: p.isVastu,
      p_area_sqft: p.areaSqft,
      p_plot_sqft: p.plotSqft,
      p_floor_level_id: p.floorLevelId,
      p_floor_number: p.floorNumber,
      p_floors_in_unit_id: p.floorsInUnitId,
      p_view_ids: p.viewIds,
      p_position_ids: p.positionIds,
      p_amenity_ids: p.amenityIds,
      p_furnished: p.furnished,
      p_price_period: p.pricePeriod,
      p_occupancy_status: p.occupancyStatus,
      p_lease_until: p.leaseUntil,
      p_listing_type: p.listingType,
      p_visibility: p.visibility,
      p_public_location_id: p.publicLocationId,
      p_original_price: p.originalPrice,
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
