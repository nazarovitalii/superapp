# Бейдж непросмотра по фильтру + фикс свечения своих объектов — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Свои объекты больше не светятся капсулой; бейдж сохранённого фильтра гаснет только при заходе в фильтр и частично — ровно на показанные внутри него объекты.

**Architecture:** Всё read-side (наши БД-функции + Angular-фронт). Капсула (`get_feed.is_unseen`) получает owner-skip. Бейдж (`get_saved_filters.unseen_count`) отвязывается от глобального `shown_at` и считается по новой таблице `user_filter_seen` (что юзер видел в контексте конкретного фильтра). Фронт при активном сохранённом фильтре помечает показанные чужие объекты (RPC + оптимистичное вычитание из бейджа).

**Tech Stack:** PostgreSQL (Supabase self-hosted), Angular standalone + signals, Jasmine/Karma.

## Global Constraints

- Миграции БД применяются **только после явного «да» создателя** (объяснить → спросить → ждать). SQL пишем в `docs/migrations/`, после применения `git mv` в `docs/migrations/applied/`.
- Staleness-proof патчи функций: править по **живому** `pg_get_functiondef`, НЕ переписывать тело из `docs/database.md` (там оно устаревшее). Каждый патч идемпотентен (skip если уже применён) и RAISE если якорь не найден.
- `npm run checkFile <file>` на каждый изменённый `.ts`/`.scss` перед сдачей.
- Strict TypeScript: без `any`. Сигналы предпочтительнее RxJS. NgRx-стейт не мутировать (здесь не затрагивается).
- UI-строки и комментарии — на русском.
- Перед пушем гейт: `npm run lint && npm run buildFrontend:prodWeb`. Husky pre-push flaky — `--no-verify` допустим, только если гейт прошёл.
- Один push, все коммиты вместе (CI cancel-in-progress: true).
- Применённый матчер realtime и таблицу `filter_matches` НЕ трогаем — только читаем.

---

## File Structure

**Миграции (новые файлы в `docs/migrations/`):**
- `2026-06-22-get-feed-is-unseen-owner-skip.sql` — патч `is_unseen` (Баг A).
- `2026-06-22-user-filter-seen-table.sql` — таблица `user_filter_seen` + RLS.
- `2026-06-22-mark-filter-seen-rpc.sql` — RPC `mark_filter_seen`.
- `2026-06-22-get-saved-filters-per-filter-seen.sql` — патч `unseen_count`.

**Фронт (модификации):**
- `src/app/mrsqm/services/seen-tracking.service.ts` (+ `.spec.ts`) — метод `markFilterSeen`.
- `src/app/mrsqm/services/saved-filter.service.ts` (+ `.spec.ts`) — локальный seen-стейт.
- `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts` + `.html` (+ `.spec.ts`) — эффективный бейдж + сброс локального стейта.
- `src/app/mrsqm/pages/feed/feed-page.component.ts` (+ `.spec.ts`) — пометка показанных в фильтре.

**Зависимости задач:** DB-блок (Tasks 1–4) применяется одним gate'ом после одобрения; порядок применения 1, затем 2 → 3 → 4. Фронт (Tasks 5–8) пишется/тестируется независимо от применения БД (моки); порядок 5, 6 → 7, 8. Task 9 — финальная верификация после применения БД + деплоя.

---

## Task 1: Миграция — owner-skip в `get_feed.is_unseen` (Баг A)

**Files:**
- Create: `docs/migrations/2026-06-22-get-feed-is-unseen-owner-skip.sql`

**Interfaces:**
- Produces: живой `get_feed` отдаёт `is_unseen=false` для объектов, где `owner_id = текущий юзер`.

- [ ] **Step 1: Написать SQL-миграцию**

Create `docs/migrations/2026-06-22-get-feed-is-unseen-owner-skip.sql`:

```sql
-- Баг A: свои объекты вечно светятся. is_unseen в get_feed не учитывал владельца,
-- а mark_listings_shown намеренно пропускает свои объекты → shown_at=NULL → is_unseen
-- вечно true. Фикс: свои объекты всегда is_unseen=false (owner-skip в самом выражении).
-- Staleness-proof: правим по живому pg_get_functiondef, вставляя owner-skip перед GREATEST.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_feed' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  IF position('p.owner_id IS DISTINCT FROM COALESCE(p_user_id, auth.uid()) AND GREATEST(p.created_at' in v_def) > 0 THEN
    RAISE NOTICE 'get_feed owner-skip: уже применено — пропускаю';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_def,
    E'(''is_unseen''[[:space:]]*,[[:space:]]*\\()(GREATEST\\(p\\.created_at)',
    E'\\1p.owner_id IS DISTINCT FROM COALESCE(p_user_id, auth.uid()) AND \\2'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed owner-skip: якорь is_unseen/GREATEST не найден — тело изменилось, патч прерван';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed.is_unseen: owner-skip применён';
END
$migrate$;
```

- [ ] **Step 2: Закоммитить миграцию (pending)**

```bash
git add docs/migrations/2026-06-22-get-feed-is-unseen-owner-skip.sql
git commit -m "migrate(feed): owner-skip в get_feed.is_unseen — свои объекты не светятся"
```

- [ ] **Step 3: ⛔ ЧЕЛОВЕК-ГЕЙТ — применяется в Task 4 вместе с остальными**

Не применять сейчас. Применение всех 4 миграций — одним одобренным блоком в конце Task 4 (см. там).

---

## Task 2: Миграция — таблица `user_filter_seen` + RLS

**Files:**
- Create: `docs/migrations/2026-06-22-user-filter-seen-table.sql`

**Interfaces:**
- Produces: таблица `public.user_filter_seen(user_id, filter_id, property_id, seen_at)` с RLS «только свои строки».

- [ ] **Step 1: Написать SQL-миграцию**

Create `docs/migrations/2026-06-22-user-filter-seen-table.sql`:

```sql
-- Баг B: бейдж фильтра отвязываем от глобального shown_at. Эта таблица хранит,
-- какие объекты юзер видел В КОНТЕКСТЕ конкретного фильтра. Отдельная от filter_matches
-- (та — realtime, перезаливается при DLQ re-enqueue → seen-состояние терялось бы).
-- Идемпотентно. RLS: юзер видит/пишет только свои строки.
CREATE TABLE IF NOT EXISTS public.user_filter_seen (
  user_id     uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  filter_id   uuid        NOT NULL REFERENCES public.saved_filters(id) ON DELETE CASCADE,
  property_id uuid        NOT NULL REFERENCES public.properties(id)  ON DELETE CASCADE,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, filter_id, property_id)
);

-- Индекс под предикат бейджа (фильтр + объект для NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_user_filter_seen_filter_prop
  ON public.user_filter_seen (filter_id, property_id);

ALTER TABLE public.user_filter_seen ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_filter_seen' AND policyname='ufs_select_own'
  ) THEN
    CREATE POLICY ufs_select_own ON public.user_filter_seen
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_filter_seen' AND policyname='ufs_insert_own'
  ) THEN
    CREATE POLICY ufs_insert_own ON public.user_filter_seen
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END
$rls$;

GRANT SELECT, INSERT ON public.user_filter_seen TO authenticated;
```

- [ ] **Step 2: Закоммитить миграцию (pending)**

```bash
git add docs/migrations/2026-06-22-user-filter-seen-table.sql
git commit -m "migrate(feed): таблица user_filter_seen + RLS (seen-по-фильтру)"
```

- [ ] **Step 3: ⛔ ЧЕЛОВЕК-ГЕЙТ — применяется в Task 4**

Не применять сейчас.

---

## Task 3: Миграция — RPC `mark_filter_seen`

**Files:**
- Create: `docs/migrations/2026-06-22-mark-filter-seen-rpc.sql`

