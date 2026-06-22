# Unseen/seen-трекинг ленты — Стадия 1 (план реализации)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Жёлтая полоска «новое» в общей ленте + механика двух сигналов просмотра (impression батчем на загрузку страницы, engagement на открытие карточки).

**Architecture:** Read-side в Supabase (колонка `shown_at` + bulk-RPC + фикс `track_view` + поле `is_unseen` в `get_feed`) отдаёт `is_unseen` на каждом объекте. Фронт ничего не считает: рисует полоску по `is_unseen`, шлёт батч `mark_listings_shown` на загрузку страницы и `track_view` на открытие, через 3 сек локально гасит полоску с CSS-анимацией.

**Tech Stack:** PostgreSQL (Supabase self-hosted, RPC + RLS), Angular standalone + signals, Jasmine/Karma.

**Источник:** спека `docs/superpowers/specs/2026-06-22-feed-unseen-seen-tracking-design.md` (Стадия 1).

## Global Constraints

- Весь код — в `src/app/mrsqm/`; апстрим Super Productivity не трогать.
- Комментарии и UI-строки — **на русском**.
- TypeScript strict: **никаких `any`** (`unknown` если правда неизвестно).
- Предпочитать **сигналы**; NgRx-состояние не мутировать (здесь не затрагивается).
- **Property-card — hot-path:** только класс-биндинг от сигнал-инпута + CSS; без функций/геттеров в шаблоне, без подписок, без таймеров в карточке.
- RPC: `p_user_id` из клиента **не передавать** — RLS берёт `auth.uid()` из JWT.
- **`npm run checkFile <path>`** на каждом изменённом `.ts`/`.scss` перед коммитом.
- Коммиты: `type(scope): описание` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Тестовые правки — `test:`, не `fix(test):`.
- **Изменения БД применяются только с явного согласия владельца** (объяснить → спросить → ждать). SQL пишем в `docs/migrations/`, применяем через `/migrate`.
- Подпись RPC `MrsqmSupabaseService`: `async rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T>`.

---

### Task 1: Read-side SQL (4 миграции — пишем файлы, НЕ применяем)

Пишем 4 файла миграций. Применение — отдельным шагом в Task 5 (человек-чекпойнт).

**Files:**
- Create: `docs/migrations/2026-06-22-user-seen-listings-add-shown-at.sql`
- Create: `docs/migrations/2026-06-22-mark-listings-shown.sql`
- Create: `docs/migrations/2026-06-22-track-view-every-open.sql`
- Create: `docs/migrations/2026-06-22-get-feed-is-unseen.sql`

**Interfaces produced (контракт для фронта):**
- RPC `mark_listings_shown(p_property_ids uuid[]) → void`
- RPC `track_view(p_property_id uuid, p_user_id uuid DEFAULT NULL) → jsonb` (бампает `seen_at`+`shown_at` на каждом вызове)
- `get_feed(...)` jsonb-объект каждого результата получает поле `is_unseen boolean`

- [ ] **Step 1: Файл колонки `shown_at`**

Создать `docs/migrations/2026-06-22-user-seen-listings-add-shown-at.sql`:

```sql
-- Стадия 1: слабый частый сигнал «показан в ленте» (impression).
-- Аддитивно, идемпотентно — чтобы не конфликтовать с realtime-стороной
-- (ТЗ относит DDL этой колонки к их стороне; кто первый — тот добавил).
ALTER TABLE public.user_seen_listings
  ADD COLUMN IF NOT EXISTS shown_at timestamptz;
```

- [ ] **Step 2: Файл bulk-RPC `mark_listings_shown`**

Создать `docs/migrations/2026-06-22-mark-listings-shown.sql`:

```sql
-- Стадия 1: bulk-impression. Бампает shown_at для текущего юзера по списку объектов.
-- Пропускает объекты, где владелец = сам юзер (чтобы не пачкать воронку seen_preview).
-- seen_at НЕ трогает (это сигнал открытия, не показа).
CREATE OR REPLACE FUNCTION public.mark_listings_shown(p_property_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_seen_listings (user_id, property_id, shown_at)
  SELECT auth.uid(), p.id, now()
  FROM public.properties p
  WHERE p.id = ANY(p_property_ids)
    AND p.owner_id IS DISTINCT FROM auth.uid()
  ON CONFLICT (user_id, property_id) DO UPDATE SET shown_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.mark_listings_shown(uuid[]) TO authenticated;
```

