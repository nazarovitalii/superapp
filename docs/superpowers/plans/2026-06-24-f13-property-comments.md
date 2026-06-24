# F-13 — комментарии к объектам · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Оживить вкладку «Комментарии» в карточке объекта — публичные комментарии с 1-уровневыми тредами (как FB) + приватные личные заметки, только текст.

**Architecture:** Серверный слой — ALTER существующей `property_comments` (+`is_private`,`updated_at`) + 4 SECURITY DEFINER RPC (get/add/edit/delete) с гейтом видимости через helper `_can_see_property` (1:1 с `get_property`) + RLS-backstop + триггер счётчика. Фронт — отдельный standalone-компонент `property-comments` + тонкий сервис; карточка `property-detail` подключает его вместо инлайн-заглушки.

**Tech Stack:** Angular (standalone, signals, OnPush), Supabase (PostgREST RPC, PL/pgSQL), Jasmine/Karma.

## Global Constraints

- UI-строки и комментарии в коде — **на русском** (raw-RU литералы, НЕ `T`/TranslateService — таков паттерн MrSQM).
- Весь код — в `src/app/mrsqm/`. Апстрим SP не трогать.
- Без `any` (strict TS); `unknown` если правда неизвестно.
- Сигналы предпочесть Observable; подписки чистить (тут — сигналы/`async`, подписок нет).
- Никаких локальных оверрайдов Material/`.mat-*`/`.mdc-*`; переиспользовать SP-токены и классы.
- RPC: клиент `p_user_id` НЕ передаёт — сервер берёт `auth.uid()` из JWT.
- **DDL на прод — только после явного «да» создателя.** Миграция применяется под `supabase_admin` через `.claude/skills/migrate/tools/apply-migration.sh`; смоук — `psql.sh`.
- Деплой-гейт перед пушем: `npm run lint && npm run buildFrontend:prodWeb`.
- `npm run checkFile <path>` на каждый изменённый `.ts`/`.scss` перед сдачей задачи.
- Коммиты: `type(scope): описание` (`feat`/`fix`/`docs`/`test`), trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Файловая структура

| Файл | Ответственность | Действие |
| --- | --- | --- |
| `docs/migrations/2026-06-24-f13-property-comments.sql` | ALTER + helper + 4 RPC + RLS/GRANT + триггер счётчика + бэкфилл | Create |
| `src/app/mrsqm/util/relative-time.ts` | pure `relativeTimeRu(date)` → RU-строка | Create |
| `src/app/mrsqm/util/relative-time.spec.ts` | тесты утиля | Create |
| `src/app/mrsqm/types/database.ts` | интерфейс `PropertyComment` | Modify |
| `src/app/mrsqm/services/property-comments.service.ts` | обёртка 4 RPC | Create |
| `src/app/mrsqm/services/property-comments.service.spec.ts` | юнит сервиса | Create |
| `src/app/mrsqm/components/property-comments/property-comments.component.ts` | весь таб комментариев | Create |
| `src/app/mrsqm/components/property-comments/property-comments.component.html` | разметка таба | Create |
| `src/app/mrsqm/components/property-comments/property-comments.component.scss` | стили таба (перенос из карточки) | Create |
| `src/app/mrsqm/components/property-comments/property-comments.component.spec.ts` | юнит компонента | Create |
| `src/app/mrsqm/components/property-detail/property-detail.component.html` | подключить `<mrsqm-property-comments>`, убрать инлайн-заглушку | Modify |
| `src/app/mrsqm/components/property-detail/property-detail.component.ts` | убрать `commentsScope`/`setCommentsScope`, импорт компонента | Modify |
| `src/app/mrsqm/components/property-detail/property-detail.component.scss` | удалить перенесённые стили коммент-таба | Modify |
| `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts` | поправить под новую разметку | Modify |

---

## Task 1: Миграция БД (схема + RPC + RLS + счётчик)

**Files:**
- Create: `docs/migrations/2026-06-24-f13-property-comments.sql`

**Interfaces:**
- Produces (RPC-контракт для Task 3):
  - `get_property_comments(p_property_id uuid)` → `TABLE(id uuid, parent_id uuid, is_private boolean, body text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz, user_id uuid, author_name text, author_avatar text, is_mine boolean)`
  - `add_property_comment(p_property_id uuid, p_body text, p_parent_id uuid DEFAULT NULL, p_is_private boolean DEFAULT false)` → `uuid` (id новой строки)
  - `edit_property_comment(p_comment_id uuid, p_body text)` → `boolean`
  - `delete_property_comment(p_comment_id uuid)` → `boolean`

- [ ] **Step 1: Написать файл миграции**

Создать `docs/migrations/2026-06-24-f13-property-comments.sql` с содержимым:

```sql
-- F-13 — комментарии к объектам. Оживляет существующую property_comments.
-- Применять под supabase_admin. Идемпотентно (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- ОБРАТИМО: см. блок ОТКАТ внизу.

-- (1) Схема: приватность + время правки + ограничение «приватные только верхнего уровня».
ALTER TABLE public.property_comments
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.property_comments
  DROP CONSTRAINT IF EXISTS property_comments_private_toplevel_chk;
ALTER TABLE public.property_comments
  ADD CONSTRAINT property_comments_private_toplevel_chk
  CHECK (NOT is_private OR parent_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_property_comments_property_created
  ON public.property_comments (property_id, created_at);

-- (2) Helper видимости — 1:1 с гейтом get_property (owner ∨ active∧public ∨ active∧network-в-сети).
--     Сеть = user_network(friend_ids + colleague_ids), как в get_feed ШАГ 3.
CREATE OR REPLACE FUNCTION public._can_see_property(p_property_id uuid)
  RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_network_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network WHERE user_id = v_uid;
  IF v_network_ids IS NULL THEN v_network_ids := ARRAY[]::uuid[]; END IF;

  RETURN EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = p_property_id
      AND (
        p.owner_id = v_uid
        OR (p.status = 'active' AND p.visibility = 'public')
        OR (p.status = 'active' AND p.visibility = 'network'
            AND p.owner_id = ANY(v_network_ids))
      )
  );
END; $fn$;

-- (3) Чтение: публичные (неудалённые ИЛИ удалённые-с-ответами=тумбстоун) + свои приватные.
CREATE OR REPLACE FUNCTION public.get_property_comments(p_property_id uuid)
  RETURNS TABLE(id uuid, parent_id uuid, is_private boolean, body text,
                created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
                user_id uuid, author_name text, author_avatar text, is_mine boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._can_see_property(p_property_id) THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.parent_id, c.is_private,
           CASE WHEN c.deleted_at IS NOT NULL THEN NULL ELSE c.body END AS body,
           c.created_at, c.updated_at, c.deleted_at,
           c.user_id,
           u.full_name AS author_name,
           (SELECT photo_url FROM user_settings WHERE user_id = c.user_id LIMIT 1) AS author_avatar,
           (c.user_id = v_uid) AS is_mine
      FROM property_comments c
      LEFT JOIN users u ON u.id = c.user_id
     WHERE c.property_id = p_property_id
       AND (
         (c.is_private = false AND (
            c.deleted_at IS NULL
            OR EXISTS (SELECT 1 FROM property_comments r
                        WHERE r.parent_id = c.id AND r.deleted_at IS NULL)
         ))
         OR (c.is_private = true AND c.user_id = v_uid AND c.deleted_at IS NULL)
       )
     ORDER BY c.created_at ASC;
END; $fn$;

-- (4) Создание: видимость + валидация тела + правила тредов/приватности.
CREATE OR REPLACE FUNCTION public.add_property_comment(
    p_property_id uuid, p_body text, p_parent_id uuid DEFAULT NULL,
    p_is_private boolean DEFAULT false)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_body text := btrim(p_body);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._can_see_property(p_property_id) THEN
    RAISE EXCEPTION 'cannot comment: property not visible';
  END IF;
  IF v_body IS NULL OR length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'comment too long'; END IF;
  IF p_is_private AND p_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'private comment cannot be a reply';
  END IF;
  IF p_parent_id IS NOT NULL THEN
    PERFORM 1 FROM property_comments
      WHERE id = p_parent_id AND property_id = p_property_id
        AND deleted_at IS NULL AND is_private = false AND parent_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid parent comment'; END IF;
  END IF;
  INSERT INTO property_comments (property_id, user_id, parent_id, body, is_private)
    VALUES (p_property_id, v_uid, p_parent_id, v_body, p_is_private)
    RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;

-- (5) Правка: только свой неудалённый; ставит updated_at.
CREATE OR REPLACE FUNCTION public.edit_property_comment(p_comment_id uuid, p_body text)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_body text := btrim(p_body);
BEGIN
  IF v_body IS NULL OR length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'comment too long'; END IF;
  UPDATE property_comments SET body = v_body, updated_at = now()
   WHERE id = p_comment_id AND user_id = v_uid AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found or not yours'; END IF;
  RETURN true;
END; $fn$;

-- (6) Удаление: только свой; soft-delete (deleted_by='author' валидно по constraint).
CREATE OR REPLACE FUNCTION public.delete_property_comment(p_comment_id uuid)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  UPDATE property_comments SET deleted_at = now(), deleted_by = 'author'
   WHERE id = p_comment_id AND user_id = v_uid AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found or not yours'; END IF;
  RETURN true;
END; $fn$;

-- (7) Счётчик properties.comments_count (раньше не поддерживался) = публичные неудалённые.
CREATE OR REPLACE FUNCTION public.trg_property_comments_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE pid uuid := COALESCE(NEW.property_id, OLD.property_id);
BEGIN
  UPDATE properties SET comments_count =
    (SELECT count(*) FROM property_comments
      WHERE property_id = pid AND is_private = false AND deleted_at IS NULL)
   WHERE id = pid;
  RETURN COALESCE(NEW, OLD);
END; $fn$;
DROP TRIGGER IF EXISTS trg_property_comments_count ON public.property_comments;
CREATE TRIGGER trg_property_comments_count
  AFTER INSERT OR UPDATE OR DELETE ON public.property_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_property_comments_count();

-- (8) Бэкфилл счётчика по текущим данным.
UPDATE properties p SET comments_count = (
  SELECT count(*) FROM property_comments c
   WHERE c.property_id = p.id AND c.is_private = false AND c.deleted_at IS NULL);

-- (9) RLS-backstop: прямого доступа нет, всё через DEFINER-RPC.
ALTER TABLE public.property_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_comments FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_property_comments(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_property_comment(uuid,text,uuid,boolean)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_property_comment(uuid,text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_property_comment(uuid)                     TO authenticated;

-- ============================================================================
-- ОТКАТ:
--   DROP TRIGGER IF EXISTS trg_property_comments_count ON public.property_comments;
--   DROP FUNCTION IF EXISTS public.trg_property_comments_count();
--   DROP FUNCTION IF EXISTS public.delete_property_comment(uuid);
--   DROP FUNCTION IF EXISTS public.edit_property_comment(uuid,text);
--   DROP FUNCTION IF EXISTS public.add_property_comment(uuid,text,uuid,boolean);
--   DROP FUNCTION IF EXISTS public.get_property_comments(uuid);
--   DROP FUNCTION IF EXISTS public._can_see_property(uuid);
--   ALTER TABLE public.property_comments DROP CONSTRAINT IF EXISTS property_comments_private_toplevel_chk;
--   DROP INDEX IF EXISTS public.idx_property_comments_property_created;
--   ALTER TABLE public.property_comments DROP COLUMN IF EXISTS is_private, DROP COLUMN IF EXISTS updated_at;
--   (RLS/REVOKE оставить — безопасно; при нужде: ALTER TABLE ... DISABLE ROW LEVEL SECURITY.)
-- ============================================================================
```

- [ ] **Step 2: Запросить «да» создателя на применение** (DDL на прод). Без явного согласия — НЕ применять.

- [ ] **Step 3: Применить (после «да»)**

Run: `bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-24-f13-property-comments.sql`
Expected: без ошибок; в конце `git mv` файла в `docs/migrations/applied/` (по правилам migrate).

- [ ] **Step 4: Смоук — гейт видимости и изоляция приватных**