**Interfaces:**
- Consumes: таблица `user_filter_seen` (Task 2).
- Produces: RPC `public.mark_filter_seen(p_filter_id uuid, p_property_ids uuid[]) RETURNS void` для `authenticated`. Фронт вызывает его именами параметров `p_filter_id`, `p_property_ids`.

- [ ] **Step 1: Написать SQL-миграцию**

Create `docs/migrations/2026-06-22-mark-filter-seen-rpc.sql`:

```sql
-- Помечает объекты просмотренными в контексте фильтра (для частичного гашения бейджа).
-- SECURITY DEFINER, но вставляет строки ТОЛЬКО для фильтров, принадлежащих auth.uid()
-- (подзапрос по saved_filters) — нельзя пометить чужой фильтр. ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.mark_filter_seen(p_filter_id uuid, p_property_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_filter_seen (user_id, filter_id, property_id)
  SELECT auth.uid(), p_filter_id, pid
  FROM unnest(p_property_ids) AS pid
  WHERE EXISTS (
    SELECT 1 FROM public.saved_filters sf
    WHERE sf.id = p_filter_id AND sf.user_id = auth.uid()
  )
  ON CONFLICT (user_id, filter_id, property_id) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.mark_filter_seen(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_filter_seen(uuid, uuid[]) TO authenticated;
```

- [ ] **Step 2: Закоммитить миграцию (pending)**

```bash
git add docs/migrations/2026-06-22-mark-filter-seen-rpc.sql
git commit -m "migrate(feed): RPC mark_filter_seen (пометка seen-по-фильтру)"
```

- [ ] **Step 3: ⛔ ЧЕЛОВЕК-ГЕЙТ — применяется в Task 4**

Не применять сейчас.

---

## Task 4: Миграция — `get_saved_filters.unseen_count` по seen-фильтру + применить весь DB-блок

**Files:**
- Create: `docs/migrations/2026-06-22-get-saved-filters-per-filter-seen.sql`

**Interfaces:**
- Consumes: таблица `user_filter_seen` (Task 2).
- Produces: живой `get_saved_filters` считает `unseen_count` = активные матчи фильтра, которых нет в `user_filter_seen`.

- [ ] **Step 1: Написать SQL-миграцию**

Create `docs/migrations/2026-06-22-get-saved-filters-per-filter-seen.sql`:

```sql
-- Баг B: unseen_count перестаёт зависеть от глобального shown_at. Теперь = активные
-- матчи фильтра, которых юзер ещё НЕ видел в этом фильтре (NOT EXISTS user_filter_seen).
-- Staleness-proof: заменяем ТОЛЬКО значение ключа 'unseen_count' в jsonb_build_object,
-- якорясь между 'unseen_count', и следующим ключом 'notification_type'. Якорь надёжен:
-- порядок ключей в функции стабилен (см. docs/database.md get_saved_filters).
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_expr text := '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
              || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
              || 'WHERE fm.filter_id = sf.id AND NOT EXISTS ('
              || 'SELECT 1 FROM user_filter_seen ufs WHERE ufs.user_id = sf.user_id '
              || 'AND ufs.filter_id = sf.id AND ufs.property_id = fm.property_id))';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  IF position('user_filter_seen' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters per-filter-seen: уже применено — пропускаю';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_def,
    E'(''unseen_count''[[:space:]]*,[[:space:]]*).*?([[:space:]]*,[[:space:]]*''notification_type'')',
    E'\\1' || v_expr || E'\\2'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_saved_filters: якорь unseen_count..notification_type не найден — тело изменилось';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_saved_filters.unseen_count: переведён на user_filter_seen';
END
$migrate$;
```

- [ ] **Step 2: Закоммитить миграцию (pending)**

```bash
git add docs/migrations/2026-06-22-get-saved-filters-per-filter-seen.sql
git commit -m "migrate(feed): get_saved_filters.unseen_count по user_filter_seen"
```

- [ ] **Step 3: ⛔ ЧЕЛОВЕК-ГЕЙТ — получить явное «да» создателя на применение 4 миграций**

