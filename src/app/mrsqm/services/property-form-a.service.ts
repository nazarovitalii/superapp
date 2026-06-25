import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

const BUCKET = 'property_form_a';

// Строка для INSERT в property_form_a после загрузки PDF в Storage.
export interface FormARow {
  property_id: string;
  file_url: string;
  contract_number: string | null;
  listing_start: string | null;
  listing_end: string | null;
  pdf_password: string | null;
  status: string;
  uploaded_by: string;
}

// Загрузка Form A (PDF) в приватный бакет и запись строки в property_form_a.
// RLS бакета: только INSERT своих файлов по пути {owner_id}/...
// RLS таблицы: только SELECT + INSERT для владельца объекта.
@Injectable({ providedIn: 'root' })
export class PropertyFormAService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Загрузить PDF в Storage. Возвращает путь внутри бакета.
  // upsert: false — RLS разрешает только INSERT (UPDATE запрещён);
  // имя файла уникально через randomUUID, коллизии невозможны.
  async uploadFormA(propertyId: string, ownerId: string, file: File): Promise<string> {
    const path = `${ownerId}/${propertyId}/${crypto.randomUUID()}.pdf`;
    const { error } = await this._supabase.client.storage
      .from(BUCKET)
      .upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (error) throw error;
    return path;
  }

  // Записать строку Form A в таблицу property_form_a.
  async insertFormA(row: FormARow): Promise<void> {
    const { error } = await this._supabase.client.from('property_form_a').insert(row);
    if (error) throw error;
  }
}
