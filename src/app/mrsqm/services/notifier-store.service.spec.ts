import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NotifierStoreService } from './notifier-store.service';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilterService } from './saved-filter.service';
import { NotifierSocketService } from './notifier-socket.service';
import { MrsqmAuthService } from './auth.service';

describe('NotifierStoreService (ядро)', () => {
  let store: NotifierStoreService;
  let rpc: jasmine.Spy;
  let list: jasmine.Spy;
  let bumpReload: jasmine.Spy;
  let opened$: Subject<void>;
  let changed$: Subject<void>;

  beforeEach(() => {
    rpc = jasmine
      .createSpy('rpc')
      .and.callFake((fn: string) =>
        fn === 'get_bell'
          ? Promise.resolve({ bell_unseen: 4, items: [] })
          : Promise.resolve(null),
      );
    list = jasmine.createSpy('list').and.resolveTo([
      {
        id: 'f1',
        auto_name: 'A',
        unseen_count: 2,
        filters: {},
        notification_type: null,
        created_at: '',
      },
    ]);
    bumpReload = jasmine.createSpy('bumpReload');
    opened$ = new Subject();
    changed$ = new Subject();

    TestBed.configureTestingModule({
      providers: [
        NotifierStoreService,
        {
          provide: MrsqmSupabaseService,
          useValue: {
            rpc,
            client: {
              auth: {
                getSession: () =>
                  Promise.resolve({ data: { session: { access_token: 'jwt' } } }),
              },
            },
          },
        },
        { provide: SavedFilterService, useValue: { list, bumpReload } },
        {
          provide: NotifierSocketService,
          useValue: {
            opened$,
            changed$,
            connect: jasmine.createSpy(),
            disconnect: jasmine.createSpy(),
          },
        },
        { provide: MrsqmAuthService, useValue: { isAuthenticated: () => true } },
      ],
    });
    store = TestBed.inject(NotifierStoreService);
  });

  it('refresh() сводит оба RPC в сигналы', async () => {
    await store.refresh();
    expect(store.bell().bell_unseen).toBe(4);
    expect(store.bellUnseen()).toBe(4);
    expect(store.filters().length).toBe(1);
  });

  it('refresh() бампает сайдбар (bumpReload)', async () => {
    await store.refresh();
    expect(bumpReload).toHaveBeenCalled();
  });

  it('get_bell reject (allSettled) НЕ ломает filters', async () => {
    rpc.and.callFake((fn: string) =>
      fn === 'get_bell' ? Promise.reject(new Error('no func')) : Promise.resolve(null),
    );
    await store.refresh();
    expect(store.bell().bell_unseen).toBe(0); // остаётся пустым
    expect(store.filters().length).toBe(1); // фильтры пришли
  });

  it('событие changed → один refresh()', async () => {
    store.start();
    await Promise.resolve();
    rpc.calls.reset();
    list.calls.reset();
    changed$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('НЕТ инкремента на фронте: повторные changed не накручивают bell_unseen', async () => {
    store.start();
    await Promise.resolve();
    changed$.next();
    changed$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.bell().bell_unseen).toBe(4); // всегда число из бэка
  });
});
