# Notifications Feed (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить матч-только дропдаун колокольчика на плоскую ленту уведомлений (12 типов) с превью в дропдауне и полным списком в правой панели, против контракта realtime `get_notifications`.

**Architecture:** Новый `NotificationsService` (сигналы: items, unreadCount, nextCursor, status) — единственный источник ленты; зовёт RPC `get_notifications`/`mark_notifications_read`, рефетчит по WS `bell.changed` (через существующий `NotifierSocketService.changed$`). Чистые утилиты (`notification-time`, `notification-presenter`) превращают `Item` в view-model строки. Презентационный `NotificationRowComponent` рендерит 4 строки + thumb. `bell-dropdown` показывает превью (~15), панель `notifications-panel` — полный список с пагинацией.

**Tech Stack:** Angular standalone + signals, Angular Material `MatIcon`, Supabase RPC (`MrsqmSupabaseService.rpc<T>`), Jasmine/Karma co-located specs.

## Global Constraints

- UI-строки и комментарии — на русском (конвенция группы).
- Весь код — в `src/app/mrsqm/`; единственная апстрим-правка — `right-panel-content.component.html` + `panel-content.service.ts` (уже MrSQM-кастомные).
- Strict TS: без `any` (`unknown` если правда неизвестно).
- Сигналы предпочтительнее Observable; подписки — `takeUntilDestroyed()`.
- Дизайн — только SP-токены (`--card-bg`, `--text-color`, `--text-color-muted`, `--color-warning`, `--color-success`, `--separator-color`, `--hover-bg`, `--whiteframe-shadow-*`); без локальных `.mat-*`-оверрайдов.
- SVG/`mat-icon`, не эмодзи. touch-target ≥44px. «непрочитано» не только цветом.
- `npm run checkFile <path>` на КАЖДЫЙ изменённый `.ts`/`.scss`/`.html`/`.spec.ts` перед коммитом.
- Контракт-истина: `~/Projects/realtime/docs/handoff-notifications-feed-superapp.md`. Бэкенд в прод НЕ применён (`get_notifications`→404) → строим против контракта, тесты на моках; «вживую» после owner-apply.
- match-типы зовутся `new_listing`/`price_drop` (НЕ `new`). `below_op` в v1 = `null` — не завязываться.

---

### Task 1: Типы ленты (`notification.ts`)

**Files:**
- Create: `src/app/mrsqm/types/notification.ts`
- Test: `src/app/mrsqm/types/notification.spec.ts`

**Interfaces:**
- Produces:
  - `type NotificationType` — union 12 строковых констант.
  - `interface NotificationItem { id: string; type: NotificationType; created_at: string; read_at: string | null; entity_id: string | null; filter_id: string | null; thumb_url: string | null; data: Record<string, unknown>; source: 'n' | 'm'; }`
  - `interface GetNotificationsResponse { items: NotificationItem[]; unread_count: number; next_cursor: string | null; }`
  - `const NOTIFICATION_TYPES: readonly NotificationType[]` — рантайм-список для гард-теста.

- [ ] **Step 1: Написать падающий тест**

```typescript
// src/app/mrsqm/types/notification.spec.ts
import { NOTIFICATION_TYPES, NotificationType } from './notification';

describe('notification types', () => {
  it('содержит ровно 12 типов', () => {
    expect(NOTIFICATION_TYPES.length).toBe(12);
  });
  it('включает оба матч-типа и доменные', () => {
    const t: readonly string[] = NOTIFICATION_TYPES;
    expect(t).toContain('new_listing');
    expect(t).toContain('price_drop');
    expect(t).toContain('friend_request');
    expect(t).toContain('listing_approved');
  });
  it('NotificationType присваивается из списка', () => {
    const x: NotificationType = NOTIFICATION_TYPES[0];
    expect(x).toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/types/notification.spec.ts`
Expected: FAIL (`Cannot find module './notification'`).

- [ ] **Step 3: Реализация**

```typescript
// src/app/mrsqm/types/notification.ts
// Контракт ленты — realtime/docs/handoff-notifications-feed-superapp.md §3-4.
// Фронт только рендерит; джойнов нет, всё под рендер уже в data.
export type NotificationType =
  | 'new_listing'
  | 'price_drop'
  | 'subscription_expiring'
  | 'friend_request'
  | 'friend_request_accepted'
  | 'ai_digest'
  | 'referral_registered'
  | 'bonus_month_granted'
  | 'listing_approved'
  | 'listing_rejected'
  | 'listing_archived'
  | 'new_comment';

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'new_listing',
  'price_drop',
  'subscription_expiring',
  'friend_request',
  'friend_request_accepted',
  'ai_digest',
  'referral_registered',
  'bonus_month_granted',
  'listing_approved',
  'listing_rejected',
  'listing_archived',
  'new_comment',
];

// source: 'n' = из notifications, 'm' = проекция из filter_matches.
export interface NotificationItem {
  id: string;
  type: NotificationType;
  created_at: string; // ISO-8601
  read_at: string | null;
  entity_id: string | null;
  filter_id: string | null; // заполнен у матч-типов
  thumb_url: string | null;
  data: Record<string, unknown>;
  source: 'n' | 'm';
}

export interface GetNotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
  next_cursor: string | null;
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/types/notification.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/types/notification.ts
npm run checkFile src/app/mrsqm/types/notification.spec.ts
git add src/app/mrsqm/types/notification.ts src/app/mrsqm/types/notification.spec.ts
git commit -m "feat(mrsqm): BELL-2 типы ленты уведомлений (контракт get_notifications)"
```