Показать создателю, что применяется (таблица + 2 RPC-патча + 1 новый RPC), и ждать «да». Без согласия — стоп.

- [ ] **Step 4: Применить миграции по порядку (после «да»)**

```bash
cd /Users/vitaliinazarov/Projects/superapp
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-22-user-filter-seen-table.sql
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-22-mark-filter-seen-rpc.sql
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-22-get-saved-filters-per-filter-seen.sql
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-22-get-feed-is-unseen-owner-skip.sql
```
Expected: каждая печатает `NOTICE` об успехе, без ERROR.

- [ ] **Step 5: Проверить, что патчи легли (definition-check)**

Выполнить через `psql.sh` (или apply-migration helper) на проде:

```sql
SELECT
  position('user_filter_seen' in pg_get_functiondef('public.get_saved_filters'::regproc)) > 0          AS saved_filters_patched,
  position('p.owner_id IS DISTINCT FROM COALESCE(p_user_id, auth.uid()) AND GREATEST(p.created_at'
           in pg_get_functiondef('public.get_feed'::regproc)) > 0                                       AS feed_patched,
  to_regprocedure('public.mark_filter_seen(uuid, uuid[])') IS NOT NULL                                  AS rpc_exists,
  to_regclass('public.user_filter_seen') IS NOT NULL                                                    AS table_exists;
```
Expected: все четыре `t`.

- [ ] **Step 6: Переместить применённые миграции в applied/ и обновить доки**

```bash
cd /Users/vitaliinazarov/Projects/superapp
git mv docs/migrations/2026-06-22-get-feed-is-unseen-owner-skip.sql docs/migrations/applied/
git mv docs/migrations/2026-06-22-user-filter-seen-table.sql docs/migrations/applied/
git mv docs/migrations/2026-06-22-mark-filter-seen-rpc.sql docs/migrations/applied/
git mv docs/migrations/2026-06-22-get-saved-filters-per-filter-seen.sql docs/migrations/applied/
git commit -m "migrate(feed): применены — owner-skip + user_filter_seen + mark_filter_seen + unseen_count"
```
(Хук обновит `docs/database.md` при коммите.)

---

## Task 5: `SeenTrackingService.markFilterSeen`

**Files:**
- Modify: `src/app/mrsqm/services/seen-tracking.service.ts`
- Test: `src/app/mrsqm/services/seen-tracking.service.spec.ts`

**Interfaces:**
- Consumes: RPC `mark_filter_seen` (Task 3).
- Produces: `markFilterSeen(filterId: string, propertyIds: string[]): Promise<void>`.

- [ ] **Step 1: Написать падающий тест**

В `seen-tracking.service.spec.ts` добавить в существующий `describe`:

```typescript
it('markFilterSeen шлёт filterId+ids в mark_filter_seen', async () => {
  await service.markFilterSeen('f1', ['a', 'b']);
  expect(rpc).toHaveBeenCalledWith('mark_filter_seen', {
    p_filter_id: 'f1',
    p_property_ids: ['a', 'b'],
  });
});

it('markFilterSeen с пустым массивом — no-op', async () => {
  await service.markFilterSeen('f1', []);
  expect(rpc).not.toHaveBeenCalled();
});

it('markFilterSeen не пробрасывает ошибку RPC', async () => {
  rpc.and.rejectWith(new Error('boom'));
  await expectAsync(service.markFilterSeen('f1', ['a'])).toBeResolved();
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/seen-tracking.service.spec.ts`
Expected: FAIL — `service.markFilterSeen is not a function`.

- [ ] **Step 3: Реализовать метод**

В `seen-tracking.service.ts` после `markShown` добавить:

```typescript
  // Стадия (Баг B): пометить объекты просмотренными в контексте сохранённого фильтра.
  // Гасит бейдж этого фильтра ровно на показанные внутри него объекты. Fire-and-forget.
  async markFilterSeen(filterId: string, propertyIds: string[]): Promise<void> {
    if (!propertyIds.length) return;
    try {
      await this._supabase.rpc('mark_filter_seen', {
        p_filter_id: filterId,
        p_property_ids: propertyIds,
      });
    } catch (e) {
      console.error('[SeenTrackingService] markFilterSeen ошибка:', e);
    }
  }
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/services/seen-tracking.service.spec.ts`
Expected: PASS (все, включая прежние).

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/services/seen-tracking.service.ts
npm run checkFile src/app/mrsqm/services/seen-tracking.service.spec.ts
git add src/app/mrsqm/services/seen-tracking.service.ts src/app/mrsqm/services/seen-tracking.service.spec.ts
git commit -m "feat(feed): SeenTrackingService.markFilterSeen"
```

---

## Task 6: `SavedFilterService` — локальный seen-стейт (оптимистичный бейдж)

**Files:**
- Modify: `src/app/mrsqm/services/saved-filter.service.ts`
- Test: `src/app/mrsqm/services/saved-filter.service.spec.ts`

**Interfaces:**
- Produces:
  - `markSeenLocally(filterId: string, propertyIds: string[]): void`
  - `clearLocalSeen(): void`
  - `localSeenCount(filterId: string): number`
  - сигнал `localFilterSeen` (readonly) — чтобы потребители (панель) реактивно пересчитывались.

- [ ] **Step 1: Написать падающий тест**

В `saved-filter.service.spec.ts` добавить (если файла нет — создать с TestBed на root-сервис; мок `MrsqmSupabaseService` с `rpc`/`client` по образцу seen-tracking spec):

```typescript
it('markSeenLocally копит уникальные id по фильтру', () => {
  service.markSeenLocally('f1', ['a', 'b']);
  service.markSeenLocally('f1', ['b', 'c']);
  expect(service.localSeenCount('f1')).toBe(3);
  expect(service.localSeenCount('f2')).toBe(0);
});

it('clearLocalSeen обнуляет локальный seen', () => {
  service.markSeenLocally('f1', ['a']);
  service.clearLocalSeen();
  expect(service.localSeenCount('f1')).toBe(0);
});

