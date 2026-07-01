# Уведомления — вкладки «Все / Личные» (BELL-2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в сайдбар уведомлений (`notifications-panel`) таб-бар «Все / Личные», где «Личные» = все типы, кроме матчей (`new_listing`/`price_drop`), с серверной фильтрацией через `p_scope` и индикатором непрочитанных личных.

**Architecture:** Фронт-only в этой сессии. Серверный контракт (`p_scope` + `personal_unread_count` в `get_notifications`) передаётся realtime отдельной хендофф-запиской (Задача 1) — они мержат в каноничную миграцию. `NotificationsService` получает scope-сигнал и шлёт `p_scope` в обоих RPC-вызовах; до деплоя realtime сервер игнорит новый параметр (мягкая деградация — вкладка «Личные» вернёт всё). `notifications-panel` рисует таб-бар и переключает scope. Дропдаун колокола не трогаем.

**Tech Stack:** Angular standalone-компоненты, сигналы, Jasmine/Karma. Supabase RPC через `MrsqmSupabaseService`.

## Global Constraints

- Весь MrSQM-код — в `src/app/mrsqm/`; апстрим Super Productivity не трогать.
- Комментарии и UI-строки — на русском.
- Типы БД — в `src/app/mrsqm/types/`, не дублировать инлайн.
- Strict TypeScript: без `any` (только `unknown`, если правда неизвестно).
- Сигналы предпочтительнее Observable; чистка подписок через `takeUntilDestroyed()`.
- Стайлинг: переиспользовать токены/язык панели, без новых `.mat-*`/`.mdc-*` оверрайдов.
- `npm run checkFile <path>` зелёный на КАЖДОМ тронутом файле (`.ts`/`.scss`/`.html`/`.spec.ts`), включая `.html`.
- Счётчики = сервер-истина, никакого клиентского `−1`.
- Определение матч-типов — единый источник: список `('new_listing','price_drop')`.
- Дефолтное значение scope — `'all'`; текущее поведение обратно совместимо.

---

### Task 1: Хендофф-записка realtime (контракт `p_scope`)

**Files:**

- Create: `docs/superpowers/briefs/2026-07-01-notifications-scope-realtime-handoff.md`

**Interfaces:**

- Consumes: спека `docs/superpowers/specs/2026-07-01-notifications-tabs-design.md` §2.
- Produces: документ-контракт для realtime; Задачи 2–3 пишут фронт против него (мок до деплоя).

Это документ, не код — TDD-цикла нет. Пишем и коммитим.

- [ ] **Step 1: Написать записку**

Создать `docs/superpowers/briefs/2026-07-01-notifications-scope-realtime-handoff.md` со следующим содержимым:

```markdown
# Handoff realtime: вкладки уведомлений — `p_scope` + `personal_unread_count`

> **Дата:** 2026-07-01 · **От:** superApp · **Кому:** realtime / владелец БД.
> **Назначение:** addendum к `get_notifications` под вкладки «Все / Личные» в сайдбаре.
> Связанные документы: контракт ленты [`2026-06-30-notifications-feed-realtime-handoff.md`](2026-06-30-notifications-feed-realtime-handoff.md) §RT-BELL-C, дизайн [`../specs/2026-07-01-notifications-tabs-design.md`](../specs/2026-07-01-notifications-tabs-design.md).

## Проблема

Матч-уведомления (`new_listing`/`price_drop`) сыпятся пачками и топят редкие важные личные
(`friend_request`, `new_comment`, статус объекта). Создатель хочет вкладку «Личные» = всё, кроме матчей.
Чисто клиентский фильтр несовместим с keyset-пагинацией (страница матчей отдаст «Личные» почти пустыми),
поэтому фильтрация нужна на сервере.

## Addendum к `get_notifications`
```

get_notifications(
p_limit int default 30,
p_cursor timestamptz default null,
p_scope text default 'all' -- НОВОЕ: 'all' | 'personal'
) -> {
items: [...], -- как сейчас
unread_count: int, -- непрочитанные В ТЕКУЩЕМ scope
personal_unread_count: int, -- НОВОЕ: непрочитанные личные, всегда (независимо от p_scope)
next_cursor: timestamptz|null
}

