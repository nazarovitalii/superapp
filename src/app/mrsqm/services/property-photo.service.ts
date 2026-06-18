import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { PropertyPhoto, PropertyPhotoInsert } from '../types/database';

// Параметры нарезки (в браузере): full ~1600px, thumb ~400px, WebP.
const FULL_MAX = 1600;
const FULL_Q = 0.82;
const THUMB_MAX = 400;
const THUMB_Q = 0.7;
const BUCKET = 'property_photos';

interface Sized {
  blob: Blob;
  width: number;
  height: number;
}

// Загрузка фото объекта: нарезка в браузере → Storage → INSERT в property_photos.
@Injectable({ providedIn: 'root' })
export class PropertyPhotoService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Нарезать и загрузить все файлы для объекта, затем записать строки в БД.
  // Порядок = порядок в массиве. Первый — order_index 0 (главное фото).
  // floorPlans — отдельный тип 'floor_plan' с префиксом пути fp_ (чтобы не перетереть галерею).
  async uploadAndAttach(
    propertyId: string,
    files: File[],
    floorPlans: File[] = [],
  ): Promise<void> {
    if (!files.length && !floorPlans.length) return;
    const rows: PropertyPhotoInsert[] = [];

    // Галерея
    for (let i = 0; i < files.length; i++) {
      const full = await this._resize(files[i], FULL_MAX, FULL_Q);
      const thumb = await this._resize(files[i], THUMB_MAX, THUMB_Q);
      const fullUrl = await this._upload(`${propertyId}/${i}_full.webp`, full.blob);
      const thumbUrl = await this._upload(`${propertyId}/${i}_thumb.webp`, thumb.blob);
      rows.push({
        property_id: propertyId,
        photo_type: 'gallery',
        order_index: i,
        full_url: fullUrl,
        thumb_url: thumbUrl,
        width: full.width,
        height: full.height,
        file_size_kb: Math.round(full.blob.size / 1024),
      });
    }

    // Floor Plan: отдельный префикс fp_ чтобы не пересекаться с галереей.
    for (let i = 0; i < floorPlans.length; i++) {
      const full = await this._resize(floorPlans[i], FULL_MAX, FULL_Q);
      const thumb = await this._resize(floorPlans[i], THUMB_MAX, THUMB_Q);
      const fullUrl = await this._upload(`${propertyId}/fp_${i}_full.webp`, full.blob);
      const thumbUrl = await this._upload(`${propertyId}/fp_${i}_thumb.webp`, thumb.blob);
      rows.push({
        property_id: propertyId,
        photo_type: 'floor_plan',
        order_index: i,
        full_url: fullUrl,
        thumb_url: thumbUrl,
        width: full.width,
        height: full.height,
        file_size_kb: Math.round(full.blob.size / 1024),
      });
    }

    const { error } = await this._supabase.client.from('property_photos').insert(rows);
    if (error) throw error;
  }

  // Фото объекта для карточки (select под RLS photos_select, сорт по order_index).
  // Ошибка/нет данных → []. Видимость ограничивает сама RLS (вложенный к properties).
  // Фильтруем только gallery: floor_plan-фото хранятся отдельно и не должны
  // попадать в основную галерею карточки (у них тот же order_index, начиная с 0).
  async getPhotos(propertyId: string): Promise<PropertyPhoto[]> {
    const { data, error } = await this._supabase.client
      .from('property_photos')
      .select('full_url, thumb_url, order_index, photo_type')
      .eq('property_id', propertyId)
      .eq('photo_type', 'gallery')
      .order('order_index', { ascending: true });
    return error ? [] : ((data as PropertyPhoto[]) ?? []);
  }

  private async _upload(path: string, blob: Blob): Promise<string> {
    const { error } = await this._supabase.client.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/webp', upsert: true });
    if (error) throw error;
    return this._supabase.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Масштабирование через canvas → WebP. Не увеличиваем (scale ≤ 1).
  private async _resize(file: File, maxDim: number, quality: number): Promise<Sized> {
    const img = await this._loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob) throw new Error('Не удалось сжать изображение');
    return { blob, width, height };
  }

  private _loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение'));
      };
      img.src = url;
    });
  }
}