it('markSeenLocally с пустым массивом — no-op', () => {
  service.markSeenLocally('f1', []);
  expect(service.localSeenCount('f1')).toBe(0);
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/saved-filter.service.spec.ts`
Expected: FAIL — `service.markSeenLocally is not a function`.

- [ ] **Step 3: Реализовать**

В `saved-filter.service.ts`: добавить импорт `signal` из `@angular/core` (в существующий импорт), и в класс:

```typescript
  // Оптимистичный локальный seen-по-фильтру: Map<filterId, Set<propertyId>>.
  // Вычитается из серверного unseen_count до следующего list() (там сброс — сервер уже учёл).
  private readonly _localFilterSeen = signal<Map<string, Set<string>>>(new Map());
  readonly localFilterSeen = this._localFilterSeen.asReadonly();

  // Сколько объектов помечено локально просмотренными в данном фильтре.
  localSeenCount(filterId: string): number {
    return this._localFilterSeen().get(filterId)?.size ?? 0;
  }

  // Пометить объекты просмотренными в фильтре (оптимистично, без round-trip).
  markSeenLocally(filterId: string, propertyIds: string[]): void {
    if (!propertyIds.length) return;
    const map = new Map(this._localFilterSeen());
    const set = new Set(map.get(filterId) ?? []);
    for (const id of propertyIds) set.add(id);
    map.set(filterId, set);
    this._localFilterSeen.set(map);
  }

  // Сброс локального seen (после list(): сервер уже отдал актуальные unseen_count).
  clearLocalSeen(): void {
    if (this._localFilterSeen().size) {
      this._localFilterSeen.set(new Map());
    }
  }
```

Обновить строку импорта Angular (вверху файла):

```typescript
import { inject, Injectable, signal } from '@angular/core';
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/services/saved-filter.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/services/saved-filter.service.ts
npm run checkFile src/app/mrsqm/services/saved-filter.service.spec.ts
git add src/app/mrsqm/services/saved-filter.service.ts src/app/mrsqm/services/saved-filter.service.spec.ts
git commit -m "feat(feed): SavedFilterService локальный seen-по-фильтру (оптимистичный бейдж)"
```

---

## Task 7: Панель — эффективный бейдж + сброс локального seen при перезагрузке

**Files:**
- Modify: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts`
- Modify: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.html`
- Test: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`

**Interfaces:**
- Consumes: `SavedFilterService.localSeenCount`, `.clearLocalSeen`, `.localFilterSeen` (Task 6).
- Produces: `savedFiltersView` (computed) с полем `displayUnseen` (≥0).

- [ ] **Step 1: Написать падающий тест**

В `feed-filter-panel.component.spec.ts` добавить (использовать существующий TestBed-сетап компонента; `_savedSvc` — реальный root-сервис):

```typescript
it('savedFiltersView вычитает локальный seen и не уходит ниже 0', () => {
  component.savedFilters.set([
    { id: 'f1', auto_name: 'A', unseen_count: 5 } as never,
    { id: 'f2', auto_name: 'B', unseen_count: 1 } as never,
  ]);
  component._savedSvc.markSeenLocally('f1', ['a', 'b']); // 5 - 2 = 3
  component._savedSvc.markSeenLocally('f2', ['x', 'y']); // 1 - 2 → 0 (clamp)

  const view = component.savedFiltersView();
  expect(view.find((f) => f.id === 'f1')?.displayUnseen).toBe(3);
  expect(view.find((f) => f.id === 'f2')?.displayUnseen).toBe(0);
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`
Expected: FAIL — `component.savedFiltersView is not a function`.

- [ ] **Step 3: Реализовать computed + сброс**

В `feed-filter-panel.component.ts`:
- добавить `computed` в импорт из `@angular/core` (если ещё нет);
- после объявления `savedFilters` добавить:

```typescript
  // Бейдж с учётом оптимистично просмотренных в фильтре объектов (≥0).
  readonly savedFiltersView = computed(() =>
    this.savedFilters().map((f) => ({
      ...f,
      displayUnseen: Math.max(0, f.unseen_count - this._savedSvc.localSeenCount(f.id)),
    })),
  );
```

- в `_loadSavedFilters()` после `this.savedFilters.set(list);` добавить сброс (сервер уже учёл seen):

```typescript
      this.savedFilters.set(list);
      this._savedSvc.clearLocalSeen();
```

- [ ] **Step 4: Обновить шаблон**

В `feed-filter-panel.component.html`: в блоке сохранённых фильтров заменить итерацию и бейдж.

Заменить:
```html
          @for (f of savedFilters(); track f.id) {
```
на:
```html
          @for (f of savedFiltersView(); track f.id) {
```

Заменить:
```html
              @if (f.unseen_count > 0) {
                <!-- Бейдж непросмотренных объектов по этому фильтру -->
                <span class="saved-filter-badge">{{ f.unseen_count }}</span>
              }
```
на:
```html
              @if (f.displayUnseen > 0) {
                <!-- Бейдж непросмотренных объектов по этому фильтру (минус просмотренные в нём) -->
                <span class="saved-filter-badge">{{ f.displayUnseen }}</span>
              }
```

(Остальные ссылки на `f.id`, `f.auto_name` остаются — view-модель их содержит через spread.)

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts
npm run checkFile src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts
git add src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.html src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts
git commit -m "feat(feed): эффективный бейдж фильтра (вычет локального seen) + сброс при перезагрузке"
```

---

## Task 8: Лента — помечать показанные в активном фильтре объекты

**Files:**
- Modify: `src/app/mrsqm/pages/feed/feed-page.component.ts` (метод `_markPageShown`, ~line 579; блок инъекций ~line 79)
- Test: `src/app/mrsqm/pages/feed/feed-page.component.spec.ts`

**Interfaces:**
- Consumes: `SeenTrackingService.markFilterSeen` (Task 5), `SavedFilterService.markSeenLocally` (Task 6), `FeedFilterService.loadedFilterId`, `MrsqmAuthService.currentUser`.

- [ ] **Step 1: Написать падающий тест**

В `feed-page.component.spec.ts` (использовать существующий TestBed-сетап; добавить spy на `SeenTrackingService.markFilterSeen` и `SavedFilterService.markSeenLocally`):

```typescript
it('при активном фильтре помечает показанные чужие объекты (не свои)', () => {
  const markFilterSeen = spyOn(
    TestBed.inject(SeenTrackingService),
    'markFilterSeen',
  ).and.resolveTo();
  const markLocal = spyOn(TestBed.inject(SavedFilterService), 'markSeenLocally');

  // Активен сохранённый фильтр f1; текущий юзер — me.
  TestBed.inject(FeedFilterService).loadedFilterId.set('f1');
  spyOn(TestBed.inject(MrsqmAuthService), 'currentUser').and.returnValue({
    id: 'me',
  } as never);

  // Прямой вызов приватного хелпера через каст (минимизируем поверхность теста).
  (component as unknown as {
    _markPageShown(items: PropertyFeedItem[]): void;
  })._markPageShown([
    { id: 'p1', owner_id: 'other' } as PropertyFeedItem,
    { id: 'p2', owner_id: 'me' } as PropertyFeedItem, // свой — не считаем
  ]);

  expect(markFilterSeen).toHaveBeenCalledWith('f1', ['p1']);
  expect(markLocal).toHaveBeenCalledWith('f1', ['p1']);
});

it('без активного фильтра markFilterSeen не вызывается', () => {
  const markFilterSeen = spyOn(
    TestBed.inject(SeenTrackingService),
    'markFilterSeen',
  ).and.resolveTo();
  TestBed.inject(FeedFilterService).loadedFilterId.set(null);

  (component as unknown as {
    _markPageShown(items: PropertyFeedItem[]): void;
  })._markPageShown([{ id: 'p1', owner_id: 'other' } as PropertyFeedItem]);

  expect(markFilterSeen).not.toHaveBeenCalled();
});
```

Добавить импорты в spec при отсутствии: `SeenTrackingService`, `SavedFilterService`, `FeedFilterService`, `MrsqmAuthService`, `PropertyFeedItem`.

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: FAIL — `markFilterSeen`/`markSeenLocally` не вызваны (логики ещё нет).

- [ ] **Step 3: Добавить инъекцию SavedFilterService**

В блоке инъекций feed-page (рядом с `_seen = inject(SeenTrackingService)`):

```typescript
  private readonly _savedFilters = inject(SavedFilterService);
```

Добавить импорт вверху файла:

```typescript
import { SavedFilterService } from '../../services/saved-filter.service';
```

- [ ] **Step 4: Реализовать пометку в `_markPageShown`**

Заменить тело `_markPageShown` (сохранив существующую логику капсулы/таймера):

```typescript
  // Стадия 1: помечаем загруженную страницу показанной (батч), затем через 5с гасим полоски
  // локально (CSS-fade). На следующем чтении get_feed они уже не is_unseen (shown_at обновлён).
  private _markPageShown(items: PropertyFeedItem[]): void {
    const ids = items.map((it) => it.id);
    if (!ids.length) return;
    void this._seen.markShown(ids);

    // Баг B: если открыт сохранённый фильтр — частично гасим его бейдж ровно на
    // показанные ЧУЖИЕ объекты (свои в матчи не входят — owner-skip матчера).
    const fid = this.filter.loadedFilterId();
    if (fid) {
      const myId = this._auth.currentUser()?.id ?? null;
      const matchIds = items
        .filter((it) => it.owner_id !== myId)
        .map((it) => it.id);
      if (matchIds.length) {
        this._savedFilters.markSeenLocally(fid, matchIds); // оптимистично сразу
        void this._seen.markFilterSeen(fid, matchIds); // сервер подтверждает фоном
      }
    }

    const idSet = new Set(ids);
    const timer = setTimeout(() => {
      this._stripeTimers.delete(timer);
      this.properties.update((arr) =>
        arr.map((it) =>
          idSet.has(it.id) && it.is_unseen ? { ...it, is_unseen: false } : it,
        ),
      );
    }, 5000);
    this._stripeTimers.add(timer);
  }
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/feed/feed-page.component.ts
npm run checkFile src/app/mrsqm/pages/feed/feed-page.component.spec.ts
git add src/app/mrsqm/pages/feed/feed-page.component.ts src/app/mrsqm/pages/feed/feed-page.component.spec.ts
git commit -m "feat(feed): помечать показанные в активном фильтре объекты (частичное гашение бейджа)"
```

---

## Task 9: Гейт сборки, деплой и прод-верификация

**Files:** (нет правок кода — верификация)

- [ ] **Step 1: Полный прогон тестов**

Run: `npm test`
Expected: PASS (новые специи зелёные, без регрессий).

- [ ] **Step 2: Обязательный гейт перед пушем**

Run: `npm run lint && npm run buildFrontend:prodWeb`
Expected: lint 0 ошибок; prod-сборка успешна (AOT/budget OK).

- [ ] **Step 3: Один push (после применённых миграций из Task 4 и зелёного гейта)**

```bash
git push origin main   # при flaky pre-push: git push origin main --no-verify
```
Затем TG-summary деплоя (по конвенции группы, без переспроса).

- [ ] **Step 4: Прод-верификация (после деплоя Coolify ~5–10 мин) — критерии успеха**

Под тест-юзером `test2@mrsqm.dev` / `nazarovitalii` на https://sapp.mrsqm.com:

1. Свой объект в ленте: F5/перезагрузка → капсула **не** появляется на своих. ✅
2. Чужой новый объект: капсула есть, гаснет за 5с после показа. ✅
3. Прокрутка **общей** ленты (без захода в фильтр) → бейдж сохранённого фильтра **не меняется**. ✅
4. Открыть сохранённый фильтр с N>страницы матчей → бейдж уменьшается на число показанных на первой странице (не до 0). ✅
5. Долистать все матчи фильтра → бейдж 0; (опц.) новый матч позже → бейдж снова растёт. ✅

- [ ] **Step 5: Записать прод-тест в журнал**

Добавить запись T-N в `docs/tests.md` (через skill `/test-prod`) с результатами критериев 1–5.

---

## Self-Review

**1. Spec coverage:**
- Баг A (свои светятся) → Task 1. ✅
- `user_filter_seen` таблица + RLS → Task 2. ✅
- `mark_filter_seen` RPC → Task 3. ✅
- `unseen_count` по seen-фильтру → Task 4. ✅
- Фронт `markFilterSeen` → Task 5. ✅
- Оптимистичный бейдж (без бэкфилла) → Task 6 (стейт) + Task 7 (отображение) + Task 8 (запись). ✅
- Граница realtime (ничего не трогаем) → отражено в Global Constraints. ✅
- Критерии успеха 1–5 → Task 9 Step 4. ✅

**2. Placeholder scan:** код приведён в каждом шаге; SQL/тесты/правки полные. Без TBD. ✅

**3. Type consistency:** имена сквозные — `markFilterSeen(filterId, propertyIds)`, RPC `mark_filter_seen(p_filter_id, p_property_ids)`, `markSeenLocally`/`clearLocalSeen`/`localSeenCount`/`localFilterSeen`, `savedFiltersView`/`displayUnseen`, инъекция `_savedFilters`. Совпадают между задачами. ✅

**Edge-кейсы (зафиксированы в спеке):** грязный фильтр — помечаем пока `loadedFilterId` задан; без сохранённого фильтра — `markFilterSeen` не зовётся; оптимистичный перебор по своим объектам исключён фильтром `owner_id !== myId`.
