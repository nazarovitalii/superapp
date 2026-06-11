import { TestBed } from '@angular/core/testing';
import { SavedPropertiesService } from './saved-properties.service';
import { MrsqmSupabaseService } from './supabase.service';

class FakeSupabase {
  rows: { property_id: string }[] = [];
  rpcResult: unknown = { action: 'saved' };
  lastRpc: { fn: string; params?: Record<string, unknown> } | null = null;

  client = {
    from: () => ({
      select: () => ({
        returns: async () => ({ data: this.rows, error: null }),
      }),
    }),
  };

  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    this.lastRpc = { fn, params };
    return this.rpcResult as T;
  }
}

describe('SavedPropertiesService', () => {
  let fake: FakeSupabase;
  let svc: SavedPropertiesService;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [
        SavedPropertiesService,
        { provide: MrsqmSupabaseService, useValue: fake },
      ],
    });
    svc = TestBed.inject(SavedPropertiesService);
  });

  it('getSavedIds возвращает Set из property_id', async () => {
    fake.rows = [{ property_id: 'a' }, { property_id: 'b' }];
    const set = await svc.getSavedIds();
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('toggle возвращает true при action=saved', async () => {
    fake.rpcResult = { action: 'saved', property_id: 'p1' };
    const res = await svc.toggle('p1');
    expect(res).toBe(true);
    expect(fake.lastRpc?.fn).toBe('save_property');
    expect(fake.lastRpc?.params).toEqual({ p_property_id: 'p1' });
  });

  it('toggle возвращает false при action=removed', async () => {
    fake.rpcResult = { action: 'removed', property_id: 'p1' };
    expect(await svc.toggle('p1')).toBe(false);
  });

  it('toggle кидает ошибку при error в ответе', async () => {
    fake.rpcResult = { error: 'property not found' };
    await expectAsync(svc.toggle('x')).toBeRejected();
  });
});