Тест-объект: property `e03795c8-…73e`, owner `8db1f713-…393c`, чужой `12d97408-…ab33`.
Run:
```bash
bash .claude/skills/migrate/tools/psql.sh "
SELECT set_config('request.jwt.claim.sub','8db1f713-0000-0000-0000-00000000393c',true);
-- добавить публичный + приватный от owner
SELECT 'add_pub='  || public.add_property_comment('e03795c8-0000-0000-0000-0000000073e','смоук публичный');
SELECT 'add_priv=' || public.add_property_comment('e03795c8-0000-0000-0000-0000000073e','смоук приватный', NULL, true);
-- owner видит оба
SELECT 'owner_sees=' || count(*) FROM public.get_property_comments('e03795c8-0000-0000-0000-0000000073e');
"
```
Expected: `add_pub=<uuid>`, `add_priv=<uuid>`, `owner_sees=2`.

- [ ] **Step 5: Смоук — чужой не видит приватный + правила ответов**

Run:
```bash
bash .claude/skills/migrate/tools/psql.sh "
SELECT set_config('request.jwt.claim.sub','12d97408-0000-0000-0000-00000000ab33',true);
-- чужой (если объект ему виден) видит только публичный, приватный owner-а — нет
SELECT 'other_sees=' || count(*) FROM public.get_property_comments('e03795c8-0000-0000-0000-0000000073e');
-- нельзя приватный ответ
SELECT public.add_property_comment('e03795c8-0000-0000-0000-0000000073e','x', NULL, false);
"
```
Expected: `other_sees=1` (только публичный), или `0` если объект чужому невидим. Зафиксировать факт.

- [ ] **Step 6: Смоук — счётчик + чистка тестовых строк**

Run:
```bash
bash .claude/skills/migrate/tools/psql.sh "
SELECT 'cc=' || comments_count FROM properties WHERE id='e03795c8-0000-0000-0000-0000000073e';
DELETE FROM property_comments WHERE property_id='e03795c8-0000-0000-0000-0000000073e' AND body LIKE 'смоук%';
SELECT 'cc_after=' || comments_count FROM properties WHERE id='e03795c8-0000-0000-0000-0000000073e';
"
```
Expected: `cc=1` (публичный считается, приватный — нет), `cc_after=0`.

- [ ] **Step 7: Коммит** (файл миграции; после применения он уже в `applied/`)

```bash
git add docs/migrations/
git commit -m "feat(comments): миграция property_comments — is_private, 4 RPC, RLS, счётчик

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Утиль `relativeTimeRu`

**Files:**
- Create: `src/app/mrsqm/util/relative-time.ts`
- Test: `src/app/mrsqm/util/relative-time.spec.ts`

**Interfaces:**
- Produces: `relativeTimeRu(value: string | number | Date, now?: Date): string`

- [ ] **Step 1: Написать падающий тест**

Создать `src/app/mrsqm/util/relative-time.spec.ts`:

```ts
import { relativeTimeRu } from './relative-time';