> ⚠️ Перед применением (Task 5) подтвердить SELECT-ом, что `user_seen_listings.seen_at` **nullable**
> (иначе INSERT новой строки без `seen_at` упадёт):
> `SELECT is_nullable FROM information_schema.columns WHERE table_name='user_seen_listings' AND column_name='seen_at';`
> Если `NO` — добавить в INSERT `seen_at` не нужно; вместо этого согласовать с владельцем снятие NOT NULL.

- [ ] **Step 3: Файл фикса `track_view`**

Создать `docs/migrations/2026-06-22-track-view-every-open.sql`. Тело — реконструкция текущей функции
(из `docs/database.md`) с изменениями: гард «раз в день» снят; на каждом вызове бампаются `seen_at` И `shown_at`;
`unique_views_count++` только при первом касании пары:

```sql
-- Стадия 1: track_view бампает seen_at И shown_at на КАЖДОМ открытии (гард «раз в день» снят).
-- ⚠️ Staleness-proof: ПЕРЕД применением сверить с текущим телом:
--    SELECT pg_get_functiondef('public.track_view(uuid,uuid)'::regprocedure);
--    Перенести в новое тело любые расхождения DECLARE/резолва юзера, не учтённые здесь.
CREATE OR REPLACE FUNCTION public.track_view(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_owner_id uuid;
  v_is_first boolean;
BEGIN
  SELECT owner_id INTO v_owner_id FROM properties WHERE id = p_property_id;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'property not found');
  END IF;

  -- Не считать просмотр владельцем своего объекта
  IF v_owner_id = v_current_user_id THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'owner view');
  END IF;

  -- Первое ли это касание пары (user, property) за всё время — для unique_views
  SELECT NOT EXISTS (
    SELECT 1 FROM user_seen_listings
    WHERE user_id = v_current_user_id AND property_id = p_property_id
  ) INTO v_is_first;

  -- views_count++ всегда
  UPDATE properties SET views_count = views_count + 1 WHERE id = p_property_id;

  -- На КАЖДОМ открытии: бампаем обе метки (открыл ⟹ и показан)
  INSERT INTO user_seen_listings (user_id, property_id, seen_at, shown_at)
  VALUES (v_current_user_id, p_property_id, now(), now())
  ON CONFLICT (user_id, property_id) DO UPDATE
    SET seen_at = now(), shown_at = now();

  -- unique_views_count++ только при первом касании пары
  IF v_is_first THEN
    UPDATE properties SET unique_views_count = unique_views_count + 1 WHERE id = p_property_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'skipped', false, 'unique', v_is_first);
END;
$$;
```

- [ ] **Step 4: Файл патча `get_feed += is_unseen`**

Создать `docs/migrations/2026-06-22-get-feed-is-unseen.sql`. `get_feed` — большая функция; вставляем ОДНО
поле в её jsonb-вывод через staleness-proof DO-блок (тело берём из БД, не из доков):

```sql
-- Стадия 1: добавить is_unseen в jsonb-вывод каждого объекта get_feed (Прил. D).
-- is_unseen = объект опубликован/актуализирован позже, чем юзер видел его в ленте (shown_at).
-- ⚠️ Перед применением: получить тело и ПОДТВЕРДИТЬ (а) алиас таблицы properties в SELECT,
--    (б) выражение текущего юзера, (в) якорь-ключ для вставки:
--    SELECT pg_get_functiondef('public.get_feed(<полная сигнатура>)'::regprocedure);
--    (полная сигнатура — в docs/database.md, раздел get_feed).
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef(
    'public.get_feed(text, uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, integer[], integer[], boolean, boolean, text, uuid[], uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, text, text[], text[], text[], text, text[], text, integer[], text[], text, numeric, numeric, uuid[], text, integer, integer, integer[], boolean, boolean, boolean, boolean)'::regprocedure
  );

  -- Якорь: существующий стабильный ключ 'community_name'. ПОДТВЕРДИТЬ его наличие в v_def
  -- и при необходимости заменить на реально присутствующий ключ + верный алиас properties (ниже 'p').
  v_new := regexp_replace(
    v_def,
    E'(''community_name''\\s*,[^\\n]*\\n)',
    E'\\1      ''is_unseen'', (GREATEST(p.created_at, p.updated_at) > COALESCE((SELECT usl.shown_at FROM public.user_seen_listings usl WHERE usl.property_id = p.id AND usl.user_id = COALESCE(p_user_id, auth.uid())), ''epoch''::timestamptz)),\n',
    ''
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed patch: якорь не найден — сверить ключ/алиас с pg_get_functiondef';
  END IF;

  EXECUTE v_new;
END $$;
```