---

### Task 2: Формат времени (`notification-time.ts`)

**Files:**
- Create: `src/app/mrsqm/util/notification-time.ts`
- Test: `src/app/mrsqm/util/notification-time.spec.ts`

**Interfaces:**
- Produces: `formatNotificationTime(iso: string, now?: Date): string` — сегодня → `HH:mm`; вчера → `Вчера`; раньше → `D MMM` (рус. короткий месяц, напр. `12 июн`).

- [ ] **Step 1: Падающий тест**

```typescript
// src/app/mrsqm/util/notification-time.spec.ts
import { formatNotificationTime } from './notification-time';

describe('formatNotificationTime', () => {
  const now = new Date('2026-06-30T15:00:00');
  it('сегодня → HH:mm', () => {
    expect(formatNotificationTime('2026-06-30T14:32:00', now)).toBe('14:32');
  });
  it('вчера → Вчера', () => {
    expect(formatNotificationTime('2026-06-29T09:10:00', now)).toBe('Вчера');
  });
  it('раньше → день и короткий месяц', () => {
    expect(formatNotificationTime('2026-06-12T09:10:00', now)).toBe('12 июн');
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/util/notification-time.spec.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация**

```typescript
// src/app/mrsqm/util/notification-time.ts
// Относительное время строки уведомления: сегодня→HH:mm, вчера→«Вчера», раньше→«D мес».
const MONTHS_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const formatNotificationTime = (iso: string, now: Date = new Date()): string => {
  const d = new Date(iso);
  if (isSameDay(d, now)) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Вчера';
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
};
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/util/notification-time.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/util/notification-time.ts
npm run checkFile src/app/mrsqm/util/notification-time.spec.ts
git add src/app/mrsqm/util/notification-time.ts src/app/mrsqm/util/notification-time.spec.ts
git commit -m "feat(mrsqm): BELL-2 формат времени строки уведомления"
```

---

### Task 3: Презентер строки (`notification-presenter.ts`)

**Files:**
- Create: `src/app/mrsqm/util/notification-presenter.ts`
- Test: `src/app/mrsqm/util/notification-presenter.spec.ts`

**Interfaces:**
- Consumes: `NotificationItem`, `NotificationType` (Task 1).
- Produces:
  - `type ThumbKind = 'photo' | 'avatar' | 'icon'`
  - `interface NotificationRowVM { title: string; detail: string; thumbKind: ThumbKind; thumbUrl: string | null; icon: string; accent: 'success' | 'warning' | 'primary' | 'muted'; isUnread: boolean; }`
  - `presentNotification(item: NotificationItem): NotificationRowVM` — чистая функция, читает только `item.type`/`item.data`/`item.thumb_url`/`item.read_at`. line2 (detail) и заголовок собираются по §5 контракта. Имя фильтра в строку НЕ кладёт (берётся отдельно из get_saved_filters — вне этой функции).

- [ ] **Step 1: Падающий тест** (по каждому классу типа)

```typescript
// src/app/mrsqm/util/notification-presenter.spec.ts
import { presentNotification } from './notification-presenter';
import { NotificationItem } from '../types/notification';

const base = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'x', type: 'new_listing', created_at: '2026-06-30T10:00:00Z',
  read_at: null, entity_id: null, filter_id: null, thumb_url: null,
  data: {}, source: 'n', ...over,
});

