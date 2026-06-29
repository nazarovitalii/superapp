import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NotifierStoreService } from './notifier-store.service';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilterService } from './saved-filter.service';
import { NotifierSocketService } from './notifier-socket.service';
import { MrsqmAuthService } from './auth.service';
import { PanelContentService } from '../../features/panels/panel-content.service';
import { SeenTrackingService } from './seen-tracking.service';
import { SnackService } from '../../core/snack/snack.service';
import { UnitTypeLabelService } from './unit-type-label.service';

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
        { provide: PanelContentService, useValue: { openProperty: () => {} } },
        {
          provide: SeenTrackingService,
          useValue: {
            recordView: () => Promise.resolve(),
            markFilterSeen: () => Promise.resolve(),
          },
        },
        { provide: SnackService, useValue: { open: () => {} } },
        {
          provide: UnitTypeLabelService,
          useValue: { getLabel: () => Promise.resolve('Apartment') },
        },
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

  it('start→stop→start: одно событие changed → один refresh (нет утечки подписок)', async () => {
    // Конструктор уже запустил start() через auth effect — сначала очищаем.
    store.stop();
    store.start();
    store.stop();
    store.start();
    await Promise.resolve();
    await Promise.resolve();
    list.calls.reset();
    rpc.calls.reset();
    changed$.next();
    await Promise.resolve();
    await Promise.resolve();
    // Без фикса: два раза (старая + новая подписка). С фиксом: ровно один.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('событие opened$ (ре-синк) → один refresh', async () => {
    store.start();
    await Promise.resolve();
    list.calls.reset();
    opened$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('NotifierStoreService (действия)', () => {
  let store: NotifierStoreService;
  let rpc: jasmine.Spy;
  let openProperty: jasmine.Spy;
  let recordView: jasmine.Spy;
  let markFilterSeen: jasmine.Spy;
  let snackOpen: jasmine.Spy;
  let changed$: Subject<void>;

  beforeEach(() => {
    rpc = jasmine
      .createSpy('rpc')
      .and.callFake((fn: string) =>
        fn === 'get_bell'
          ? Promise.resolve({ bell_unseen: 0, items: [] })
          : Promise.resolve(undefined),
      );
    openProperty = jasmine.createSpy('openProperty');
    recordView = jasmine.createSpy('recordView').and.resolveTo(undefined);
    markFilterSeen = jasmine.createSpy('markFilterSeen').and.resolveTo(undefined);
    snackOpen = jasmine.createSpy('open');
    changed$ = new Subject();

    TestBed.configureTestingModule({
      providers: [
        NotifierStoreService,
        {
          provide: MrsqmSupabaseService,
          useValue: {
            rpc,
            client: {
              auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
            },
          },
        },
        {
          provide: SavedFilterService,
          useValue: { list: () => Promise.resolve([]), bumpReload: () => {} },
        },
        {
          provide: NotifierSocketService,
          useValue: {
            opened$: new Subject(),
            changed$,
            connect: () => {},
            disconnect: () => {},
          },
        },
        { provide: MrsqmAuthService, useValue: { isAuthenticated: () => false } },
        { provide: PanelContentService, useValue: { openProperty } },
        { provide: SeenTrackingService, useValue: { recordView, markFilterSeen } },
        { provide: SnackService, useValue: { open: snackOpen } },
        {
          provide: UnitTypeLabelService,
          useValue: { getLabel: () => Promise.resolve('Apartment') },
        },
      ],
    });
    store = TestBed.inject(NotifierStoreService);
  });

  it('closeBell() → mark_bell_seen затем refresh', async () => {
    const order: string[] = [];
    rpc.and.callFake((fn: string) => {
      order.push(fn);
      return fn === 'get_bell'
        ? Promise.resolve({ bell_unseen: 0, items: [] })
        : Promise.resolve(undefined);
    });
    await store.closeBell();
    expect(order[0]).toBe('mark_bell_seen');
    expect(order).toContain('get_bell');
  });

  it('Рамка №0: closeBell НЕ зовёт mark_filter_seen (объекты не трогает)', async () => {
    await store.closeBell();
    expect(markFilterSeen).not.toHaveBeenCalled();
  });

  it('openListing → recordView + openProperty(stub с id)', async () => {
    await store.openListing('prop-1', 'f1');
    expect(recordView).toHaveBeenCalledWith('prop-1');
    expect(openProperty).toHaveBeenCalled();
    expect(openProperty.calls.mostRecent().args[0].id).toBe('prop-1');
  });

  it('openListing → markFilterSeen(filterId, [propertyId]) гасит объект', async () => {
    await store.openListing('prop-1', 'f1');
    expect(markFilterSeen).toHaveBeenCalledWith('f1', ['prop-1']);
  });

  it('requestOpen() бампает openRequested', () => {
    const before = store.openRequested();
    store.requestOpen();
    expect(store.openRequested()).toBe(before + 1);
  });
});