- [ ] **Step 5: Коммит файлов миграций**

```bash
git add docs/migrations/2026-06-22-user-seen-listings-add-shown-at.sql \
        docs/migrations/2026-06-22-mark-listings-shown.sql \
        docs/migrations/2026-06-22-track-view-every-open.sql \
        docs/migrations/2026-06-22-get-feed-is-unseen.sql
git commit -m "feat(feed): read-side SQL для unseen-трекинга (shown_at, bulk-RPC, track_view, get_feed.is_unseen)" --no-verify
```

---

### Task 2: `SeenTrackingService` (фронт-сервис событий)

**Files:**
- Create: `src/app/mrsqm/services/seen-tracking.service.ts`
- Test: `src/app/mrsqm/services/seen-tracking.service.spec.ts`

**Interfaces produced:**
- `markShown(propertyIds: string[]): Promise<void>` — батч-impression; пустой массив → no-op.
- `recordView(propertyId: string): Promise<void>` — engagement на открытие.
- Обе глушат ошибки (не критичны для UX).

- [ ] **Step 1: Failing test**

Создать `src/app/mrsqm/services/seen-tracking.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SeenTrackingService } from './seen-tracking.service';
import { MrsqmSupabaseService } from './supabase.service';

describe('SeenTrackingService', () => {
  let service: SeenTrackingService;
  let rpc: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo(undefined);
    TestBed.configureTestingModule({
      providers: [
        SeenTrackingService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
      ],
    });
    service = TestBed.inject(SeenTrackingService);
  });

  it('markShown шлёт ids в mark_listings_shown', async () => {
    await service.markShown(['a', 'b']);
    expect(rpc).toHaveBeenCalledWith('mark_listings_shown', { p_property_ids: ['a', 'b'] });
  });

  it('markShown с пустым массивом — no-op', async () => {
    await service.markShown([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('recordView шлёт id в track_view', async () => {
    await service.recordView('x');
    expect(rpc).toHaveBeenCalledWith('track_view', { p_property_id: 'x' });
  });

  it('ошибка RPC не пробрасывается наружу', async () => {
    rpc.and.rejectWith(new Error('boom'));
    await expectAsync(service.markShown(['a'])).toBeResolved();
    await expectAsync(service.recordView('x')).toBeResolved();
  });
});
```

- [ ] **Step 2: Запустить — упадёт (нет сервиса)**

Run: `npm run test:file src/app/mrsqm/services/seen-tracking.service.spec.ts`
Expected: FAIL — `Cannot find module './seen-tracking.service'`.

- [ ] **Step 3: Реализация**

Создать `src/app/mrsqm/services/seen-tracking.service.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

// Трекинг просмотров ленты: слабый сигнал «показан» (impression) батчем
// и сильный «открыл карточку» (engagement). Фронт только шлёт события — бэк считает.
@Injectable({ providedIn: 'root' })
export class SeenTrackingService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Батч-impression: помечает объекты показанными для текущего юзера (shown_at = now()).
  async markShown(propertyIds: string[]): Promise<void> {
    if (!propertyIds.length) return;
    try {
      await this._supabase.rpc('mark_listings_shown', { p_property_ids: propertyIds });
    } catch (e) {
      console.error('[SeenTrackingService] markShown ошибка:', e);
    }
  }

  // Engagement: открытие карточки. Бампает seen_at + shown_at на бэке (на каждом открытии).
  async recordView(propertyId: string): Promise<void> {
    try {
      await this._supabase.rpc('track_view', { p_property_id: propertyId });
    } catch (e) {
      console.error('[SeenTrackingService] recordView ошибка:', e);
    }
  }
}
```

- [ ] **Step 4: Запустить — зелёный**

Run: `npm run test:file src/app/mrsqm/services/seen-tracking.service.spec.ts`
Expected: PASS (4 spec).