```

**Семантика:**
- `p_scope='personal'` → в `WHERE` добавляется `type NOT IN ('new_listing','price_drop')`.
  Пагинация, `unread_count`, `next_cursor` считаются уже по отфильтрованному набору.
- `p_scope='all'` (или отсутствует) → поведение как сейчас, **обратно совместимо**.
- `personal_unread_count` — **всегда** число непрочитанных личных (даже когда открыта «Все»),
  чтобы вкладка показывала индикатор. Один `COUNT(*) FILTER (WHERE read_at IS NULL AND type NOT IN
  ('new_listing','price_drop'))` в том же запросе, не отдельным раундтрипом.

## Обратная совместимость

Параметр опциональный с дефолтом → текущий вызов `get_notifications(p_limit)` и `mark_notifications_read`
не ломаются. `personal_unread_count` — новое поле, старый фронт его игнорит.

## Клоббер-риск

Пока realtime не вложил `p_scope` в каноничную миграцию, любой их редеплой её затрёт. Поэтому путь —
именно хендофф (мерж в их источник), а не наш прод-патч.

## Критерий приёмки

`get_notifications(p_scope=>'personal')` не содержит `new_listing`/`price_drop`; `unread_count` — по scope;
`personal_unread_count` = непрочитанные личные независимо от `p_scope`; `p_scope=>'all'` идентичен текущему.

## Разделение ответственности

| Задача | Сторона |
| --- | --- |
| `p_scope`-фильтр + `personal_unread_count` в каноничной миграции | **realtime / БД** |
| Таб-бар, scope-сигнал, `p_scope` в RPC-вызовах, индикатор | **superApp** (фронт против мока до деплоя) |
```

- [ ] **Step 2: Проверить формат (Markdown-прогон checkFile не требуется — это не исходник)**

Run: `test -f docs/superpowers/briefs/2026-07-01-notifications-scope-realtime-handoff.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/briefs/2026-07-01-notifications-scope-realtime-handoff.md
git commit -m "docs(notifications): хендофф realtime — p_scope + personal_unread_count для вкладок"
```

---

### Task 2: `NotificationsService` — scope + `p_scope` в RPC

**Files:**

- Modify: `src/app/mrsqm/types/notification.ts` (добавить тип scope, константу матч-типов, поле ответа)
- Modify: `src/app/mrsqm/services/notifications.service.ts`
- Test: `src/app/mrsqm/services/notifications.service.spec.ts`

**Interfaces:**

- Consumes: `GetNotificationsResponse`, `MrsqmSupabaseService.rpc`, `NotifierSocketService.changed$`.
- Produces (для Task 3):
  - тип `NotificationScope = 'all' | 'personal'`
  - `NotificationsService.scope: Signal<NotificationScope>` (readonly-сигнал)
  - `NotificationsService.personalUnread: Signal<number>` (readonly-сигнал)
  - `NotificationsService.setScope(scope: NotificationScope): void` — меняет сигнал + `loadFirst()`
  - `GetNotificationsResponse.personal_unread_count: number`
  - константа `MATCH_NOTIFICATION_TYPES: readonly NotificationType[] = ['new_listing', 'price_drop']`

- [ ] **Step 1: Расширить типы**

В `src/app/mrsqm/types/notification.ts` добавить после блока `NOTIFICATION_TYPES` (после строки 30) новый экспорт:

```typescript
// Высокочастотные матч-типы — единственный поток, который «топит» остальные (спека §1).
// Единый источник для scope-фильтра «Личные» = всё, КРОМЕ этих.
export const MATCH_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'new_listing',
  'price_drop',
];

// Scope ленты: 'all' — все типы (дефолт), 'personal' — всё, кроме матчей.
export type NotificationScope = 'all' | 'personal';
```

И расширить `GetNotificationsResponse` (сейчас строки 45-49) полем `personal_unread_count`:

```typescript
export interface GetNotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
  // Непрочитанные личные (не матч) — всегда, независимо от p_scope. Для индикатора вкладки «Личные».
  personal_unread_count: number;
  next_cursor: string | null;
}
```

- [ ] **Step 2: Написать падающие тесты**

В `src/app/mrsqm/services/notifications.service.spec.ts` обновить фабрику `page` и добавить тесты.

Обновить фабрику (строки 12-19), добавив `personal_unread_count: 0` в дефолт:

```typescript
const page = (
  over: Partial<GetNotificationsResponse> = {},
): GetNotificationsResponse => ({
  items: [],
  unread_count: 0,
  personal_unread_count: 0,
  next_cursor: null,
  ...over,
});
```

Добавить три теста в конец `describe` (перед закрывающей `});`):

```typescript
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
```

Также в существующих тестах `loadFirst заполняет...`, `markAllRead...`, `сигнал сокета...` ожидание
`toHaveBeenCalledWith('get_notifications', { p_limit: 30 })` изменить на
`toHaveBeenCalledWith('get_notifications', { p_limit: 30, p_scope: 'all' })`, а в тесте `loadMore
дописывает и шлёт курсор` — на `{ p_limit: 30, p_cursor: 'c1', p_scope: 'all' }`.

- [ ] **Step 3: Запустить тесты — убедиться, что падают**

Run: `npm run test:file src/app/mrsqm/services/notifications.service.spec.ts`
Expected: FAIL — `setScope`/`scope`/`personalUnread` не существуют; `p_scope` не передаётся.

