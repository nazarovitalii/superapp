import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilterService } from './saved-filter.service';
import { NotifierSocketService } from './notifier-socket.service';
import { MrsqmAuthService } from './auth.service';
import { SavedFilter } from './feed-filter.service';
import { BellResponse } from '../types/notifier';
import { isBellLiveOn } from '../util/bell-live-pref';

const POLL_MS = 60_000;

// Единственный источник истины для всех счётчик-поверхностей (колокол, дропдаун,
// сайдбар). Счётчики НИКОГДА не считаются на фронте — только из бэка через refresh().
@Injectable({ providedIn: 'root' })
export class NotifierStoreService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _savedFilters = inject(SavedFilterService);
  private readonly _socket = inject(NotifierSocketService);
  private readonly _auth = inject(MrsqmAuthService);

  readonly bell = signal<BellResponse>({ bell_unseen: 0, items: [] });
  readonly filters = signal<SavedFilter[]>([]);
  readonly bellUnseen = computed(() => this.bell().bell_unseen);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  private _started = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _onVisible = (): void => {
    if (!document.hidden) void this.refresh();
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
      this._socket.opened$.subscribe(() => void this.refresh()); // ре-синк на (ре)коннекте
      this._socket.changed$.subscribe(() => this._onChanged());
    }

    this._pollTimer = setInterval(() => void this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', this._onVisible);
    window.addEventListener('focus', this._onVisible);

    void this.refresh();
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
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

  // На socket.changed Task 7 добавит toast+звук; ядро просто перечитывает истину.
  protected _onChanged(): void {
    void this.refresh();
  }

  private async _freshToken(): Promise<string | null> {
    const { data } = await this._supabase.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