describe('relativeTimeRu', () => {
  const now = new Date('2026-06-24T12:00:00Z');
  const ago = (ms: number): Date => new Date(now.getTime() - ms);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('только что для <45с', () => {
    expect(relativeTimeRu(ago(10_000), now)).toBe('только что');
  });
  it('минуты', () => {
    expect(relativeTimeRu(ago(5 * MIN), now)).toBe('5 минут назад');
    expect(relativeTimeRu(ago(1 * MIN), now)).toBe('минуту назад');
  });
  it('часы', () => {
    expect(relativeTimeRu(ago(3 * HOUR), now)).toBe('3 часа назад');
  });
  it('вчера', () => {
    expect(relativeTimeRu(ago(1 * DAY), now)).toBe('вчера');
  });
  it('дни', () => {
    expect(relativeTimeRu(ago(3 * DAY), now)).toBe('3 дня назад');
  });
  it('недели', () => {
    expect(relativeTimeRu(ago(8 * DAY), now)).toBe('неделю назад');
  });
  it('абсолютная дата для старого (>4 недель)', () => {
    expect(relativeTimeRu(ago(40 * DAY), now)).toMatch(/\d{1,2}\s\S+/);
  });
  it('пустая строка для невалидного', () => {
    expect(relativeTimeRu('', now)).toBe('');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/util/relative-time.spec.ts`
Expected: FAIL — `relative-time` не найден.

- [ ] **Step 3: Реализовать утиль**

Создать `src/app/mrsqm/util/relative-time.ts`:

```ts
// Относительное время на русском (raw-RU, без TranslateService — паттерн MrSQM).
// Для давних дат (>4 недель) — абсолютная дата «16 июня[ 2025]».

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Русская форма множественного числа: [одна, две-четыре, пять+].
const plural = (n: number, forms: [string, string, string]): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
};

export const relativeTimeRu = (
  value: string | number | Date,
  now: Date = new Date(),
): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'только что';
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  const week = Math.floor(day / 7);

  if (sec < 45) return 'только что';
  if (min < 1) return 'минуту назад';
  if (min === 1) return 'минуту назад';
  if (min < 60) return `${min} ${plural(min, ['минуту', 'минуты', 'минут'])} назад`;
  if (hour === 1) return 'час назад';
  if (hour < 24) return `${hour} ${plural(hour, ['час', 'часа', 'часов'])} назад`;
  if (day === 1) return 'вчера';
  if (day < 7) return `${day} ${plural(day, ['день', 'дня', 'дней'])} назад`;
  if (week === 1) return 'неделю назад';
  if (day < 28) return `${week} ${plural(week, ['неделю', 'недели', 'недель'])} назад`;

  const d = date.getDate();
  const m = MONTHS_RU[date.getMonth()];
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear ? `${d} ${m}` : `${d} ${m} ${date.getFullYear()}`;
};
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/util/relative-time.spec.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/util/relative-time.ts
git add src/app/mrsqm/util/relative-time.ts src/app/mrsqm/util/relative-time.spec.ts
git commit -m "feat(comments): утиль relativeTimeRu (относительное время на русском)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Тип `PropertyComment` + сервис

**Files:**
- Modify: `src/app/mrsqm/types/database.ts` (добавить интерфейс в конец секции типов)
- Create: `src/app/mrsqm/services/property-comments.service.ts`
- Test: `src/app/mrsqm/services/property-comments.service.spec.ts`

**Interfaces:**
- Consumes: RPC-контракт из Task 1; `MrsqmSupabaseService.rpc<T>(fn, params)`.
- Produces:
  - `PropertyComment` (см. ниже).
  - `PropertyCommentsService` с методами:
    - `list(propertyId: string): Promise<PropertyComment[]>`
    - `add(propertyId: string, body: string, opts?: { parentId?: string; isPrivate?: boolean }): Promise<string>`
    - `edit(commentId: string, body: string): Promise<void>`
    - `remove(commentId: string): Promise<void>`

- [ ] **Step 1: Добавить тип `PropertyComment`**

В `src/app/mrsqm/types/database.ts` добавить (рядом с прочими DTO):

```ts
// Комментарий к объекту (плоская строка из get_property_comments; дерево строит клиент).
export interface PropertyComment {
  id: string;
  parent_id: string | null;
  is_private: boolean;
  body: string | null; // null = тумбстоун удалённого с ответами
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_mine: boolean;
}
```

- [ ] **Step 2: Написать падающий тест сервиса**

Создать `src/app/mrsqm/services/property-comments.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { PropertyCommentsService } from './property-comments.service';
import { MrsqmSupabaseService } from './supabase.service';

describe('PropertyCommentsService', () => {
  let service: PropertyCommentsService;
  let rpc: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo([]);
    TestBed.configureTestingModule({
      providers: [
        PropertyCommentsService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
      ],
    });
    service = TestBed.inject(PropertyCommentsService);
  });

  it('list зовёт get_property_comments с p_property_id', async () => {
    await service.list('P1');
    expect(rpc).toHaveBeenCalledWith('get_property_comments', { p_property_id: 'P1' });
  });

  it('add (публичный топ) шлёт parent=null, private=false', async () => {
    rpc.and.resolveTo('NEW');
    const id = await service.add('P1', '  привет  ');
    expect(rpc).toHaveBeenCalledWith('add_property_comment', {
      p_property_id: 'P1', p_body: '  привет  ', p_parent_id: null, p_is_private: false,
    });
    expect(id).toBe('NEW');
  });

  it('add (ответ) шлёт parent_id', async () => {
    await service.add('P1', 'ответ', { parentId: 'C1' });
    expect(rpc).toHaveBeenCalledWith('add_property_comment', {
      p_property_id: 'P1', p_body: 'ответ', p_parent_id: 'C1', p_is_private: false,
    });
  });

  it('add (приватный) шлёт is_private=true', async () => {
    await service.add('P1', 'заметка', { isPrivate: true });
    expect(rpc).toHaveBeenCalledWith('add_property_comment', {
      p_property_id: 'P1', p_body: 'заметка', p_parent_id: null, p_is_private: true,
    });
  });

  it('edit зовёт edit_property_comment', async () => {
    await service.edit('C1', 'правка');
    expect(rpc).toHaveBeenCalledWith('edit_property_comment', { p_comment_id: 'C1', p_body: 'правка' });
  });

  it('remove зовёт delete_property_comment', async () => {
    await service.remove('C1');
    expect(rpc).toHaveBeenCalledWith('delete_property_comment', { p_comment_id: 'C1' });
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/property-comments.service.spec.ts`
Expected: FAIL — сервис не найден.

- [ ] **Step 4: Реализовать сервис**

Создать `src/app/mrsqm/services/property-comments.service.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { PropertyComment } from '../types/database';

// Комментарии к объекту — через SECURITY DEFINER RPC (миграция 2026-06-24-f13-property-comments.sql).
// Видимость и owner-проверки на сервере; клиент их не дублирует.
@Injectable({ providedIn: 'root' })
export class PropertyCommentsService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  list(propertyId: string): Promise<PropertyComment[]> {
    return this._supabase.rpc<PropertyComment[]>('get_property_comments', {
      p_property_id: propertyId,
    });
  }

  add(
    propertyId: string,
    body: string,
    opts?: { parentId?: string; isPrivate?: boolean },
  ): Promise<string> {
    return this._supabase.rpc<string>('add_property_comment', {
      p_property_id: propertyId,
      p_body: body,
      p_parent_id: opts?.parentId ?? null,
      p_is_private: opts?.isPrivate ?? false,
    });
  }

  async edit(commentId: string, body: string): Promise<void> {
    await this._supabase.rpc<boolean>('edit_property_comment', {
      p_comment_id: commentId,
      p_body: body,
    });
  }

  async remove(commentId: string): Promise<void> {
    await this._supabase.rpc<boolean>('delete_property_comment', {
      p_comment_id: commentId,
    });
  }
}
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/services/property-comments.service.spec.ts`
Expected: PASS (6 тестов).

- [ ] **Step 6: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/types/database.ts
npm run checkFile src/app/mrsqm/services/property-comments.service.ts
git add src/app/mrsqm/types/database.ts src/app/mrsqm/services/property-comments.service.ts src/app/mrsqm/services/property-comments.service.spec.ts
git commit -m "feat(comments): сервис property-comments + тип PropertyComment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Компонент — чтение и отображение (дерево + приватные + счётчики)

**Files:**
- Create: `src/app/mrsqm/components/property-comments/property-comments.component.ts`
- Create: `src/app/mrsqm/components/property-comments/property-comments.component.html`
- Create: `src/app/mrsqm/components/property-comments/property-comments.component.scss`
- Test: `src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`

**Interfaces:**
- Consumes: `PropertyCommentsService`, `PropertyComment`, `relativeTimeRu`.
- Produces (для Task 5–8):
  - селектор `mrsqm-property-comments`, `input.required<string>()` `propertyId`, `output<number>()` `countChanged`.
  - сигналы: `rows`, `isLoading`, `scope`; computed `publicTopLevel`, `repliesByParent`, `privateNotes`, `allCount`, `privateCount`, `visibleItems`.
  - методы: `reload()`, `setScope(s)`, `relTime(d)`.

- [ ] **Step 1: Написать падающий тест (дерево + счётчики)**

Создать `src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PropertyCommentsComponent } from './property-comments.component';
import { PropertyCommentsService } from '../../services/property-comments.service';
import { PropertyComment } from '../../types/database';

const row = (p: Partial<PropertyComment>): PropertyComment => ({
  id: 'x', parent_id: null, is_private: false, body: 'b',
  created_at: '2026-06-24T10:00:00Z', updated_at: null, deleted_at: null,
  user_id: 'u', author_name: 'A', author_avatar: null, is_mine: false, ...p,
});

describe('PropertyCommentsComponent', () => {
  let fixture: ComponentFixture<PropertyCommentsComponent>;
  let comp: PropertyCommentsComponent;
  let svc: jasmine.SpyObj<PropertyCommentsService>;

  beforeEach(async () => {
    svc = jasmine.createSpyObj<PropertyCommentsService>('PropertyCommentsService',
      ['list', 'add', 'edit', 'remove']);
    svc.list.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [PropertyCommentsComponent],
      providers: [{ provide: PropertyCommentsService, useValue: svc }],
    }).compileComponents();
    fixture = TestBed.createComponent(PropertyCommentsComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('propertyId', 'P1');
  });

  it('грузит комментарии при инициализации', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(svc.list).toHaveBeenCalledWith('P1');
  });

  it('строит дерево 1 уровня: топ + ответы по parent_id', async () => {
    svc.list.and.resolveTo([
      row({ id: 'top', parent_id: null }),
      row({ id: 'r1', parent_id: 'top' }),
      row({ id: 'r2', parent_id: 'top' }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(comp.publicTopLevel().map((c) => c.id)).toEqual(['top']);
    expect(comp.repliesByParent().get('top')?.length).toBe(2);
  });

  it('считает allCount (публичные неудалённые) и privateCount (свои)', async () => {
    svc.list.and.resolveTo([
      row({ id: 'a', is_private: false }),
      row({ id: 'b', is_private: false, parent_id: 'a' }),
      row({ id: 'p', is_private: true, is_mine: true }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(comp.allCount()).toBe(2);
    expect(comp.privateCount()).toBe(1);
  });

  it('эмитит countChanged публичным числом', async () => {
    const emitted: number[] = [];
    svc.list.and.resolveTo([row({ id: 'a' }), row({ id: 'b' })]);
    fixture.detectChanges();
    comp.countChanged.subscribe((n) => emitted.push(n));
    await comp.reload();
    expect(emitted.at(-1)).toBe(2);
  });

  it('тумбстоун: удалённый топ с body=null показывается, приватный режим скрыт по умолчанию', async () => {
    svc.list.and.resolveTo([
      row({ id: 't', body: null, deleted_at: '2026-06-24T11:00:00Z' }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(comp.publicTopLevel().length).toBe(1);
    expect(comp.scope()).toBe('all');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: FAIL — компонент не найден.

- [ ] **Step 3: Реализовать компонент (TS)**

Создать `src/app/mrsqm/components/property-comments/property-comments.component.ts`:

```ts
import {
  ChangeDetectionStrategy, Component, computed, effect, inject,
  input, output, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PropertyCommentsService } from '../../services/property-comments.service';
import { PropertyComment } from '../../types/database';
import { relativeTimeRu } from '../../util/relative-time';

@Component({
  selector: 'mrsqm-property-comments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './property-comments.component.html',
  styleUrl: './property-comments.component.scss',
})
export class PropertyCommentsComponent {
  private readonly _service = inject(PropertyCommentsService);

  readonly propertyId = input.required<string>();
  readonly countChanged = output<number>();

  readonly rows = signal<PropertyComment[]>([]);
  readonly isLoading = signal(true);
  readonly scope = signal<'all' | 'private'>('all');

  // Публичные топ-комментарии (включая тумбстоуны удалённых-с-ответами).
  readonly publicTopLevel = computed(() =>
    this.rows().filter((c) => !c.is_private && c.parent_id === null),
  );
  // parent_id -> ответы (публичные, неудалённые).
  readonly repliesByParent = computed(() => {
    const map = new Map<string, PropertyComment[]>();
    for (const c of this.rows()) {
      if (!c.is_private && c.parent_id && !c.deleted_at) {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    return map;
  });
  readonly privateNotes = computed(() => this.rows().filter((c) => c.is_private));

  // Бейдж «All» — публичные неудалённые (тумбстоуны не в счёт).
  readonly allCount = computed(
    () => this.rows().filter((c) => !c.is_private && !c.deleted_at).length,
  );
  readonly privateCount = computed(() => this.privateNotes().length);

  constructor() {
    effect(() => {
      const id = this.propertyId();
      if (id) void this.reload(id);
    });
  }

  async reload(id: string = this.propertyId()): Promise<void> {
    this.isLoading.set(true);
    try {
      this.rows.set(await this._service.list(id));
      this.countChanged.emit(this.allCount());
    } finally {
      this.isLoading.set(false);
    }
  }

  setScope(s: 'all' | 'private'): void {
    this.scope.set(s);
  }

  relTime(value: string): string {
    return relativeTimeRu(value);
  }

  repliesOf(id: string): PropertyComment[] {
    return this.repliesByParent().get(id) ?? [];
  }
}
```

- [ ] **Step 4: Реализовать SCSS (перенос из карточки + строки треда)**

Создать `src/app/mrsqm/components/property-comments/property-comments.component.scss` (классы `.comments-scope`/`.scope-seg`/`.seg-count`/`.comment-compose`/`.comment-input`/`.comments-empty` перенесены 1:1 из карточки; добавлены стили строки комментария):

```scss
:host {
  display: flex;
  flex-direction: column;
  padding: var(--s);
  gap: var(--s);
}

// Переключатель All / Private — сегменты как у деал-тоггла
.comments-scope {
  display: inline-flex;
  align-self: flex-start;
  border: 1px solid var(--extra-border-color);
  border-radius: 15px;
  overflow: hidden;
}
.scope-seg {
  display: inline-flex;
  align-items: center;
  gap: var(--s-quarter);
  height: 28px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  & + & { border-left: 1px solid var(--extra-border-color); }
  &.is-active {
    background: var(--c-primary);
    color: var(--palette-primary-contrast-500, #fff);
  }
  .seg-count { opacity: 0.8; }
}

.comment-compose { display: flex; flex-direction: column; gap: var(--s-half); }
.comment-input {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--extra-border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-color);
  font-family: inherit;
  font-size: 0.8125rem;
  padding: var(--s-half);
  box-sizing: border-box;
  &::placeholder { color: var(--text-color-muted); }
}
.comment-send { align-self: flex-end; }

.comments-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-half);
  color: var(--text-color-muted);
  padding: var(--s2) 0;
  mat-icon { font-size: 32px; width: 32px; height: 32px; }
}

// ── Строка комментария ──────────────────────────────────────────────
.comment-list { display: flex; flex-direction: column; gap: var(--s); }
.comment {
  display: flex;
  gap: var(--s-half);
  &.is-reply { margin-left: var(--s2); }
}
.comment-avatar {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--c-primary);
  color: var(--palette-primary-contrast-500, #fff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  .is-reply & { width: 26px; height: 26px; }
}
.comment-body { flex: 1; min-width: 0; }
.comment-meta {
  display: flex;
  align-items: baseline;
  gap: var(--s-half);
  flex-wrap: wrap;
}
.comment-author { font-weight: 600; color: var(--text-color); font-size: 0.8125rem; }
.comment-time { color: var(--text-color-muted); font-size: 0.6875rem; }
.comment-edited { color: var(--text-color-muted); font-size: 0.6875rem; font-style: italic; }
.comment-text { color: var(--text-color); font-size: 0.8125rem; white-space: pre-wrap; word-break: break-word; }
.comment-text.is-deleted { color: var(--text-color-muted); font-style: italic; }
.comment-actions { display: flex; gap: var(--s); margin-top: var(--s-quarter); }
.comment-action {
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  &:hover { color: var(--text-color); }
}
.reply-count { color: var(--text-color-muted); font-size: 0.6875rem; margin-top: var(--s-quarter); }
```

- [ ] **Step 5: Реализовать HTML (чтение)**

Создать `src/app/mrsqm/components/property-comments/property-comments.component.html`. Разметка по spec §5; классы из Step 4. Базовый каркас (compose/reply/edit добавят Task 5–7 — оставить место):

```html
<!-- Переключатель All / Private -->
<div class="comments-scope">
  <button type="button" class="scope-seg" [class.is-active]="scope() === 'all'" (click)="setScope('all')">
    All <span class="seg-count">{{ allCount() }}</span>
  </button>
  <button type="button" class="scope-seg" [class.is-active]="scope() === 'private'" (click)="setScope('private')">
    Private <span class="seg-count">{{ privateCount() }}</span>
  </button>
</div>

@if (isLoading()) {
  <div class="comments-empty"><mat-spinner diameter="28" /></div>
} @else if (scope() === 'all') {
  @if (publicTopLevel().length === 0) {
    <div class="comments-empty"><mat-icon>chat_bubble_outline</mat-icon><p>Комментариев пока нет</p></div>
  } @else {
    <div class="comment-list">
      @for (c of publicTopLevel(); track c.id) {
        <div class="comment">
          <span class="comment-avatar">
            @if (c.author_avatar) { <img [src]="c.author_avatar" alt="" /> }
            @else { {{ (c.author_name || '?').charAt(0) }} }
          </span>
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-author">{{ c.author_name || 'Аноним' }}</span>
              <span class="comment-time">{{ relTime(c.created_at) }}</span>
              @if (c.updated_at) { <span class="comment-edited">(изменено)</span> }
            </div>
            @if (c.deleted_at) {
              <div class="comment-text is-deleted">Комментарий удалён</div>
            } @else {
              <div class="comment-text">{{ c.body }}</div>
            }
            @if (repliesOf(c.id).length) {
              <div class="reply-count">Ответы: {{ repliesOf(c.id).length }}</div>
            }
            <!-- ответы -->
            @for (r of repliesOf(c.id); track r.id) {
              <div class="comment is-reply">
                <span class="comment-avatar">
                  @if (r.author_avatar) { <img [src]="r.author_avatar" alt="" /> }
                  @else { {{ (r.author_name || '?').charAt(0) }} }
                </span>
                <div class="comment-body">
                  <div class="comment-meta">
                    <span class="comment-author">{{ r.author_name || 'Аноним' }}</span>
                    <span class="comment-time">{{ relTime(r.created_at) }}</span>
                    @if (r.updated_at) { <span class="comment-edited">(изменено)</span> }
                  </div>
                  <div class="comment-text">{{ r.body }}</div>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  }
} @else {
  <!-- Private -->
  @if (privateNotes().length === 0) {
    <div class="comments-empty"><mat-icon>lock_outline</mat-icon><p>Личных заметок пока нет</p></div>
  } @else {
    <div class="comment-list">
      @for (c of privateNotes(); track c.id) {
        <div class="comment">
          <span class="comment-avatar">{{ (c.author_name || '?').charAt(0) }}</span>
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-author">{{ c.author_name || 'Вы' }}</span>
              <span class="comment-time">{{ relTime(c.created_at) }}</span>
              @if (c.updated_at) { <span class="comment-edited">(изменено)</span> }
            </div>
            <div class="comment-text">{{ c.body }}</div>
          </div>
        </div>
      }
    </div>
  }
}
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 7: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/components/property-comments/property-comments.component.ts
npm run checkFile src/app/mrsqm/components/property-comments/property-comments.component.scss
git add src/app/mrsqm/components/property-comments/
git commit -m "feat(comments): компонент property-comments — чтение, дерево, счётчики

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Компонент — создание комментария (compose)

**Files:**
- Modify: `src/app/mrsqm/components/property-comments/property-comments.component.ts`
- Modify: `src/app/mrsqm/components/property-comments/property-comments.component.html`
- Modify: `src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`

**Interfaces:**
- Consumes: `PropertyCommentsService.add`, сигналы из Task 4.
- Produces: `composeText` signal, `busy` signal, `submitNew()`.

- [ ] **Step 1: Добавить падающий тест**

В `property-comments.component.spec.ts` добавить:

```ts
it('submitNew (All) зовёт add публичным и перезагружает', async () => {
  svc.add.and.resolveTo('NEW');
  svc.list.and.resolveTo([]);
  fixture.detectChanges();
  await fixture.whenStable();
  comp.composeText.set('  новый  ');
  await comp.submitNew();
  expect(svc.add).toHaveBeenCalledWith('P1', 'новый', { isPrivate: false });
  expect(comp.composeText()).toBe('');
  expect(svc.list).toHaveBeenCalledTimes(2); // init + после add
});

it('submitNew (Private) шлёт isPrivate=true', async () => {
  svc.add.and.resolveTo('NEW');
  fixture.detectChanges();
  await fixture.whenStable();
  comp.setScope('private');
  comp.composeText.set('заметка');
  await comp.submitNew();
  expect(svc.add).toHaveBeenCalledWith('P1', 'заметка', { isPrivate: true });
});

it('submitNew игнорит пустой текст', async () => {
  fixture.detectChanges();
  await fixture.whenStable();
  comp.composeText.set('   ');
  await comp.submitNew();
  expect(svc.add).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: FAIL — `composeText`/`submitNew` нет.

- [ ] **Step 3: Реализовать compose в TS**

В `property-comments.component.ts` добавить в класс:

```ts
  readonly composeText = signal('');
  readonly busy = signal(false);

  get composePlaceholder(): string {
    return this.scope() === 'all'
      ? 'Ваш комментарий видят все'
      : 'Ваш комментарий не видит никто';
  }

  async submitNew(): Promise<void> {
    const body = this.composeText().trim();
    if (!body || this.busy()) return;
    this.busy.set(true);
    try {
      await this._service.add(this.propertyId(), body, {
        isPrivate: this.scope() === 'private',
      });
      this.composeText.set('');
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }
```

- [ ] **Step 4: Добавить compose в HTML**

В `property-comments.component.html` сразу под блоком `.comments-scope` вставить:

```html
<div class="comment-compose">
  <textarea
    class="comment-input"
    rows="2"
    [placeholder]="composePlaceholder"
    [value]="composeText()"
    (input)="composeText.set($any($event.target).value)"
    (keydown.enter)="$event.preventDefault(); submitNew()"
  ></textarea>
  <button
    mat-flat-button
    color="primary"
    class="comment-send"
    [disabled]="!composeText().trim() || busy()"
    (click)="submitNew()"
  >
    Отправить
  </button>
</div>
```

- [ ] **Step 5: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: PASS (8 тестов).

- [ ] **Step 6: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/components/property-comments/property-comments.component.ts
git add src/app/mrsqm/components/property-comments/
git commit -m "feat(comments): создание комментария (All/Private compose)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Компонент — ответы (inline reply)

**Files:**
- Modify: `property-comments.component.ts`, `.html`, `.spec.ts`

**Interfaces:**
- Consumes: `PropertyCommentsService.add` с `parentId`.
- Produces: `replyingTo` signal, `replyText` signal, `startReply()`, `cancelReply()`, `submitReply()`.

- [ ] **Step 1: Добавить падающий тест**

```ts
it('submitReply зовёт add с parentId и закрывает форму', async () => {
  svc.add.and.resolveTo('R');
  svc.list.and.resolveTo([]);
  fixture.detectChanges();
  await fixture.whenStable();
  comp.startReply('TOP');
  expect(comp.replyingTo()).toBe('TOP');
  comp.replyText.set('мой ответ');
  await comp.submitReply('TOP');
  expect(svc.add).toHaveBeenCalledWith('P1', 'мой ответ', { parentId: 'TOP' });
  expect(comp.replyingTo()).toBeNull();
});

it('cancelReply сбрасывает форму', () => {
  fixture.detectChanges();
  comp.startReply('TOP');
  comp.replyText.set('x');
  comp.cancelReply();
  expect(comp.replyingTo()).toBeNull();
  expect(comp.replyText()).toBe('');
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать reply в TS**

Добавить в класс:

```ts
  readonly replyingTo = signal<string | null>(null);
  readonly replyText = signal('');

  startReply(parentId: string): void {
    this.replyingTo.set(parentId);
    this.replyText.set('');
  }
  cancelReply(): void {
    this.replyingTo.set(null);
    this.replyText.set('');
  }
  async submitReply(parentId: string): Promise<void> {
    const body = this.replyText().trim();
    if (!body || this.busy()) return;
    this.busy.set(true);
    try {
      await this._service.add(this.propertyId(), body, { parentId });
      this.cancelReply();
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }
```

- [ ] **Step 4: Добавить reply-UI в HTML**

В блоке топ-комментария (All), после `.reply-count` и до ответов, добавить кнопку «Ответить» (на чужой неудалённый) и инлайн-форму:

```html
@if (!c.deleted_at) {
  <div class="comment-actions">
    @if (!c.is_mine) {
      <button type="button" class="comment-action" (click)="startReply(c.id)">Ответить</button>
    }
  </div>
}
@if (replyingTo() === c.id) {
  <div class="comment-compose">
    <textarea
      class="comment-input"
      rows="2"
      placeholder="Ваш ответ"
      [value]="replyText()"
      (input)="replyText.set($any($event.target).value)"
    ></textarea>
    <div class="comment-actions">
      <button mat-flat-button color="primary" [disabled]="!replyText().trim() || busy()" (click)="submitReply(c.id)">Ответить</button>
      <button mat-button (click)="cancelReply()">Отмена</button>
    </div>
  </div>
}
```

- [ ] **Step 5: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: PASS (10 тестов).

- [ ] **Step 6: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/components/property-comments/property-comments.component.ts
git add src/app/mrsqm/components/property-comments/
git commit -m "feat(comments): ответы в тредах (inline reply)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Компонент — правка и удаление своих

**Files:**
- Modify: `property-comments.component.ts`, `.html`, `.spec.ts`

**Interfaces:**
- Consumes: `PropertyCommentsService.edit`, `PropertyCommentsService.remove`.
- Produces: `editingId` signal, `editText` signal, `startEdit()`, `cancelEdit()`, `submitEdit()`, `remove()`.

- [ ] **Step 1: Добавить падающий тест**

```ts
it('submitEdit зовёт edit и перезагружает', async () => {
  svc.edit.and.resolveTo();
  svc.list.and.resolveTo([]);
  fixture.detectChanges();
  await fixture.whenStable();
  comp.startEdit('C', 'старый');
  expect(comp.editingId()).toBe('C');
  expect(comp.editText()).toBe('старый');
  comp.editText.set('новый');
  await comp.submitEdit('C');
  expect(svc.edit).toHaveBeenCalledWith('C', 'новый');
  expect(comp.editingId()).toBeNull();
});

it('remove зовёт remove и перезагружает', async () => {
  svc.remove.and.resolveTo();
  svc.list.and.resolveTo([]);
  fixture.detectChanges();
  await fixture.whenStable();
  await comp.remove('C');
  expect(svc.remove).toHaveBeenCalledWith('C');
  expect(svc.list).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать edit/delete в TS**

Добавить в класс:

```ts
  readonly editingId = signal<string | null>(null);
  readonly editText = signal('');

  startEdit(id: string, body: string | null): void {
    this.editingId.set(id);
    this.editText.set(body ?? '');
  }
  cancelEdit(): void {
    this.editingId.set(null);
    this.editText.set('');
  }
  async submitEdit(id: string): Promise<void> {
    const body = this.editText().trim();
    if (!body || this.busy()) return;
    this.busy.set(true);
    try {
      await this._service.edit(id, body);
      this.cancelEdit();
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }
  async remove(id: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this._service.remove(id);
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }
```

- [ ] **Step 4: Добавить edit/delete в HTML**

В `.comment-actions` топ-комментария и в ответах — для своих (`is_mine`) добавить кнопки и инлайн-редактор. В блоке actions:

```html
@if (c.is_mine && !c.deleted_at) {
  <button type="button" class="comment-action" (click)="startEdit(c.id, c.body)">Изменить</button>
  <button type="button" class="comment-action" (click)="remove(c.id)">Удалить</button>
}
```

И заменить вывод `.comment-text` на условный редактор:

```html
@if (editingId() === c.id) {
  <div class="comment-compose">
    <textarea class="comment-input" rows="2"
      [value]="editText()" (input)="editText.set($any($event.target).value)"></textarea>
    <div class="comment-actions">
      <button mat-flat-button color="primary" [disabled]="!editText().trim() || busy()" (click)="submitEdit(c.id)">Сохранить</button>
      <button mat-button (click)="cancelEdit()">Отмена</button>
    </div>
  </div>
} @else if (c.deleted_at) {
  <div class="comment-text is-deleted">Комментарий удалён</div>
} @else {
  <div class="comment-text">{{ c.body }}</div>
}
```

(Аналогично — для ответов и для приватных заметок: те же `Изменить`/`Удалить` при `is_mine`.)

- [ ] **Step 5: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/components/property-comments/property-comments.component.spec.ts`
Expected: PASS (12 тестов).

- [ ] **Step 6: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/components/property-comments/property-comments.component.ts
npm run checkFile src/app/mrsqm/components/property-comments/property-comments.component.scss
git add src/app/mrsqm/components/property-comments/
git commit -m "feat(comments): правка и удаление своих комментариев

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Интеграция в карточку `property-detail`

**Files:**
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html` (строки коммент-таба ~52–105)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts`
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.scss` (строки 102–185 — перенесённые стили)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`

**Interfaces:**
- Consumes: `PropertyCommentsComponent` (`[propertyId]`, `(countChanged)`).

- [ ] **Step 1: Подключить импорт в TS**

В `property-detail.component.ts` добавить импорт и в массив `imports`:

```ts
import { PropertyCommentsComponent } from '../property-comments/property-comments.component';
```
В `@Component.imports` добавить `PropertyCommentsComponent`.

- [ ] **Step 2: Убрать мёртвый стейт коммент-таба в TS**

Удалить `commentsScope` signal (строка ~97) и метод `setCommentsScope` (строки ~226–228) — они переехали в компонент. `commentsCount` оставить (используется для бейджа таба). Добавить обработчик обновления счётчика:

```ts
  onCommentsCountChanged(n: number): void {
    const d = this.detail();
    if (d) this.detail.set({ ...d, comments_count: n });
  }
```

- [ ] **Step 3: Заменить инлайн-разметку коммент-таба в HTML**

Заменить весь блок `@else if (activeTab() === 'comments') { … }` (строки ~52–105) на:

```html
} @else if (activeTab() === 'comments') {
  <div class="detail-scroll">
    <mrsqm-property-comments
      [propertyId]="property().id"
      (countChanged)="onCommentsCountChanged($event)"
    />
  </div>
```

- [ ] **Step 4: Удалить перенесённые стили из карточки**

В `property-detail.component.scss` удалить блоки `.comments-tab`, `.comments-scope`, `.scope-seg`, `.comment-compose`, `.comment-input`, `.comment-send`, `.comments-empty` (строки ~102–185). Блоки `.detail-tabs`/`.detail-tab`/`.tab-count`/`.detail-scroll` ОСТАВИТЬ (таб-бар и скролл — общие).

- [ ] **Step 5: Поправить тесты карточки**

В `property-detail.component.spec.ts`: если есть проверки на инлайн `setCommentsScope`/`.scope-seg` внутри карточки — заменить на проверку наличия `mrsqm-property-comments` при `activeTab='comments'`. Замокать `PropertyCommentsService` в TestBed (provide spy с `list: resolveTo([])`), т.к. дочерний компонент его инжектит. Добавить:

```ts
it('таб Комментарии рендерит mrsqm-property-comments', () => {
  // ... arrange: detail загружен, activeTab='comments'
  component.setTab('comments');
  fixture.detectChanges();
  const el = fixture.nativeElement.querySelector('mrsqm-property-comments');
  expect(el).toBeTruthy();
});
```

- [ ] **Step 6: Запустить тесты карточки**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: PASS (вкл. новый тест; прежние зелёные).

- [ ] **Step 7: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts
npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.scss
git add src/app/mrsqm/components/property-detail/
git commit -m "feat(comments): подключить property-comments в карточку, убрать заглушку

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Финал (после всех задач)

- [ ] **Полный прогон тестов:** `npm test` — зелёный (новые сюиты + не сломаны прежние).
- [ ] **Деплой-гейт:** `npm run lint && npm run buildFrontend:prodWeb` — оба зелёные.
- [ ] **opus-ревью** (requesting-code-review) на корректность синка/RLS/перф (карточка — hot-path, но коммент-таб рендерится только при открытии).
- [ ] **TODO:** F-13a..e → ✅ (F-13a уже был закрыт; пометить как сделанный отдельно).
- [ ] **Деплой** по `/deploy` (после визуальной проверки создателем).

## Self-review (выполнено при написании плана)

- **Покрытие spec:** §2 схема → Task 1; §3 RPC+helper → Task 1; §4 сервис/вынос → Task 3+8; §5 UI → Task 4–7; §6 тесты → во всех; §7 миграция/гейты → Task 1 + Финал. F-13a — вне scope (закрыт ранее).
- **Плейсхолдеры:** нет TBD; код приведён во всех шагах кода (HTML компонента — полные блоки; повторяющиеся для ответов/приватных помечены явно).
- **Согласованность типов:** `PropertyComment` (Task 3) ↔ RPC-колонки (Task 1) ↔ computed/HTML (Task 4–7) — поля совпадают (`is_mine`,`deleted_at`,`updated_at`,`author_*`). Сервис-сигнатуры (Task 3) совпадают с вызовами в компоненте (Task 5–7).