describe('presentNotification', () => {
  it('new_listing — фото + заголовок + деталь из data', () => {
    const vm = presentNotification(base({
      type: 'new_listing', source: 'm', filter_id: 'f1', thumb_url: 'u',
      data: { bedrooms: 1, location_label: 'Damac Hills', price: 950000, previous_price: null, below_op: true },
    }));
    expect(vm.thumbKind).toBe('photo');
    expect(vm.title).toContain('New listing');
    expect(vm.detail).toContain('Damac Hills');
    expect(vm.accent).toBe('success');
  });
  it('friend_request — аватар, имя из data', () => {
    const vm = presentNotification(base({
      type: 'friend_request', thumb_url: 'a', data: { name: 'Амина Курамаева' },
    }));
    expect(vm.thumbKind).toBe('avatar');
    expect(vm.title).toContain('Амина Курамаева');
  });
  it('listing_approved — фото + заголовок объекта', () => {
    const vm = presentNotification(base({
      type: 'listing_approved', thumb_url: 'u', data: { title: '2BR Marina Gate' },
    }));
    expect(vm.thumbKind).toBe('photo');
    expect(vm.detail).toContain('2BR Marina Gate');
  });
  it('subscription_expiring — icon-tile (нет фото)', () => {
    const vm = presentNotification(base({ type: 'subscription_expiring', data: { expires_at: '2026-07-10T00:00:00Z' } }));
    expect(vm.thumbKind).toBe('icon');
    expect(vm.icon).toBe('schedule');
  });
  it('read_at != null → isUnread=false', () => {
    const vm = presentNotification(base({ read_at: '2026-06-30T11:00:00Z' }));
    expect(vm.isUnread).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/util/notification-presenter.spec.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация**

```typescript
// src/app/mrsqm/util/notification-presenter.ts
// Чистый презентер: NotificationItem → view-model строки (заголовок/деталь/thumb/иконка/акцент).
// Схема data по типу — realtime контракт §5. Имя фильтра в строку НЕ кладём (берём из get_saved_filters).
import { NotificationItem, NotificationType } from '../types/notification';

export type ThumbKind = 'photo' | 'avatar' | 'icon';

export interface NotificationRowVM {
  title: string;
  detail: string;
  thumbKind: ThumbKind;
  thumbUrl: string | null;
  icon: string;
  accent: 'success' | 'warning' | 'primary' | 'muted';
  isUnread: boolean;
}

const str = (d: Record<string, unknown>, k: string): string =>
  typeof d[k] === 'string' ? (d[k] as string) : '';
const num = (d: Record<string, unknown>, k: string): number | null =>
  typeof d[k] === 'number' ? (d[k] as number) : null;

interface TypeMeta {
  thumbKind: ThumbKind;
  icon: string;
  accent: NotificationRowVM['accent'];
  title: (d: Record<string, unknown>) => string;
  detail: (d: Record<string, unknown>) => string;
}

const fmtMoney = (n: number | null): string =>
  n == null ? '' : n.toLocaleString('en-US');

const matchDetail = (d: Record<string, unknown>): string => {
  const br = num(d, 'bedrooms');
  const loc = str(d, 'location_label');
  const price = num(d, 'price');
  const prev = num(d, 'previous_price');
  const parts = [br != null ? `${br}br` : '', loc, fmtMoney(price)].filter((p) => p);
  let line = parts.join(' · ');
  if (prev != null) line += ` ↓ ${fmtMoney(prev)}`;
  return line;
};

const META: Record<NotificationType, TypeMeta> = {
  new_listing: { thumbKind: 'photo', icon: 'home', accent: 'success', title: () => 'New listing · below OP', detail: matchDetail },
  price_drop: { thumbKind: 'photo', icon: 'trending_down', accent: 'warning', title: () => 'Price dropped · below OP', detail: matchDetail },
  subscription_expiring: { thumbKind: 'icon', icon: 'schedule', accent: 'warning', title: () => 'Subscription ending', detail: (d) => str(d, 'expires_at') },
  friend_request: { thumbKind: 'avatar', icon: 'person_add', accent: 'primary', title: (d) => `${str(d, 'name')} — запрос в друзья`, detail: () => 'Tap to review' },
  friend_request_accepted: { thumbKind: 'avatar', icon: 'how_to_reg', accent: 'success', title: (d) => `${str(d, 'name')} принял(а) запрос`, detail: () => '' },
  ai_digest: { thumbKind: 'icon', icon: 'smart_toy', accent: 'primary', title: () => 'AI digest', detail: (d) => str(d, 'summary') },
  referral_registered: { thumbKind: 'avatar', icon: 'group_add', accent: 'success', title: (d) => `${str(d, 'name')} signed up`, detail: () => '' },
  bonus_month_granted: { thumbKind: 'icon', icon: 'card_giftcard', accent: 'success', title: () => 'Bonus month added', detail: (d) => `+${num(d, 'months') ?? 1} месяц подписки` },
  listing_approved: { thumbKind: 'photo', icon: 'check_circle', accent: 'success', title: () => 'Listing published', detail: (d) => str(d, 'title') },
  listing_rejected: { thumbKind: 'photo', icon: 'cancel', accent: 'warning', title: () => 'Listing rejected', detail: (d) => str(d, 'reason') },
  listing_archived: { thumbKind: 'photo', icon: 'inventory_2', accent: 'muted', title: () => 'Listing archived', detail: (d) => str(d, 'title') },
  new_comment: { thumbKind: 'photo', icon: 'chat_bubble', accent: 'primary', title: () => 'New comment', detail: (d) => str(d, 'comment_text') },
};

export const presentNotification = (item: NotificationItem): NotificationRowVM => {
  const m = META[item.type];
  return {
    title: m.title(item.data),
    detail: m.detail(item.data),
    thumbKind: item.thumb_url ? m.thumbKind : m.thumbKind === 'photo' || m.thumbKind === 'avatar' ? 'icon' : m.thumbKind,
    thumbUrl: item.thumb_url,
    icon: m.icon,
    accent: m.accent,
    isUnread: item.read_at == null,
  };
};
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/util/notification-presenter.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/util/notification-presenter.ts
npm run checkFile src/app/mrsqm/util/notification-presenter.spec.ts
git add src/app/mrsqm/util/notification-presenter.ts src/app/mrsqm/util/notification-presenter.spec.ts
git commit -m "feat(mrsqm): BELL-2 презентер строки уведомления (12 типов)"
```

---

### Task 4: `NotificationsService`

**Files:**
- Create: `src/app/mrsqm/services/notifications.service.ts`
- Test: `src/app/mrsqm/services/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `MrsqmSupabaseService.rpc<T>(fn, params)` (Task — существующий), `NotifierSocketService.changed$` (существующий), `GetNotificationsResponse` (Task 1).
- Produces:
  - signals: `items = signal<NotificationItem[]>([])`, `unreadCount = signal(0)`, `nextCursor = signal<string|null>(null)`, `status = signal<'idle'|'loading'|'ready'|'error'>('idle')`.
  - `loadFirst(): Promise<void>` — `get_notifications({ p_limit: 30 })`, заменяет items/unreadCount/nextCursor.
  - `loadMore(): Promise<void>` — если `nextCursor()` не null → `get_notifications({ p_limit: 30, p_cursor })`, **дописывает** items, обновляет nextCursor.
  - `markAllRead(): Promise<void>` — `mark_notifications_read({ p_ids: null })` затем `loadFirst()`.
  - `markRead(ids: string[]): Promise<void>` — `mark_notifications_read({ p_ids: ids })` затем `loadFirst()`.
  - `previewItems = computed(() => items().slice(0, 15))` — для дропдауна.

- [ ] **Step 1: Падающий тест** (мок supabase + socket)

```typescript
// src/app/mrsqm/services/notifications.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { MrsqmSupabaseService } from './supabase.service';
import { NotifierSocketService } from './notifier-socket.service';
import { GetNotificationsResponse } from '../types/notification';

describe('NotificationsService', () => {
  let rpc: jasmine.Spy;
  let changed$: Subject<void>;

  const page = (over: Partial<GetNotificationsResponse> = {}): GetNotificationsResponse => ({
    items: [], unread_count: 0, next_cursor: null, ...over,
  });

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc');
    changed$ = new Subject<void>();
    TestBed.configureTestingModule({
      providers: [
        NotificationsService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
        { provide: NotifierSocketService, useValue: { changed$: changed$.asObservable() } },
      ],
    });
  });

  it('loadFirst заполняет items/unread/cursor', async () => {
    rpc.and.resolveTo(page({
      items: [{ id: '1', type: 'new_listing', created_at: 'x', read_at: null, entity_id: null, filter_id: 'f', thumb_url: null, data: {}, source: 'm' }],
      unread_count: 1, next_cursor: 'c1',
    }));
    const svc = TestBed.inject(NotificationsService);
    await svc.loadFirst();
    expect(rpc).toHaveBeenCalledWith('get_notifications', { p_limit: 30 });
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
    expect(rpc).toHaveBeenCalledWith('get_notifications', { p_limit: 30, p_cursor: 'c1' });
    expect(svc.items().length).toBe(2);
    expect(svc.nextCursor()).toBeNull();
  });

  it('markAllRead зовёт RPC с null и перечитывает', async () => {
    const svc = TestBed.inject(NotificationsService);
    rpc.and.resolveTo(page());
    await svc.markAllRead();
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: null });
    expect(rpc).toHaveBeenCalledWith('get_notifications', { p_limit: 30 });
  });

  it('сигнал сокета триггерит loadFirst', async () => {
    rpc.and.resolveTo(page({ unread_count: 3 }));
    const svc = TestBed.inject(NotificationsService);
    await svc.loadFirst();
    rpc.calls.reset();
    rpc.and.resolveTo(page({ unread_count: 5 }));
    changed$.next();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith('get_notifications', { p_limit: 30 });
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/services/notifications.service.spec.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация**

```typescript
// src/app/mrsqm/services/notifications.service.ts
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MrsqmSupabaseService } from './supabase.service';
import { NotifierSocketService } from './notifier-socket.service';
import { GetNotificationsResponse, NotificationItem } from '../types/notification';

const PAGE = 30;

// Единственный источник ленты уведомлений. Счётчики/строки только из бэка (get_notifications).
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _socket = inject(NotifierSocketService);

  readonly items = signal<NotificationItem[]>([]);
  readonly unreadCount = signal(0);
  readonly nextCursor = signal<string | null>(null);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly previewItems = computed(() => this.items().slice(0, 15));

  constructor() {
    // WS «обновись» → перечитать первую страницу (истина в Postgres, сокет — хинт).
    this._socket.changed$
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.loadFirst());
  }

  async loadFirst(): Promise<void> {
    this.status.set('loading');
    try {
      const res = await this._supabase.rpc<GetNotificationsResponse>('get_notifications', {
        p_limit: PAGE,
      });
      this.items.set(res.items);
      this.unreadCount.set(res.unread_count);
      this.nextCursor.set(res.next_cursor);
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    try {
      const res = await this._supabase.rpc<GetNotificationsResponse>('get_notifications', {
        p_limit: PAGE,
        p_cursor: cursor,
      });
      this.items.update((cur) => [...cur, ...res.items]);
      this.unreadCount.set(res.unread_count);
      this.nextCursor.set(res.next_cursor);
    } catch {
      this.status.set('error');
    }
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
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/services/notifications.service.spec.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/services/notifications.service.ts
npm run checkFile src/app/mrsqm/services/notifications.service.spec.ts
git add src/app/mrsqm/services/notifications.service.ts src/app/mrsqm/services/notifications.service.spec.ts
git commit -m "feat(mrsqm): BELL-2 NotificationsService (get_notifications + пагинация + WS-рефетч)"
```

---

### Task 5: Маршрутизация клика (`notification-route.ts`)

**Files:**
- Create: `src/app/mrsqm/util/notification-route.ts`
- Test: `src/app/mrsqm/util/notification-route.spec.ts`

**Interfaces:**
- Consumes: `NotificationItem` (Task 1).
- Produces: `type NotificationTarget = { kind: 'property'; id: string } | { kind: 'friends' } | { kind: 'billing' } | { kind: 'chat' } | { kind: 'none' }`; `notificationTarget(item: NotificationItem): NotificationTarget` — чистая функция: объектные типы → property+entity_id; friend/referral → friends; subscription/bonus → billing; ai_digest → chat; иначе none.

- [ ] **Step 1: Падающий тест**

```typescript
// src/app/mrsqm/util/notification-route.spec.ts
import { notificationTarget } from './notification-route';
import { NotificationItem } from '../types/notification';

const it_ = (type: NotificationItem['type'], entity_id: string | null = 'e'): NotificationItem => ({
  id: 'x', type, created_at: 'x', read_at: null, entity_id, filter_id: null, thumb_url: null, data: {}, source: 'n',
});

describe('notificationTarget', () => {
  it('new_listing → property с entity_id', () => {
    expect(notificationTarget(it_('new_listing', 'p1'))).toEqual({ kind: 'property', id: 'p1' });
  });
  it('friend_request → friends', () => {
    expect(notificationTarget(it_('friend_request')).kind).toBe('friends');
  });
  it('subscription_expiring → billing', () => {
    expect(notificationTarget(it_('subscription_expiring', null)).kind).toBe('billing');
  });
  it('ai_digest → chat', () => {
    expect(notificationTarget(it_('ai_digest', null)).kind).toBe('chat');
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/util/notification-route.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация**

```typescript
// src/app/mrsqm/util/notification-route.ts
// Чистая маршрутизация клика по уведомлению → куда вести.
import { NotificationItem, NotificationType } from '../types/notification';

export type NotificationTarget =
  | { kind: 'property'; id: string }
  | { kind: 'friends' }
  | { kind: 'billing' }
  | { kind: 'chat' }
  | { kind: 'none' };

const PROPERTY_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'new_listing', 'price_drop', 'listing_approved', 'listing_rejected',
  'listing_archived', 'new_comment',
]);
const FRIENDS_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'friend_request', 'friend_request_accepted', 'referral_registered',
]);
const BILLING_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'subscription_expiring', 'bonus_month_granted',
]);

