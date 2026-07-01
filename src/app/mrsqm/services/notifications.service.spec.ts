import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { MrsqmSupabaseService } from './supabase.service';
import { NotifierSocketService } from './notifier-socket.service';
import { GetNotificationsResponse } from '../types/notification';

describe('NotificationsService', () => {
  let rpc: jasmine.Spy;
  let changed$: Subject<void>;

  const page = (
    over: Partial<GetNotificationsResponse> = {},
  ): GetNotificationsResponse => ({
    items: [],
    unread_count: 0,
    personal_unread_count: 0,
    next_cursor: null,
    ...over,
  });

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc');
    changed$ = new Subject<void>();
    TestBed.configureTestingModule({
      providers: [
        NotificationsService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
        {
          provide: NotifierSocketService,
          useValue: { changed$: changed$.asObservable() },
        },
      ],
    });
  });

  it('loadFirst заполняет items/unread/cursor', async () => {
    rpc.and.resolveTo(
      page({
        items: [
          {
            id: '1',
            type: 'new_listing',
            created_at: 'x',
            read_at: null,
            entity_id: null,
            filter_id: 'f',
            thumb_url: null,
            data: {},
            source: 'm',
          },
        ],
        unread_count: 1,
        next_cursor: 'c1',
      }),
    );
    const svc = TestBed.inject(NotificationsService);
    await svc.loadFirst();
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_scope: 'all',
    });
    expect(svc.items().length).toBe(1);
    expect(svc.unreadCount()).toBe(1);
    expect(svc.nextCursor()).toBe('c1');
  });

  it('loadMore дописывает и шлёт курсор', async () => {
    const svc = TestBed.inject(NotificationsService);
    rpc.and.resolveTo(page({ items: [{ id: '1' } as never], next_cursor: 'c1' }));
    await svc.loadFirst();
    rpc.calls.reset();
    rpc.and.resolveTo(page({ items: [{ id: '2' } as never], next_cursor: null }));
    await svc.loadMore();
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_cursor: 'c1',
      p_scope: 'all',
    });
    expect(svc.items().length).toBe(2);
    expect(svc.nextCursor()).toBeNull();
  });

  it('markAllRead зовёт RPC с null и перечитывает', async () => {
    const svc = TestBed.inject(NotificationsService);
    rpc.and.resolveTo(page());
    await svc.markAllRead();
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: null });
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_scope: 'all',
    });
  });

  it('сигнал сокета триггерит loadFirst', async () => {
    rpc.and.resolveTo(page({ unread_count: 3 }));
    const svc = TestBed.inject(NotificationsService);
    await svc.loadFirst();
    rpc.calls.reset();
    rpc.and.resolveTo(page({ unread_count: 5 }));
    changed$.next();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_scope: 'all',
    });
  });

  it('повторный loadMore во время загрузки — no-op (без дублей страниц)', async () => {
    const svc = TestBed.inject(NotificationsService);
    rpc.and.resolveTo(page({ items: [{ id: '1' } as never], next_cursor: 'c1' }));
    await svc.loadFirst();
    rpc.calls.reset();
    let resolveSecond!: (v: unknown) => void;
    rpc.and.returnValue(new Promise((r) => (resolveSecond = r)));
    const p1 = svc.loadMore();
    const p2 = svc.loadMore(); // должен быть no-op, пока первый в полёте
    resolveSecond(page({ items: [{ id: '2' } as never], next_cursor: null }));
    await Promise.all([p1, p2]);
    const calls = rpc.calls.allArgs().filter((a) => a[0] === 'get_notifications');
    expect(calls.length).toBe(1);
    expect(svc.items().length).toBe(2);
  });

  it('loadFirst по умолчанию шлёт p_scope=all и заполняет personalUnread', async () => {
    rpc.and.resolveTo(page({ unread_count: 2, personal_unread_count: 1 }));
    const svc = TestBed.inject(NotificationsService);
    await svc.loadFirst();
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_scope: 'all',
    });
    expect(svc.scope()).toBe('all');
    expect(svc.personalUnread()).toBe(1);
  });

  it('setScope переключает scope и перечитывает первую страницу с новым p_scope', async () => {
    rpc.and.resolveTo(page());
    const svc = TestBed.inject(NotificationsService);
    await svc.loadFirst();
    rpc.calls.reset();
    rpc.and.resolveTo(page({ unread_count: 3, personal_unread_count: 3 }));
    await svc.setScope('personal');
    expect(svc.scope()).toBe('personal');
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_scope: 'personal',
    });
    expect(svc.unreadCount()).toBe(3);
  });

  it('loadMore шлёт активный p_scope вместе с курсором', async () => {
    const svc = TestBed.inject(NotificationsService);
    rpc.and.resolveTo(page({ items: [{ id: '1' } as never], next_cursor: 'c1' }));
    await svc.loadFirst();
    await svc.setScope('personal');
    rpc.calls.reset();
    rpc.and.resolveTo(page({ items: [{ id: '2' } as never], next_cursor: null }));
    await svc.loadMore();
    expect(rpc).toHaveBeenCalledWith('get_notifications', {
      p_limit: 30,
      p_cursor: 'c1',
      p_scope: 'personal',
    });
  });

  it('resetScope возвращает scope к all без обращения к RPC', async () => {
    rpc.and.resolveTo(page());
    const svc = TestBed.inject(NotificationsService);
    await svc.setScope('personal');
    expect(svc.scope()).toBe('personal');
    rpc.calls.reset();
    svc.resetScope();
    expect(svc.scope()).toBe('all');
    expect(rpc).not.toHaveBeenCalled();
  });
});
