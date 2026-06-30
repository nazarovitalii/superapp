import { effect, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilterService } from './saved-filter.service';
import { NotifierSocketService } from './notifier-socket.service';
import { MrsqmAuthService } from './auth.service';
import { SnackService } from '../../core/snack/snack.service';
import { UnitTypeLabelService } from './unit-type-label.service';
import { SavedFilter } from './feed-filter.service';
import { BellResponse } from '../types/notifier';
import { isBellLiveOn } from '../util/bell-live-pref';
import { buildPropertyTitle } from '../util/property-title';
import { formatBellPrice } from '../util/bell-price';
import { playNotificationChime } from '../util/notification-chime';

const POLL_MS = 60_000;

// Единственный источник истины для всех счётчик-поверхностей (колокол, дропдаун,
// сайдбар). Счётчики НИКОГДА не считаются на фронте — только из бэка через refresh().
@Injectable({ providedIn: 'root' })
export class NotifierStoreService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _savedFilters = inject(SavedFilterService);
  private readonly _socket = inject(NotifierSocketService);
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _snack = inject(SnackService);
  private readonly _labels = inject(UnitTypeLabelService);

  readonly bell = signal<BellResponse>({ bell_unseen: 0, items: [] });
  readonly filters = signal<SavedFilter[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  // Тик-запрос «открыть дропдаун» (toast/клик колокола); bell-button реагирует effect-ом.
  readonly openRequested = signal(0);

  private _started = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  // Хранит подписки на socket, чтобы очистить их в stop() и избежать утечки при logout→login.
  private _subs: Subscription[] = [];
  private readonly _onVisible = (): void => {
    // Гард от гонки: callback может прийти после stop().
    if (!this._started || document.hidden) return;
    void this.refresh();
  };

  constructor() {
    // Жизненный цикл от auth: вошёл → start(), вышел → stop()+сброс. Декаплинг от UI.
    effect(() => {
      if (this._auth.isAuthenticated()) {
        this.start();
      } else {
        this.stop();
        this.bell.set({ bell_unseen: 0, items: [] });
        this.filters.set([]);
      }
    });
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    const live = isBellLiveOn();

    if (live) {
      this._socket.connect(() => this._freshToken());
      this._subs.push(
        this._socket.opened$.subscribe(() => void this.refresh()), // ре-синк на (ре)коннекте
        this._socket.changed$.subscribe(() => this._onChanged()),
      );
    }

    this._pollTimer = setInterval(() => void this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', this._onVisible);
    window.addEventListener('focus', this._onVisible);

    void this.refresh();
  }

  // Применить тумблер живости на лету: пересобрать сокет/подписки под текущий isBellLiveOn().
  // stop() рвёт сокет/подписки/таймеры; start() заново читает isBellLiveOn() и поднимает
  // сокет только если ON (иначе только poll + focus).
  applyLivePref(): void {
    if (this._started) {
      this.stop();
      this.start();
    }
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    // Отписываемся от socket, чтобы повторный start() не накапливал дублей подписок.
    this._subs.forEach((s) => s.unsubscribe());
    this._subs = [];
    this._socket.disconnect();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    document.removeEventListener('visibilitychange', this._onVisible);
    window.removeEventListener('focus', this._onVisible);
  }

  // Единственный путь обновления истины. Один сигнал → один refresh (дебаунс на notifier).
  async refresh(): Promise<void> {
    this.status.set('loading');
    const [bellRes, filtersRes] = await Promise.allSettled([
      this._supabase.rpc<BellResponse>('get_bell'),
      this._savedFilters.list(),
    ]);

    // get_bell может отсутствовать в проде до применения 017 → при reject оставляем пустым.
    if (bellRes.status === 'fulfilled' && bellRes.value) {
      this.bell.set(bellRes.value);
    }
    if (filtersRes.status === 'fulfilled') {
      this.filters.set(filtersRes.value);
    }
    this.status.set(filtersRes.status === 'fulfilled' ? 'ready' : 'error');

    // Сайдбар-бейджи (RT-4) остаются живыми на тех же триггерах (см. план: не переписываем панель).
    this._savedFilters.bumpReload();
  }

  // socket.changed: перечитать истину, затем (если ON) toast + звук по дельте bell_unseen.
  protected _onChanged(): void {
    if (!isBellLiveOn()) {
      void this.refresh();
      return;
    }
    const before = this.bell().bell_unseen;
    void this.refresh().then(() => {
      const after = this.bell().bell_unseen;
      const delta = after - before;
      if (delta > 0) {
        playNotificationChime(); // звук — даже если вкладка не в фокусе
        if (!document.hidden) void this._showToast(delta);
      }
    });
  }

  requestOpen(): void {
    this.openRequested.update((n) => n + 1);
  }

  // Текстовый toast (brief §2B(2)): +1 → строка свежего объекта; >1 → агрегат «N new matches».
  private async _showToast(delta: number): Promise<void> {
    let msg: string;
    if (delta > 1) {
      msg = `${delta} new matches`;
    } else {
      const item = this.bell().items[0];
      if (item) {
        const fname =
          this.filters().find((f) => f.id === item.filter_id)?.auto_name ?? 'your filter';
        const label = await this._labels.getLabel(item.unit_type_id);
        const title = buildPropertyTitle(item.bedrooms, label);
        const loc = item.location_label ?? item.community_label ?? '';
        msg = `New match in «${fname}» · ${[title, loc, formatBellPrice(item)]
          .filter((p) => p)
          .join(' · ')}`;
      } else {
        msg = 'New match';
      }
    }
    this._snack.open({
      msg,
      type: 'SUCCESS',
      ico: 'notifications',
      isSkipTranslate: true,
      actionStr: 'View',
      actionFn: () => this.requestOpen(),
      config: {
        horizontalPosition: 'left',
        verticalPosition: 'bottom',
        panelClass: 'mrsqm-snack',
      },
    });
  }

  private async _freshToken(): Promise<string | null> {
    const { data } = await this._supabase.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
