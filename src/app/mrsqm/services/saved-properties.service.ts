import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

// Избранное: чтение сохранённых id и toggle через RPC save_property.
@Injectable({ providedIn: 'root' })
export class SavedPropertiesService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Множество id сохранённых объектов текущего юзера (RLS ограничивает выборку).
  async getSavedIds(): Promise<Set<string>> {
    const { data, error } = await this._supabase.client
      .from('saved_properties')
      .select('property_id')
      .returns<{ property_id: string }[]>();
    if (error || !data) {
      return new Set();
    }
    return new Set(data.map((r) => r.property_id));
  }

  // Toggle: добавить/убрать из избранного. Возвращает true, если сохранён.
  async toggle(propertyId: string): Promise<boolean> {
    const res = await this._supabase.rpc<{ action?: string; error?: string }>(
      'save_property',
      { p_property_id: propertyId },
    );
    if (res?.error) {
      throw new Error(res.error);
    }
    return res?.action === 'saved';
  }
}
