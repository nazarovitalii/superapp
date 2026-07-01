import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MrsqmSupabaseService } from './supabase.service';
import { NotifierSocketService } from './notifier-socket.service';
import {
  GetNotificationsResponse,
  NotificationItem,
  NotificationScope,
} from '../types/notification';

const PAGE = 30;

// Единственный источник ленты уведомлений. Счётчики/строки только из бэка (get_notifications).
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _socket = inject(NotifierSocketService);

  private _loadingMore = false;

  readonly items = signal<NotificationItem[]>([]);
  readonly unreadCount = signal(0);
  readonly nextCursor = signal<string | null>(null);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly previewItems = computed(() => this.items().slice(0, 15));

  // Активная вкладка. 'personal' → сервер отфильтрует матч-типы (p_scope).
  private readonly _scope = signal<NotificationScope>('all');
  readonly scope = this._scope.asReadonly();
  // Непрочитанные личные — всегда из ответа, для индикатора вкладки «Личные».
  readonly personalUnread = signal(0);

  constructor() {
    // WS «обновись» → перечитать первую страницу (истина в Postgres, сокет — хинт).
    this._socket.changed$
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.loadFirst());
  }

  async loadFirst(): Promise<void> {
    this.status.set('loading');
    try {
      const res = await this._supabase.rpc<GetNotificationsResponse>(
        'get_notifications',
        {
          p_limit: PAGE,
          p_scope: this._scope(),
        },
      );
      this.items.set(res.items);
      this.unreadCount.set(res.unread_count);
      this.personalUnread.set(res.personal_unread_count);
      this.nextCursor.set(res.next_cursor);
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    if (this._loadingMore) return;
    this._loadingMore = true;
    try {
      const res = await this._supabase.rpc<GetNotificationsResponse>(
        'get_notifications',
        {
          p_limit: PAGE,
          p_cursor: cursor,
          p_scope: this._scope(),
        },
      );
      this.items.update((cur) => [...cur, ...res.items]);
      this.unreadCount.set(res.unread_count);
      this.personalUnread.set(res.personal_unread_count);
      this.nextCursor.set(res.next_cursor);
    } catch {
      this.status.set('error');
    } finally {
      this._loadingMore = false;
    }
  }

  // Переключение вкладки: меняем scope и чисто перезагружаем первую страницу (сброс курсора).
  async setScope(scope: NotificationScope): Promise<void> {
    if (this._scope() === scope) return;
    this._scope.set(scope);
    await this.loadFirst();
  }

  // Сброс вкладки на 'all' БЕЗ перезагрузки. Зовётся при уничтожении сайдбара,
  // чтобы колокол (общий root-singleton) не унаследовал фильтр 'personal' (спека §5).
  resetScope(): void {
    this._scope.set('all');
  }

  async markAllRead(): Promise<void> {
    try {
      await this._supabase.rpc('mark_notifications_read', { p_ids: null });
    } catch {
      // no-op-устойчивость до go-live
    }
    await this.loadFirst();
  }

  async markRead(ids: string[]): Promise<void> {
    if (!ids.length) return;
    try {
      await this._supabase.rpc('mark_notifications_read', { p_ids: ids });
    } catch {
      // no-op
    }
    await this.loadFirst();
  }
}