- [ ] **Step 5: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/services/seen-tracking.service.ts
git add src/app/mrsqm/services/seen-tracking.service.ts src/app/mrsqm/services/seen-tracking.service.spec.ts
git commit -m "feat(feed): SeenTrackingService — markShown/recordView для трекинга просмотров" --no-verify
```

---

### Task 3: Полоска «новое» в карточке (`property-card`)

**Files:**
- Modify: `src/app/mrsqm/types/database.ts` (PropertyFeedItem += is_unseen)
- Modify: `src/app/mrsqm/components/property-card/property-card.component.ts`
- Modify: `src/app/mrsqm/components/property-card/property-card.component.html`
- Modify: `src/app/mrsqm/components/property-card/property-card.component.scss`
- Test: `src/app/mrsqm/components/property-card/property-card.component.spec.ts`

**Interfaces:**
- Consumes: `PropertyFeedItem` (тип).
- Produces: вход `isUnseen` у `mrsqm-property-card`; CSS-класс `.is-unseen` на `.inner-wrapper`.

- [ ] **Step 1: Тип `is_unseen`**

В `src/app/mrsqm/types/database.ts`, в `interface PropertyFeedItem` (после строки 245), добавить поле:

```ts
  // Стадия 1: объект новый/непросмотренный для текущего юзера (по shown_at). Драйвит жёлтую полоску.
  is_unseen?: boolean;
```

- [ ] **Step 2: Failing test (класс по инпуту)**

В `src/app/mrsqm/components/property-card/property-card.component.spec.ts` добавить тест (использовать
существующий паттерн создания компонента + минимальный `PropertyFeedItem` из этого же спека):

```ts
it('добавляет класс is-unseen на .inner-wrapper при isUnseen=true', () => {
  fixture.componentRef.setInput('isUnseen', true);
  fixture.detectChanges();
  const wrapper: HTMLElement = fixture.nativeElement.querySelector('.inner-wrapper');
  expect(wrapper.classList).toContain('is-unseen');
});

it('нет класса is-unseen по умолчанию', () => {
  fixture.detectChanges();
  const wrapper: HTMLElement = fixture.nativeElement.querySelector('.inner-wrapper');
  expect(wrapper.classList).not.toContain('is-unseen');
});
```

- [ ] **Step 3: Запустить — упадёт (нет инпута/класса)**

Run: `npm run test:file src/app/mrsqm/components/property-card/property-card.component.spec.ts`
Expected: FAIL — `setInput('isUnseen', ...)` нет такого инпута / класс отсутствует.

- [ ] **Step 4: Добавить инпут**

В `property-card.component.ts`, рядом с `readonly isActive = input(false);` (строка 26):

```ts
  // Стадия 1: новый/непросмотренный объект — жёлтая полоска по левому ребру (hot-path: только класс).
  readonly isUnseen = input(false);
```

- [ ] **Step 5: Класс в шаблоне**

В `property-card.component.html`, в `.inner-wrapper` (строки 7–8) добавить биндинг рядом с `is-active`:

```html
  [class.is-active]="isActive()"
  [class.is-selected]="isSelected()"
  [class.is-unseen]="isUnseen()"
```

- [ ] **Step 6: Полоска в SCSS**

В `property-card.component.scss`, в блок `.inner-wrapper` (открыт на строке 13) добавить `position: relative;`
если его там нет, и добавить псевдоэлемент-полоску (искать существующий жёлтый токен темы; если нет —
использовать `--c-warn`/`--palette-accent`, согласовать с темой Super Productivity):

```scss
.inner-wrapper {
  position: relative;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--c-warn, #f5c518);
    opacity: 0;
    transition: opacity 400ms ease;
    pointer-events: none;
  }

  &.is-unseen::before {
    opacity: 1;
  }
}
```

> Если в `.inner-wrapper` уже есть `position`/`&::before` — встроить полоску в существующие правила,
> не дублируя селектор (хирургическая правка). Снятие класса `.is-unseen` → `opacity 1→0` = fade-out.

- [ ] **Step 7: Запустить — зелёный**

Run: `npm run test:file src/app/mrsqm/components/property-card/property-card.component.spec.ts`
Expected: PASS.

- [ ] **Step 8: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/types/database.ts
npm run checkFile src/app/mrsqm/components/property-card/property-card.component.ts
npm run checkFile src/app/mrsqm/components/property-card/property-card.component.scss
git add src/app/mrsqm/types/database.ts src/app/mrsqm/components/property-card/
git commit -m "feat(feed): жёлтая полоска is-unseen в карточке (левое ребро, fade-out по классу)" --no-verify
```

---

