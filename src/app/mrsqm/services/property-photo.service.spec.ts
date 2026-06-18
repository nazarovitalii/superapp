import { TestBed } from '@angular/core/testing';
import { PropertyPhotoService } from './property-photo.service';
import { MrsqmSupabaseService } from './supabase.service';
import { PropertyPhoto } from '../types/database';

// ─── Заглушка Supabase-клиента ───────────────────────────────────────────────
class FakeQuery {
  private _data: unknown[] = [];
  private _error: unknown = null;

  setResult(data: unknown[], error: unknown = null): this {
    this._data = data;
    this._error = error;
    return this;
  }

  from(_table: string): this {
    return this;
  }
  select(_cols: string): this {
    return this;
  }
  eq(_col: string, _val: unknown): this {
    return this;
  }
  in(_col: string, _vals: unknown[]): this {
    return this;
  }
  order(_col: string, _opts: unknown): this {
    return this;
  }

  then(resolve: (v: { data: unknown; error: unknown }) => void): void {
    resolve({ data: this._data, error: this._error });
  }
}

class FakeSupabase {
  private _query = new FakeQuery();

  get client(): { from: (t: string) => FakeQuery } {
    return {
      from: (_t: string) => this._query,
    };
  }

  setResult(data: unknown[], error: unknown = null): void {
    this._query.setResult(data, error);
  }
}

const makePhoto = (type: string, orderIndex: number, fullUrl: string): PropertyPhoto => ({
  full_url: fullUrl,
  thumb_url: `${fullUrl}_thumb`,
  order_index: orderIndex,
  photo_type: type,
});

describe('PropertyPhotoService', () => {
  let service: PropertyPhotoService;
  let fakeSupabase: FakeSupabase;

  beforeEach(() => {
    fakeSupabase = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [
        PropertyPhotoService,
        { provide: MrsqmSupabaseService, useValue: fakeSupabase },
      ],
    });
    service = TestBed.inject(PropertyPhotoService);
  });

  // V-7: gallery-фото идут перед floor_plan независимо от order_index
  it('getPhotos: gallery перед floor_plan, каждый тип по order_index', async () => {
    fakeSupabase.setResult([
      makePhoto('floor_plan', 0, 'fp0'),
      makePhoto('gallery', 1, 'g1'),
      makePhoto('floor_plan', 1, 'fp1'),
      makePhoto('gallery', 0, 'g0'),
    ]);
    const result = await service.getPhotos('prop1');
    expect(result.map((p) => p.full_url)).toEqual(['g0', 'g1', 'fp0', 'fp1']);
  });

  it('getPhotos: только gallery — порядок по order_index', async () => {
    fakeSupabase.setResult([
      makePhoto('gallery', 2, 'g2'),
      makePhoto('gallery', 0, 'g0'),
      makePhoto('gallery', 1, 'g1'),
    ]);
    const result = await service.getPhotos('prop1');
    expect(result.map((p) => p.full_url)).toEqual(['g0', 'g1', 'g2']);
  });

  it('getPhotos: ошибка → пустой массив', async () => {
    fakeSupabase.setResult([], 'DB error');
    const result = await service.getPhotos('prop1');
    expect(result).toEqual([]);
  });
});