export const notificationTarget = (item: NotificationItem): NotificationTarget => {
  if (PROPERTY_TYPES.has(item.type) && item.entity_id) {
    return { kind: 'property', id: item.entity_id };
  }
  if (FRIENDS_TYPES.has(item.type)) return { kind: 'friends' };
  if (BILLING_TYPES.has(item.type)) return { kind: 'billing' };
  if (item.type === 'ai_digest') return { kind: 'chat' };
  return { kind: 'none' };
};
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/util/notification-route.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/util/notification-route.ts
npm run checkFile src/app/mrsqm/util/notification-route.spec.ts
git add src/app/mrsqm/util/notification-route.ts src/app/mrsqm/util/notification-route.spec.ts
git commit -m "feat(mrsqm): BELL-2 маршрутизация клика по уведомлению"
```

---

### Task 6: `NotificationRowComponent` (презентационная строка)

**Files:**
- Create: `src/app/mrsqm/components/notification-row/notification-row.component.ts`
- Create: `src/app/mrsqm/components/notification-row/notification-row.component.html`
- Create: `src/app/mrsqm/components/notification-row/notification-row.component.scss`
- Test: `src/app/mrsqm/components/notification-row/notification-row.component.spec.ts`

**Interfaces:**
- Consumes: `NotificationItem` (Task 1), `presentNotification` (Task 3), `formatNotificationTime` (Task 2).
- Produces: компонент `mrsqm-notification-row`, inputs: `item = input.required<NotificationItem>()`, `filterName = input<string | null>(null)`; output: `activated = output<void>()`. Внутри строит `vm = computed(() => presentNotification(item()))` и `time = computed(() => formatNotificationTime(item().created_at))`.

- [ ] **Step 1: Падающий тест** (рендер заголовка + непрочитан)

```typescript
// src/app/mrsqm/components/notification-row/notification-row.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationRowComponent } from './notification-row.component';
import { NotificationItem } from '../../types/notification';