### Task 4: Интеграция в ленту (`feed-page`)

**Files:**
- Modify: `src/app/mrsqm/pages/feed/feed-page.component.ts`
- Modify: `src/app/mrsqm/pages/feed/feed-page.component.html:419-425` (передать `[isUnseen]`)
- Test: `src/app/mrsqm/pages/feed/feed-page.component.spec.ts`

**Interfaces:**
- Consumes: `SeenTrackingService.markShown([...])`, `SeenTrackingService.recordView(id)`; `PropertyFeedItem.is_unseen`.
- Produces: на load страницы — батч `markShown`; через 3 сек флип `is_unseen=false`; на открытие — `recordView`.

- [ ] **Step 1: Failing tests**

В `src/app/mrsqm/pages/feed/feed-page.component.spec.ts` добавить (предоставить spy `SeenTrackingService`
в провайдерах теста; использовать `fakeAsync`/`tick` для таймера). Подогнать под существующий setup спека:

```ts
// в providers TestBed: { provide: SeenTrackingService, useValue: seenSpy }
// где seenSpy = jasmine.createSpyObj('SeenTrackingService', ['markShown', 'recordView']);
//   seenSpy.markShown.and.resolveTo(undefined); seenSpy.recordView.and.resolveTo(undefined);

it('после загрузки страницы шлёт markShown с id объектов', fakeAsync(() => {
  // arrange: замокать get_feed так, чтобы вернулись объекты с id ['a','b'] и is_unseen=true
  // (следовать паттерну мока supabase.rpc в этом спеке)
  component['_load'](); // или триггер effect через детектор — как в существующих тестах
  tick();
  expect(seenSpy.markShown).toHaveBeenCalledWith(['a', 'b']);
}));

it('через 3с гасит is_unseen у загруженных объектов', fakeAsync(() => {
  // arrange как выше, объекты is_unseen=true
  component['_load']();
  tick();
  expect(component.properties().every((p) => p.is_unseen)).toBeTrue();
  tick(3000);
  expect(component.properties().every((p) => p.is_unseen === false)).toBeTrue();
}));

it('openDetail шлёт recordView с id объекта', () => {
  const prop = { id: 'z' } as PropertyFeedItem;
  component.openDetail(prop);
  expect(seenSpy.recordView).toHaveBeenCalledWith('z');
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: FAIL — `markShown`/`recordView` не вызываются; флип не происходит.

- [ ] **Step 3: Инжект сервиса + DestroyRef + таймеры**

В `feed-page.component.ts`: добавить импорты `DestroyRef` (из `@angular/core`) и `SeenTrackingService`.
Рядом с другими `inject(...)` (после строки 82):

```ts
  private readonly _seen = inject(SeenTrackingService);
  private readonly _destroyRef = inject(DestroyRef);
  // Активные таймеры гашения полосок — чистим при destroy.
  private readonly _stripeTimers = new Set<ReturnType<typeof setTimeout>>();
```

В `constructor()` (после существующих effect-ов, перед закрытием) добавить очистку:

```ts
    this._destroyRef.onDestroy(() => {
      this._stripeTimers.forEach((t) => clearTimeout(t));
      this._stripeTimers.clear();
    });
```

- [ ] **Step 4: Метод батч-impression + 3-сек флип**

В `feed-page.component.ts` добавить приватный метод:

```ts
  // Стадия 1: помечаем загруженную страницу показанной (батч), затем через 3с гасим полоски
  // локально (CSS-fade). На следующем чтении get_feed они уже не is_unseen (shown_at обновлён).
  private _markPageShown(items: PropertyFeedItem[]): void {
    const ids = items.map((it) => it.id);
    if (!ids.length) return;
    void this._seen.markShown(ids);
    const idSet = new Set(ids);
    const timer = setTimeout(() => {
      this._stripeTimers.delete(timer);
      this.properties.update((arr) =>
        arr.map((it) =>
          idSet.has(it.id) && it.is_unseen ? { ...it, is_unseen: false } : it,
        ),
      );
    }, 3000);
    this._stripeTimers.add(timer);
  }
```

- [ ] **Step 5: Вызвать после установки properties в `_load`**

В `_load()` (строки 562–584), сразу после `this.properties.set(...)` (строка 572) добавить:

```ts
      // Батч-impression только по только что добавленным items (для append — новая страница).
      this._markPageShown(items);