- [ ] **Step 4: Реализовать в сервисе**

В `src/app/mrsqm/services/notifications.service.ts`:

Импорт (строка 5) расширить:

```typescript
import {
  GetNotificationsResponse,
  NotificationItem,
  NotificationScope,
} from '../types/notification';
```

Добавить сигналы после `previewItems` (после строки 21):

```typescript
  // Активная вкладка. 'personal' → сервер отфильтрует матч-типы (p_scope).
  private readonly _scope = signal<NotificationScope>('all');
  readonly scope = this._scope.asReadonly();
  // Непрочитанные личные — всегда из ответа, для индикатора вкладки «Личные».
  readonly personalUnread = signal(0);
```

Переписать `loadFirst` (строки 30-46):

```typescript
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
```

Переписать тело `loadMore` (строки 53-63) — добавить `p_scope` и обновление `personalUnread`:

```typescript
const res = await this._supabase.rpc<GetNotificationsResponse>('get_notifications', {
  p_limit: PAGE,
  p_cursor: cursor,
  p_scope: this._scope(),
});
this.items.update((cur) => [...cur, ...res.items]);
this.unreadCount.set(res.unread_count);
this.personalUnread.set(res.personal_unread_count);
this.nextCursor.set(res.next_cursor);
```

Добавить метод `setScope` после `loadMore` (перед `markAllRead`):

```typescript
  // Переключение вкладки: меняем scope и чисто перезагружаем первую страницу (сброс курсора).
  async setScope(scope: NotificationScope): Promise<void> {
    if (this._scope() === scope) return;
    this._scope.set(scope);
    await this.loadFirst();
  }
```

- [ ] **Step 5: Запустить тесты — убедиться, что проходят**

Run: `npm run test:file src/app/mrsqm/services/notifications.service.spec.ts`
Expected: PASS (все, включая обновлённые ожидания `p_scope`).

- [ ] **Step 6: checkFile на всех тронутых файлах**

Run:

```bash
npm run checkFile src/app/mrsqm/types/notification.ts
npm run checkFile src/app/mrsqm/services/notifications.service.ts
npm run checkFile src/app/mrsqm/services/notifications.service.spec.ts
```

Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/app/mrsqm/types/notification.ts src/app/mrsqm/services/notifications.service.ts src/app/mrsqm/services/notifications.service.spec.ts
git commit -m "feat(notifications): scope-сигнал + p_scope/personal_unread_count в NotificationsService"
```

---

### Task 3: Таб-бар «Все / Личные» в `notifications-panel`

**Files:**

- Modify: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.ts`
- Modify: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.html`
- Modify: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.scss`
- Test: `src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts`

**Interfaces:**

- Consumes (из Task 2): `NotificationsService.scope()`, `NotificationsService.personalUnread()`,
  `NotificationsService.setScope(scope)`, тип `NotificationScope`.
- Produces: финальный UI — таб-бар над списком, переключающий scope.

- [ ] **Step 1: Написать падающие тесты**

Существующий spec использует инлайновый `useValue` для `NotificationsService` (строки 42-54) без
именованной ссылки. Чтобы тесты могли дёргать `.set()` на сигналах и проверять spy, вынести три поля
в module-level const над `describe` (рядом с `items`, после строки 36):

```typescript
const scope = signal<'all' | 'personal'>('all');
const personalUnread = signal(0);
const setScope = jasmine.createSpy('setScope');
```

В `beforeEach` сбросить их перед каждым тестом (первой строкой внутри `beforeEach`, до
`TestBed.configureTestingModule`):

```typescript
scope.set('all');
personalUnread.set(0);
setScope.calls.reset();
```

И добавить эти поля в `useValue` мока `NotificationsService` (внутри объекта на строках 44-53):

```typescript
            scope,
            personalUnread,
            setScope,
```

Добавить тесты в конец `describe` (перед закрывающей `});`):

```typescript
it('рендерит две вкладки «Все» и «Личные»', () => {
  const tabs = fixture.nativeElement.querySelectorAll('.ntf-tab');
  expect(tabs.length).toBe(2);
  expect(tabs[0].textContent).toContain('Все');
  expect(tabs[1].textContent).toContain('Личные');
});

it('клик по вкладке «Личные» зовёт setScope(personal)', () => {
  const tabs = fixture.nativeElement.querySelectorAll('.ntf-tab');
  tabs[1].click();
  expect(setScope).toHaveBeenCalledWith('personal');
});

it('активная вкладка помечена классом is-active по scope()', () => {
  scope.set('personal');
  fixture.detectChanges();
  const tabs = fixture.nativeElement.querySelectorAll('.ntf-tab');
  expect(tabs[0].classList).not.toContain('is-active');
  expect(tabs[1].classList).toContain('is-active');
});

it('счётчик личных виден при personalUnread > 0 и скрыт при 0', () => {
  personalUnread.set(0);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.ntf-tab-count')).toBeNull();
  personalUnread.set(4);
  fixture.detectChanges();
  const badge = fixture.nativeElement.querySelector('.ntf-tab-count');
  expect(badge.textContent).toContain('4');
});
```