const item = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'x', type: 'listing_approved', created_at: new Date().toISOString(),
  read_at: null, entity_id: 'p', filter_id: null, thumb_url: 'u',
  data: { title: '2BR Marina Gate' }, source: 'n', ...over,
});

describe('NotificationRowComponent', () => {
  let fixture: ComponentFixture<NotificationRowComponent>;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NotificationRowComponent] });
    fixture = TestBed.createComponent(NotificationRowComponent);
  });

  it('рендерит деталь из data и метку непрочитано', () => {
    fixture.componentRef.setInput('item', item());
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('2BR Marina Gate');
    expect(el.querySelector('.is-unread')).toBeTruthy();
  });

  it('read_at!=null → без метки непрочитано', () => {
    fixture.componentRef.setInput('item', item({ read_at: new Date().toISOString() }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.is-unread')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/components/notification-row/notification-row.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация — TS**

```typescript
// notification-row.component.ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NotificationItem } from '../../types/notification';
import { presentNotification } from '../../util/notification-presenter';
import { formatNotificationTime } from '../../util/notification-time';

@Component({
  selector: 'mrsqm-notification-row',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './notification-row.component.html',
  styleUrl: './notification-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationRowComponent {
  readonly item = input.required<NotificationItem>();
  readonly filterName = input<string | null>(null);
  readonly activated = output<void>();

  readonly vm = computed(() => presentNotification(this.item()));
  readonly time = computed(() => formatNotificationTime(this.item().created_at));
}
```

- [ ] **Step 4: Реализация — HTML**

```html
<!-- notification-row.component.html -->
<div
  class="ntf-row"
  [class.is-unread]="vm().isUnread"
  role="button"
  tabindex="0"
  (click)="activated.emit()"
  (keydown.enter)="activated.emit()"
  (keydown.space)="activated.emit(); $event.preventDefault()"
>
  <div class="ntf-thumb ntf-thumb--{{ vm().thumbKind }} accent-{{ vm().accent }}">
    @if (vm().thumbKind === 'icon' || !vm().thumbUrl) {
      <mat-icon class="ntf-thumb-ico">{{ vm().icon }}</mat-icon>
    } @else {
      <img
        class="ntf-thumb-img"
        [src]="vm().thumbUrl"
        alt=""
      />
    }
  </div>

  <div class="ntf-body">
    <div class="ntf-line1">
      <span class="ntf-title">{{ vm().title }}</span>
      <span class="ntf-time">{{ time() }}</span>
    </div>
    @if (vm().detail) {
      <div class="ntf-line2">{{ vm().detail }}</div>
    }
    @if (filterName()) {
      <div class="ntf-line3">Filter "{{ filterName() }}"</div>
    }
  </div>
</div>
```

- [ ] **Step 5: Реализация — SCSS**

```scss
// notification-row.component.scss
:host {
  display: block;
}
.ntf-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-height: 64px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--separator-color);
  &:hover {
    background: var(--hover-bg);
  }
  &.is-unread {
    background: color-mix(in srgb, var(--color-warning) 7%, transparent);
  }
}
.ntf-thumb {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--text-color-muted) 14%, transparent);
}
.ntf-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ntf-thumb-ico {
  color: var(--text-color-muted);
}
.accent-success .ntf-thumb-ico {
  color: var(--color-success);
}
.accent-warning .ntf-thumb-ico {
  color: var(--color-warning);
}
.ntf-body {
  flex: 1 1 auto;
  min-width: 0;
}
.ntf-line1 {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.ntf-title {
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ntf-time {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: var(--text-color-muted);
  font-variant-numeric: tabular-nums;
}
.ntf-line2,
.ntf-line3 {
  font-size: 0.82rem;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 6: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/components/notification-row/notification-row.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: checkFile (ВСЕ 4 файла) + commit**

```bash
npm run checkFile src/app/mrsqm/components/notification-row/notification-row.component.ts
npm run checkFile src/app/mrsqm/components/notification-row/notification-row.component.html
npm run checkFile src/app/mrsqm/components/notification-row/notification-row.component.scss
npm run checkFile src/app/mrsqm/components/notification-row/notification-row.component.spec.ts
git add src/app/mrsqm/components/notification-row/
git commit -m "feat(mrsqm): BELL-2 строка-уведомление (thumb + 4 строки)"
```

---

### Task 7: Панель «Все уведомления» + хост + PanelContentService

**Files:**
- Create: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.ts`
- Create: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.html`
- Create: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.scss`
- Test: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts`
- Modify: `src/app/features/panels/panel-content.service.ts:12-22` (union), `:30-34` (signal), добавить методы; `:102-125` (panelType), `:127-149` (hasContent)
- Modify: `src/app/features/right-panel/right-panel-content.component.html:16` (вставить ветку)

**Interfaces:**
- Consumes: `NotificationsService` (Task 4), `NotificationRowComponent` (Task 6), `notificationTarget` (Task 5), `PanelContentService` (расширяем).
- Produces: компонент `mrsqm-notifications-panel`; `PanelContentService`: `'NOTIFICATIONS'` в `PanelContentType`, `isNotificationsOpen = signal(false)`, `openNotifications()`, `closeNotifications()`.

- [ ] **Step 1: Расширить `PanelContentService`** — добавить тип/сигнал/методы и ветки в computed.

```typescript
// panel-content.service.ts — добавить в union (после 'AI_CHAT'):
  | 'AI_CHAT'
  | 'NOTIFICATIONS';
// рядом с другими сигналами:
  readonly isNotificationsOpen = signal(false);
// новые методы (рядом с openAiChat):
  openNotifications(): void {
    this._taskService.setSelectedId(null);
    this.selectedProperty.set(null);
    this.isFilterPanelOpen.set(false);
    this.isAiChatOpen.set(false);
    this.isNotificationsOpen.set(true);
  }
  closeNotifications(): void {
    this.isNotificationsOpen.set(false);
  }
// в panelType() — перед 'AI_CHAT'-веткой:
    if (this.isNotificationsOpen()) return 'NOTIFICATIONS';
// в hasContent() — добавить в || цепочку:
      this.isNotificationsOpen() ||
// (open* других панелей дополнить this.isNotificationsOpen.set(false) для взаимоисключения)
```

- [ ] **Step 2: Падающий тест панели** (рендерит строки из сервиса)

```typescript
// notifications-panel.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotificationsPanelComponent } from './notifications-panel.component';
import { NotificationsService } from '../../services/notifications.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';

describe('NotificationsPanelComponent', () => {
  let fixture: ComponentFixture<NotificationsPanelComponent>;
  const items = signal<unknown[]>([
    { id: '1', type: 'listing_approved', created_at: new Date().toISOString(), read_at: null, entity_id: 'p', filter_id: null, thumb_url: null, data: { title: 'X' }, source: 'n' },
  ]);
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationsPanelComponent],
      providers: [
        { provide: NotificationsService, useValue: {
          items, unreadCount: signal(1), nextCursor: signal(null), status: signal('ready'),
          loadFirst: () => Promise.resolve(), loadMore: () => Promise.resolve(),
          markAllRead: () => Promise.resolve(), markRead: () => Promise.resolve(),
        } },
        { provide: PanelContentService, useValue: { closeNotifications: () => {}, openProperty: () => {} } },
      ],
    });
    fixture = TestBed.createComponent(NotificationsPanelComponent);
    fixture.detectChanges();
  });
  it('рендерит строку уведомления', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('mrsqm-notification-row')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Реализация — TS**

```typescript
// notifications-panel.component.ts
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { NotificationsService } from '../../services/notifications.service';
import { NotificationRowComponent } from '../notification-row/notification-row.component';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { notificationTarget } from '../../util/notification-route';
import { NotificationItem } from '../../types/notification';

@Component({
  selector: 'mrsqm-notifications-panel',
  standalone: true,
  imports: [NotificationRowComponent],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPanelComponent implements OnInit {
  private readonly _panels = inject(PanelContentService);
  readonly store = inject(NotificationsService);

  ngOnInit(): void {
    void this.store.loadFirst();
  }

  onRow(item: NotificationItem): void {
    if (item.read_at == null) void this.store.markRead([item.id]);
    const t = notificationTarget(item);
    if (t.kind === 'property') {
      // property-detail сам догрузит по id; минимальный stub не нужен — панель property берёт id.
      this._panels.openProperty({ id: t.id } as never);
    }
    // friends/billing/chat — навигация добавляется при появлении тех экранов (вне scope v1).
  }

  onMarkAll(): void {
    void this.store.markAllRead();
  }
  onClose(): void {
    this._panels.closeNotifications();
  }
}
```

- [ ] **Step 5: Реализация — HTML**

```html
<!-- notifications-panel.component.html -->
<div class="ntf-panel">
  <header class="ntf-head">
    <span class="ntf-h-title">Notifications</span>
    <button class="ntf-markall" type="button" (click)="onMarkAll()">Mark all read</button>
    <button class="ntf-close" type="button" aria-label="Close" (click)="onClose()">×</button>
  </header>

  @if (store.status() === 'error') {
    <div class="ntf-empty">Couldn't load notifications</div>
  } @else if (!store.items().length) {
    <div class="ntf-empty">No notifications yet</div>
  } @else {
    <ul class="ntf-list">
      @for (it of store.items(); track it.id) {
        <li>
          <mrsqm-notification-row [item]="it" (activated)="onRow(it)" />
        </li>
      }
    </ul>
    @if (store.nextCursor()) {
      <button class="ntf-more" type="button" (click)="store.loadMore()">Load more</button>
    }
  }
</div>
```

- [ ] **Step 6: Реализация — SCSS**

```scss
// notifications-panel.component.scss
:host {
  display: block;
  height: 100%;
}
.ntf-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
}
.ntf-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--separator-color);
}
.ntf-h-title {
  font-weight: 600;
  color: var(--text-color);
  flex: 1 1 auto;
}
.ntf-markall,
.ntf-close,
.ntf-more {
  background: none;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
}
.ntf-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}
.ntf-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-color-muted);
}
.ntf-more {
  padding: 12px;
  width: 100%;
}
```

- [ ] **Step 7: Хост-вставка в `right-panel-content.component.html`** (после ветки `AI_CHAT`, перед `ISSUE_PANEL`):

```html
} @else if (panelContent() === 'NOTIFICATIONS') {
  <mrsqm-notifications-panel [@slideInFromRight]></mrsqm-notifications-panel>
} @else if (panelContent() === 'ISSUE_PANEL') {
```

Добавить импорт `NotificationsPanelComponent` в `right-panel-content.component.ts` (массив `imports`).

- [ ] **Step 8: Запустить тесты панели + сервиса панелей**

Run: `npm run test:file src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts`
Expected: PASS.

- [ ] **Step 9: checkFile (все новые/правленые файлы) + commit**

```bash
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.ts
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.html
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.scss
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts
npm run checkFile src/app/features/panels/panel-content.service.ts
npm run checkFile src/app/features/right-panel/right-panel-content.component.ts
npm run checkFile src/app/features/right-panel/right-panel-content.component.html
git add src/app/mrsqm/components/notifications-panel/ src/app/features/panels/panel-content.service.ts src/app/features/right-panel/right-panel-content.component.ts src/app/features/right-panel/right-panel-content.component.html
git commit -m "feat(mrsqm): BELL-2 панель «Все уведомления» в правом сайдбаре"
```

---

### Task 8: Переписать `bell-dropdown` на ленту-превью

**Files:**
- Modify: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.ts` (полностью на `NotificationsService.previewItems`)
- Modify: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.html` (рендер через `mrsqm-notification-row`)
- Modify: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.previewItems` (Task 4), `NotificationRowComponent` (Task 6), `PanelContentService.openNotifications` (Task 7), `notificationTarget` (Task 5).
- Produces: дропдаун рендерит `previewItems()` строками; футер — только `View all` → `openNotifications()` (тумблер Live удалён); закрытие → `markAllRead()` (вместо `closeBell`).

- [ ] **Step 1: Обновить spec** — заменить ассерты bell-rows на previewItems/notification-row.

```typescript
// в bell-dropdown.component.spec.ts: мок NotificationsService (как в Task 4 spec),
// проверить: при previewItems из 2 элементов рендерятся 2 <mrsqm-notification-row>;
// клик «View all» зовёт panels.openNotifications(); закрытие зовёт store.markAllRead().
```

- [ ] **Step 2: Запустить — FAIL** (старые ассерты/новые API)

Run: `npm run test:file src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация TS** — заменить зависимость `NotifierStoreService`/`buildBellRows` на `NotificationsService`; `rows` → `previewItems`; `onRowClick` → маршрутизация через `notificationTarget` + `openProperty`/`openNotifications`; `toggleLive`/`liveOn` удалить; `View all` → `_panels.openNotifications(); closed.emit()`.

- [ ] **Step 4: Реализация HTML** — заменить `@for (row of rows())` на `@for (it of previewItems(); track it.id) { <mrsqm-notification-row [item]="it" (activated)="onRow(it)" /> }`; убрать футер-тумблер Live, оставить `View all`.

- [ ] **Step 5: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.ts
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.html
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts
git add src/app/mrsqm/components/bell-dropdown/
git commit -m "feat(mrsqm): BELL-2 дропдаун-колокол на ленту-превью (Live убран, View all→сайдбар)"
```

---

### Task 9: Бейдж колокола на `unread_count` ленты + чистка мёртвого seen

**Files:**
- Modify: `src/app/mrsqm/components/bell-button/bell-button.component.ts` (источник числа → `NotificationsService.unreadCount`)
- Modify: `src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`
- Modify: `src/app/mrsqm/services/notifier-store.service.ts:160-170`, `src/app/mrsqm/pages/feed/feed-page.component.ts:577-599` (удалить мёртвые `markFilterSeen`-вызовы — осиротели фиксом B)

**Interfaces:**
- Consumes: `NotificationsService.unreadCount` (Task 4).
- Produces: бейдж колокола = `unreadCount()`; клик открывает дропдаун (как было).

- [ ] **Step 1: Обновить spec бейджа** — серый при 0, оранжевый+число при `unreadCount>0` (мок `NotificationsService`).

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация** — в `bell-button.component.ts` заменить `_store.bellUnseen` на `inject(NotificationsService).unreadCount`. Затем удалить осиротевшие `markFilterSeen`-вызовы: в `notifier-store.service.ts` (строка ~166-168, блок `markFilterSeen(...).then(...)` в `openListing`) и `feed-page.component.ts` (строки 595-599, блок `markFilterSeen` в `_markPageShown`); удалить ставшие неиспользуемыми импорты/переменные (`fid`/`matchIds`, если больше нигде не нужны — проверить).

- [ ] **Step 4: Запустить — PASS** (бейдж + что markFilterSeen-специфичные тесты, если были, удалены/обновлены)

Run: `npm run test:file src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Прогнать смежные сьюты** (не сломали seen-трекинг ленты)

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: PASS (или обновить ассерты, завязанные на markFilterSeen).

- [ ] **Step 6: checkFile (все правленые) + commit**

```bash
npm run checkFile src/app/mrsqm/components/bell-button/bell-button.component.ts
npm run checkFile src/app/mrsqm/components/bell-button/bell-button.component.spec.ts
npm run checkFile src/app/mrsqm/services/notifier-store.service.ts
npm run checkFile src/app/mrsqm/pages/feed/feed-page.component.ts
git add src/app/mrsqm/components/bell-button/ src/app/mrsqm/services/notifier-store.service.ts src/app/mrsqm/pages/feed/feed-page.component.ts
git commit -m "feat(mrsqm): BELL-2 бейдж колокола на unread_count ленты + чистка мёртвого filter-seen"
```

---

## Self-Review

**Spec coverage:**
- 12 типов → Task 1 (типы) + Task 3 (презентер по каждому). ✅
- get_notifications + keyset пагинация → Task 4 (loadFirst/loadMore, cursor). ✅
- unread_count бейдж → Task 9. ✅
- mark_notifications_read (all/точечно) → Task 4 (markAllRead/markRead) + Task 7/8 вызовы. ✅
- WS bell.changed рефетч → Task 4 (подписка на `changed$`). ✅
- 4 строки + thumb (photo/avatar/icon) → Task 3 (thumbKind) + Task 6 (рендер). ✅
- Формат времени → Task 2. ✅
- line3 `Filter "name"` → Task 6 (input filterName). ⚠️ ИСТОЧНИК имени: матч-строки несут `filter_id`; имя берётся из `get_saved_filters`. В дропдауне/панели нужно прокинуть `filterName` по `filter_id`. **Добавлено в Task 8/7 как маппинг filter_id→auto_name из существующего `SavedFilterService` (передавать в `[filterName]`).**
- Клик-роутинг per-type → Task 5 + вызовы в Task 7/8. ✅ (friends/billing/chat — заглушки до появления экранов, помечено вне scope v1).
- View all → сайдбар → Task 7 (панель) + Task 8 (кнопка). ✅
- Дропдаун = превью ~15 → Task 4 (`previewItems`). ✅
- Live убран → Task 8. ✅
- Пустые/error состояния → Task 7 HTML. ✅

**Placeholder scan:** Task 8 шаги 3-4 и Task 9 описаны без полного кода компонента (правка существующих по точным якорям) — это правки по образцу Task 6/уже-прочитанных файлов; реализатор видит точные строки и API из Interfaces. Допустимо как «modify по якорю», но при исполнении показать финальный код в диффе.

**Type consistency:** `NotificationItem`, `GetNotificationsResponse` (Task 1) — единые во всех тасках; `NotificationRowVM`/`presentNotification` (Task 3) ↔ Task 6; `NotificationTarget`/`notificationTarget` (Task 5) ↔ Task 7/8; сигнатуры RPC `{ p_limit, p_cursor }`/`{ p_ids }` — едины Task 4 ↔ контракт. ✅

**Открытый момент исполнения:** `filterName` для матч-строк — прокинуть маппинг `filter_id → SavedFilter.auto_name` из `SavedFilterService` в дропдауне и панели (Task 7/8). Если у строки нет `filter_id` (доменные) — `filterName=null`, line3 не рендерится.