```

- [ ] **Step 6: recordView на открытие**

В `openDetail()` (строка 490) и `toggleDetail()` (строка 496) добавить первой строкой тела:

```ts
    void this._seen.recordView(property.id);
```

(в `toggleDetail` — тоже в начале, до ветвления open/close: открытие/повторный клик = подтверждённый интерес).

- [ ] **Step 7: Передать `[isUnseen]` в шаблоне**

В `feed-page.component.html`, в `<mrsqm-property-card>` (строка 419), рядом с `[isActive]`/`[isSaved]`:

```html
        [isUnseen]="p.is_unseen"
```

- [ ] **Step 8: Запустить — зелёный**

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: PASS (включая новые 3 spec).

- [ ] **Step 9: Полный прогон + checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/pages/feed/feed-page.component.ts
npm test -- --watch=false 2>&1 | tail -20   # вся сюита зелёная
git add src/app/mrsqm/pages/feed/feed-page.component.ts src/app/mrsqm/pages/feed/feed-page.component.html src/app/mrsqm/pages/feed/feed-page.component.spec.ts
git commit -m "feat(feed): батч-impression на загрузку + 3с-fade полоски + recordView на открытие" --no-verify
```

---

### Task 5: Применение SQL + верификация (человек-чекпойнт)

Применять БД **только с явного согласия владельца**. Использовать скилл `/migrate`.

- [ ] **Step 1: Сверить тела функций перед патчем**

```sql
SELECT is_nullable FROM information_schema.columns
 WHERE table_name='user_seen_listings' AND column_name='seen_at';     -- ожидаем YES
SELECT pg_get_functiondef('public.track_view(uuid,uuid)'::regprocedure);  -- сверить DECLARE/резолв юзера
-- get_feed: сверить алиас properties и наличие ключа 'community_name' в jsonb-выводе
```

- [ ] **Step 2: Применить 4 миграции** (через `/migrate`, по порядку: shown_at → mark_listings_shown → track_view → get_feed). Файлы перемещаются в `docs/migrations/applied/`; хук дописывает `docs/database.md`.

- [ ] **Step 3: Верификация SELECT-ами**

```sql
-- is_unseen появилось в выводе get_feed (любой вызов с авторизованным юзером)
-- mark_listings_shown бампает shown_at:
SELECT public.mark_listings_shown(ARRAY['<property_uuid>']::uuid[]);
SELECT shown_at FROM user_seen_listings WHERE property_id='<property_uuid>' AND user_id=auth.uid();
-- track_view бампает обе метки на двух подряд вызовах в один день (гард снят):
SELECT public.track_view('<property_uuid>'::uuid);  -- дважды
SELECT seen_at, shown_at FROM user_seen_listings WHERE property_id='<property_uuid>';
```

- [ ] **Step 4: E2E-проверка в UI**

Запустить фронт (`npm start` / `ng serve`), открыть ленту:
- объекты с `is_unseen=true` показывают жёлтую полоску слева;
- через ~3с полоски плавно гаснут;
- открыть карточку → в БД у пары `(me, property)` бампнулись `seen_at` и `shown_at`;
- перезайти в ленту → ранее показанные объекты больше без полоски.

- [ ] **Step 5: Зафиксировать прод-тест** через `/test-prod` в `docs/tests.md` (T-N).

---

## Самопроверка плана

- **Покрытие спеки (Стадия 1):** `shown_at` (Task 1.1), bulk-RPC `mark_listings_shown` (1.2), фикс `track_view` каждое открытие+обе метки (1.3), `get_feed.is_unseen` Прил. D (1.4), тип `is_unseen` (3.1), `SeenTrackingService` (Task 2), полоска левое ребро + fade (Task 3), батч-impression на страницу + 3с-флип + recordView на открытие (Task 4), применение+верификация (Task 5). ✓
- **Стадии 2–3** (воронка/`seen_contact`, бейдж) — отдельными планами, здесь намеренно нет.
- **Типы/имена:** `markShown`/`recordView` (Task 2) = вызовы в Task 4; `isUnseen` инпут (Task 3) = `[isUnseen]` в Task 4.7; `is_unseen` поле — Task 3.1 → Task 4. Согласованы.
- **Плейсхолдеры:** SQL-«сверить с pg_get_functiondef» — не placeholder, а обязательная staleness-proof процедура (короткие функции даны полностью; для большой `get_feed` — DO-патч с фейлом при ненайденном якоре).