> Примечание для реализатора: `signal` уже импортирован в spec (строка 2). `scope`/`personalUnread` —
> writable-сигналы, поэтому `.set()` в тестах работает; `setScope` — jasmine-spy.

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npm run test:file src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts`
Expected: FAIL — `.ntf-tab` не существует; `setScope` не вызывается.

- [ ] **Step 3: Добавить обработчик в компонент**

В `notifications-panel.component.ts` добавить метод (после `filterNameFor`, перед `onRow`):

```typescript
  onScope(scope: NotificationScope): void {
    void this.store.setScope(scope);
  }
```

И импорт типа (расширить импорт из `../../types/notification`, строка 14):

```typescript
import { NotificationItem, NotificationScope } from '../../types/notification';
```

- [ ] **Step 4: Добавить таб-бар в шаблон**

В `notifications-panel.component.html` вставить таб-бар сразу после `</header>` (после строки 19),
перед блоком `@if (store.status() === 'error')`:

```html
<nav
  class="ntf-tabs"
  role="tablist"
  aria-label="Вкладки уведомлений"
>
  <button
    class="ntf-tab"
    type="button"
    role="tab"
    [class.is-active]="store.scope() === 'all'"
    [attr.aria-selected]="store.scope() === 'all'"
    (click)="onScope('all')"
  >
    Все
  </button>
  <button
    class="ntf-tab"
    type="button"
    role="tab"
    [class.is-active]="store.scope() === 'personal'"
    [attr.aria-selected]="store.scope() === 'personal'"
    (click)="onScope('personal')"
  >
    Личные @if (store.personalUnread() > 0) {
    <span class="ntf-tab-count">{{ store.personalUnread() }}</span>
    }
  </button>
</nav>
```

Дополнительно: заменить пустое состояние, чтобы на вкладке «Личные» был свой текст. Блок (строки 23-24)

```html
} @else if (!store.items().length) {
<div class="ntf-empty">Пока нет уведомлений</div>
```

заменить на:

```html
} @else if (!store.items().length) {
<div class="ntf-empty">
  @if (store.scope() === 'personal') { Личных уведомлений пока нет } @else { Пока нет
  уведомлений }
</div>
```

- [ ] **Step 5: Стили таб-бара**

В `notifications-panel.component.scss` добавить (после блока `.ntf-head`, до `.ntf-list`):

```scss
.ntf-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 14px 0;
  border-bottom: 1px solid var(--separator-color);
}

.ntf-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-color-muted);
  cursor: pointer;
  font: inherit;

  &.is-active {
    color: var(--text-color);
    border-bottom-color: var(--c-primary, #1976d2);
    font-weight: 600;
  }
}

.ntf-tab-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--c-primary, #1976d2);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
```

- [ ] **Step 6: Запустить тесты — убедиться, что проходят**

Run: `npm run test:file src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: checkFile на всех тронутых файлах (включая `.html`)**

Run:

```bash
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.ts
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.html
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.scss
npm run checkFile src/app/mrsqm/components/notifications-panel/notifications-panel.component.spec.ts
```

Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/components/notifications-panel/
git commit -m "feat(notifications): таб-бар «Все/Личные» в сайдбаре уведомлений"
```

---

## Замечания по деплою (после всех задач)

- Деплой-гейт: `npm run lint && npm run buildFrontend:prodWeb` ДО пуша; push `--no-verify`; ОДИН push.
- Фронт работает против мока/деградации: пока realtime не выкатил `p_scope`, вкладка «Личные»
  вернёт всё (сервер игнорит неизвестный параметр). Это не поломка — мягкая деградация.
- Реальная фильтрация «Личные» появится после деплоя каноничной миграции realtime (Задача 1).

## Self-Review (выполнено при написании плана)

- **Покрытие спеки:** §1 классификация → `MATCH_NOTIFICATION_TYPES` (Task 2); §2 контракт → хендофф
  (Task 1) + `p_scope`/`personal_unread_count` в сервисе (Task 2); §3 таб-бар/счётчик/empty-state →
  Task 3; §4 «не делаем» — дропдаун/удаление/схлопывание не трогаются; §6 DoD → тесты в Task 2/3 +
  хендофф в Task 1.
- **Плейсхолдеров нет:** весь код приведён дословно.
- **Согласованность типов:** `NotificationScope`, `setScope`, `scope`, `personalUnread`,
  `personal_unread_count`, `MATCH_NOTIFICATION_TYPES` — имена совпадают между Task 2 и Task 3.
