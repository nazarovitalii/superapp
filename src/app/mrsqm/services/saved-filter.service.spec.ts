import { TestBed } from '@angular/core/testing';
import { SavedFilterService } from './saved-filter.service';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilter, SavedFilterPayload } from './feed-filter.service';
import { EMPTY_FILTERS } from './feed-filter.service';

// Заглушка Supabase: повторяет паттерн property-create.service.spec.ts
class FakeSupabase {
  rpcCalls: { fn: string; params?: Record<string, unknown> }[] = [];
  rpcResult: unknown = {};
  rpcError: unknown = null;

  // Цепочка for .from().update().eq()
  updatePayload: unknown = null;
  updateEqField: string = '';
  updateEqValue: string = '';
  updateResult: { error: unknown } = { error: null };

  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    this.rpcCalls.push({ fn, params });
    if (this.rpcError) throw this.rpcError;
    return this.rpcResult as T;
  }

  client = {
    from: (_: string) => ({
      update: (payload: unknown) => {
        this.updatePayload = payload;
        return {
          eq: (field: string, value: string) => {
            this.updateEqField = field;
            this.updateEqValue = value;
            return Promise.resolve(this.updateResult);
          },
        };
      },
    }),
  };
}

const samplePayload = (): SavedFilterPayload => ({
  filters: { ...EMPTY_FILTERS },
  dealType: 'sale',
  handover: null,
  scope: 'public',
  category: null,
  locations: [],
});

const sampleFilter = (): SavedFilter => ({
  id: 'filter-uuid-1',
  auto_name: 'Marina Sale',
  filters: samplePayload(),
  notification_type: null,
  created_at: '2026-06-21T10:00:00Z',
  unseen_count: 0,
});

describe('SavedFilterService', () => {
  let fake: FakeSupabase;
  let svc: SavedFilterService;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [SavedFilterService, { provide: MrsqmSupabaseService, useValue: fake }],
    });
    svc = TestBed.inject(SavedFilterService);
  });

  // ─── list ───────────────────────────────────────────────────────────────────

  it('list() вызывает RPC get_saved_filters без параметров', async () => {
    fake.rpcResult = { results: [], count: 0 };
    await svc.list();
    expect(fake.rpcCalls.length).toBe(1);
    expect(fake.rpcCalls[0].fn).toBe('get_saved_filters');
    expect(fake.rpcCalls[0].params).toBeUndefined();
  });

  it('list() возвращает массив из results', async () => {
    const filter = sampleFilter();
    fake.rpcResult = { results: [filter], count: 1 };
    const res = await svc.list();
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('filter-uuid-1');
  });

  it('list() возвращает [] при отсутствии results в ответе', async () => {
    fake.rpcResult = {};
    const res = await svc.list();
    expect(res).toEqual([]);
  });

  it('list() возвращает [] при ошибке (не бросает)', async () => {
    fake.rpcError = new Error('сеть недоступна');
    const res = await svc.list();
    expect(res).toEqual([]);
  });

  // ─── save ──────────────────────────────────────────────────────────────────

  it('save() вызывает RPC save_filter с p_auto_name и p_filters', async () => {
    const filter = sampleFilter();
    fake.rpcResult = filter;
    const payload = samplePayload();
    await svc.save('Marina Sale', payload);
    expect(fake.rpcCalls[0].fn).toBe('save_filter');
    expect(fake.rpcCalls[0].params?.['p_auto_name']).toBe('Marina Sale');
    expect(fake.rpcCalls[0].params?.['p_filters']).toEqual(payload);
  });

  it('save() возвращает созданный SavedFilter', async () => {
    const filter = sampleFilter();
    fake.rpcResult = filter;
    const res = await svc.save('Marina Sale', samplePayload());
    expect(res.id).toBe('filter-uuid-1');
    expect(res.auto_name).toBe('Marina Sale');
  });

  it('save() бросает при пустом ответе RPC', async () => {
    fake.rpcResult = null;
    await expectAsync(svc.save('Test', samplePayload())).toBeRejected();
  });

  it('save() пробрасывает ошибку RPC', async () => {
    fake.rpcError = { message: 'rls denied' };
    await expectAsync(svc.save('Test', samplePayload())).toBeRejected();
  });

  // ─── update ────────────────────────────────────────────────────────────────

  it('update() пишет в from("saved_filters").update().eq("id", id)', async () => {
    const payload = samplePayload();
    await svc.update('filter-uuid-1', payload);
    expect(fake.updatePayload).toEqual({ filters: payload });
    expect(fake.updateEqField).toBe('id');
    expect(fake.updateEqValue).toBe('filter-uuid-1');
  });

  it('update() не вызывает RPC (только прямой update)', async () => {
    await svc.update('filter-uuid-1', samplePayload());
    expect(fake.rpcCalls.length).toBe(0);
  });

  it('update() бросает при ошибке Supabase', async () => {
    fake.updateResult = { error: { message: 'update failed' } };
    await expectAsync(svc.update('filter-uuid-1', samplePayload())).toBeRejected();
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  it('remove() вызывает RPC delete_filter с p_filter_id', async () => {
    fake.rpcResult = { deleted: true };
    await svc.remove('filter-uuid-1');
    expect(fake.rpcCalls[0].fn).toBe('delete_filter');
    expect(fake.rpcCalls[0].params?.['p_filter_id']).toBe('filter-uuid-1');
  });

  it('remove() пробрасывает ошибку RPC', async () => {
    fake.rpcError = { message: 'not found' };
    await expectAsync(svc.remove('filter-uuid-1')).toBeRejected();
  });

  // ─── localSeen ─────────────────────────────────────────────────────────────

  it('markSeenLocally копит уникальные id по фильтру', () => {
    svc.markSeenLocally('f1', ['a', 'b']);
    svc.markSeenLocally('f1', ['b', 'c']);
    expect(svc.localSeenCount('f1')).toBe(3);
    expect(svc.localSeenCount('f2')).toBe(0);
  });

  it('clearLocalSeen обнуляет локальный seen', () => {
    svc.markSeenLocally('f1', ['a']);
    svc.clearLocalSeen();
    expect(svc.localSeenCount('f1')).toBe(0);
  });

  it('markSeenLocally с пустым массивом — no-op', () => {
    svc.markSeenLocally('f1', []);
    expect(svc.localSeenCount('f1')).toBe(0);
  });
});
