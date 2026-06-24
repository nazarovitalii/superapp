# Дизайн: F-13 — комментарии к объектам

> **Дата:** 2026-06-24 · **Статус:** утверждён к планированию (brainstorming-фаза пройдена)
> **Мандат:** продакшн для риелторов Дубая, **костыли запрещены**.
> **Источники:** `docs/TODO.md` секция «Карточка объекта + комментарии» (F-13a…F-13e);
> карточка `src/app/mrsqm/components/property-detail/`; схема `docs/database.md` (`property_comments`).

## 0. Контекст и цель

В карточке объекта (`property-detail`) уже есть **скелет** коммент-таба из WP-G (слой 1): 3 таба
Details / Comments / Metrics, тогл All/Private (`commentsScope`), плейсхолдеры compose, empty-state,
`commentsCount()`. Данных нет — кнопка «Отправить» `disabled`, список заглушён. Задача F-13 —
**оживить комментарии**: серверный слой (RPC+RLS), модель приватности и тредов, полноценный UI треда.

Риелторы обсуждают объект коллег и ведут личные заметки. Нужны:
- **публичные** комментарии (видны всем, кому виден сам объект) с **ответами** (1-уровневые треды, как FB);
- **приватные** заметки (видит только автор);
- редактирование/удаление своих, ответы на чужие;
- только текст, без медиа.

## 1. Закрытые решения (brainstorming 2026-06-24)

| #                  | Решение                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Глубина тредов     | **1 уровень** (FB): топ-комментарий + плоские ответы под ним. Ответ на ответ приклеивается к тому же топ-комментарию.                   |
| Private + треды    | **Private = плоские личные заметки**: только верхний уровень, без ответов. Треды существуют только в All.                               |
| Видимость «All»    | «All»-комментарий виден юзеру ⟺ **юзеру виден сам объект** (тот же предикат охвата, что в `get_feed`/`get_property`).                   |
| Видимость «Private»| Видит **только автор**.                                                                                                                 |
| Медиа              | **Только текст.** Никаких файлов/Storage в комментариях (дренер чистки Storage их не касается — подтверждено realtime).                 |
| Каскад-удаление    | При удалении объекта комментарии стираются **автоматически** — FK `ON DELETE CASCADE` уже в проде, отдельный код не нужен.               |
| Доступ (RLS)       | **RPC + RLS-backstop**: 4 SECURITY DEFINER RPC (get/add/edit/delete) перепроверяют видимость; прямой доступ к таблице закрыт REVOKE.    |
| Модерация чужих    | **Вне v1.** Автор правит/удаляет свои; админ-модерация — через Control-панель позже (`deleted_by_admin` зарезервирован).                |
| F-13a (цвета)      | **Уже фактически закрыт** (`.type-chip` нейтральный, item 13/FC-1). В этот спек не входит; сверить на проде отдельно.                    |

### Уже готово (НЕ переделывать)

- Таблица `property_comments` существует в проде: `id, property_id, user_id, parent_id, body,
  deleted_at, deleted_by, deleted_by_admin, created_at` (+ constraint `property_comments_deleted_by_check`).
- FK `property_comments.property_id → properties ON DELETE CASCADE` (один из 11 каскадов LM-5).
- Триггер `trg_sync_context_comments` синкает **`user_context.comments_count`** = сколько комментариев
  юзер НАПИСАЛ (`WHERE user_id = uid AND deleted_at IS NULL`). Это **другой** счётчик (per-user активность),
  НЕ per-property — его не трогаем.
- UI-скелет коммент-таба в `property-detail` (тогл, compose-плейсхолдеры, empty-state).
- Колонка `properties.comments_count` существует и читается в `get_feed`/`get_property`, **но сейчас
  никем не поддерживается** (живой прод: все 22 объекта = 0). Нужно завести ей триггер (см. §2).
- Constraint `property_comments_deleted_by_check` = `deleted_by IN ('author','moderator')` (проверено живьём).
- `author_name` ← `users.full_name`; `author_avatar` ← `user_settings.photo_url` (проверено живьём; часто NULL → инициалы).

## 2. Модель данных — ALTER существующей `property_comments`

Миграция добавляет **2 колонки + 1 CHECK + 1 индекс** (DDL на прод — только с явного «да»):

```sql
ALTER TABLE public.property_comments
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- приватные комментарии только верхнего уровня (без ответов)
ALTER TABLE public.property_comments
  ADD CONSTRAINT property_comments_private_toplevel_chk
  CHECK (NOT is_private OR parent_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_property_comments_property_created
  ON public.property_comments (property_id, created_at);
```

- `is_private` — приватная заметка (видит только автор). По умолчанию `false` (публичный).
- `updated_at` — ставится при правке; не-NULL → UI показывает «(изменено)».
- CHECK — приватные строки не могут иметь `parent_id` (плоские). Симметрично: ответ (`parent_id` есть)
  не может быть приватным. Кросс-строчные ограничения (родитель публичный/верхнего уровня/неудалённый)
  проверяет RPC `add_property_comment` (CHECK так не выразить).

**Счётчик `properties.comments_count`.** Сейчас не поддерживается (всегда 0). Заводим **новый триггер**
`trg_property_comments_count` (AFTER INSERT/UPDATE/DELETE ON property_comments), пересчитывающий
`properties.comments_count` = COUNT **публичных неудалённых** (`is_private=false AND deleted_at IS NULL`)
для затронутого `property_id` — это число для иконки комментариев в ленте (F-14) и бейджа таба «All».
Существующий `trg_sync_context_comments` (user_context, authored-count) **не трогаем** — это другой счётчик.

```sql
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
CREATE TRIGGER trg_property_comments_count
  AFTER INSERT OR UPDATE OR DELETE ON public.property_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_property_comments_count();
```

## 3. Сервер — 4 RPC (SECURITY DEFINER, гейт `auth.uid()` + видимость объекта)

Все читают `auth.uid()` из JWT (клиент `p_user_id` не передаёт). Видимость объекта проверяется тем же
предикатом, что в `get_feed`/`get_property` — `public ∨ owner = ANY(сеть юзера) ∨ owner = auth.uid()` —
вынесенным во **внутреннюю helper-функцию `_can_see_property(p_property_id)`** (comments-scoped), написанную
так, чтобы потом без переписывания вызовов замениться на общий `can_user_see_property()` (SC-10).

### 3.1 `get_property_comments(p_property_id uuid)`

Возвращает **плоский набор строк** (клиент строит 1-уровневое дерево). Если `_can_see_property` ложно — `RAISE`/пусто.

Колонки строки: `id, parent_id, is_private, body, created_at, updated_at, user_id, author_name, author_avatar`.
- Публичные: `is_private=false AND deleted_at IS NULL` (вся видимая ветка).
- Приватные: `is_private=true AND user_id=auth.uid() AND deleted_at IS NULL` (только свои).
- Удалённый топ-комментарий, **у которого есть ответы**, отдавать с тумбстоун-телом (`deleted_at` не NULL,
  `body=NULL`), чтобы ответы остались читаемы; удалённый без ответов — не отдавать.
- `author_name` ← `users.full_name`; `author_avatar` ← `user_settings.photo_url` (часто NULL → фолбэк инициалы на клиенте).
- `is_mine` клиент вычисляет сам (`user_id === currentUserId`).

### 3.2 `add_property_comment(p_property_id uuid, p_body text, p_parent_id uuid DEFAULT NULL, p_is_private boolean DEFAULT false)`

Вставка. Гейты:
- `_can_see_property(p_property_id)`;
- `p_body` после `trim` непустой, длина ≤ 4000;
- если `p_parent_id` задан: родитель существует, той же `property_id`, `deleted_at IS NULL`,
  `is_private=false`, **верхнего уровня** (`parent_id IS NULL`); и `p_is_private` обязан быть `false`;
- если `p_is_private=true`: `p_parent_id` обязан быть NULL (дублирует CHECK, но даёт понятную ошибку);
- `user_id = auth.uid()`.
- Возвращает новую строку (для оптимистичной вставки в UI).

### 3.3 `edit_property_comment(p_comment_id uuid, p_body text)`

Только свой (`user_id = auth.uid()`), `deleted_at IS NULL`. `body = trim(p_body)` (непустой, ≤4000),
`updated_at = now()`. Возвращает обновлённую строку.

### 3.4 `delete_property_comment(p_comment_id uuid)`

Только свой. **Soft-delete:** `deleted_at = now()`, `deleted_by = 'author'` (валидно по constraint
`deleted_by IN ('author','moderator')`). Админ-модерация проставит `'moderator'`/`deleted_by_admin`
из Control-панели — вне v1. Возвращает `true`.

### 3.5 RLS-backstop

```sql
ALTER TABLE public.property_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_comments FROM anon, authenticated;
-- никаких permissive-политик: доступ только через DEFINER-RPC
GRANT EXECUTE ON FUNCTION public.get_property_comments(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_property_comment(uuid,text,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_property_comment(uuid,text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_property_comment(uuid)          TO authenticated;
```
Паттерн как у `storage_cleanup_queue` (RLS on + REVOKE, доступ через DEFINER). `get_feed`/`get_property`
читают только колонку `comments_count`, к таблице напрямую не ходят — таблица полностью RPC-гейтнута.

## 4. Фронт — отдельный компонент

`property-detail` уже 685 TS / 707 HTML — инлайнить тред+ответы+правку нельзя. Выносим:

- **`services/property-comments.service.ts`** — тонкая обёртка 4 RPC поверх `supabase.service`.
  Методы: `list(propertyId)`, `add(propertyId, body, {parentId?, isPrivate?})`, `edit(id, body)`,
  `remove(id)`. Типы — в `types/database.ts` (`PropertyComment`).
- **`components/property-comments/property-comments.component.{ts,html,scss}`** — standalone, весь таб.
  Входы: `[propertyId]`, `[currentUserId]`. Выход: `(countChanged)` (публичный счётчик → бейдж таба в родителе).
  Внутреннее состояние сигналами: `comments`, `scope ('all'|'private')`, `replyingTo`, `editingId`, `isLoading`.
- **`property-detail`**: инлайн-разметка коммент-таба (строки ~52–105 HTML) заменяется на
  `<mrsqm-property-comments [propertyId]="property().id" [currentUserId]="currentUserId()" (countChanged)="…" />`.
  Мёртвая разметка/`commentsScope`/`setCommentsScope` убираются (хирургически). Бейдж таба «Comments»
  читает публичный счётчик (`comments_count` или из `countChanged`).

## 5. UI — наш язык (SP-токены, без Material-оверрайдов)

Переиспользуем существующие классы карточки; новый визуальный язык не вводим.

- **Тогл All / Private** — существующий `.scope-seg` segmented-control, счётчики: All (публичные), Private (свои).
- **Compose** — `.comment-input` (textarea) с плейсхолдером по скоупу («Ваш комментарий видят все» /
  «Ваш комментарий не видит никто»); «Отправить» активна при непустом тексте; Enter — отправка,
  Shift+Enter — перенос строки.
- **Тред (All):** строка комментария = аватар (фото юзера или круг с инициалами) · имя (полужирным,
  нейтральный цвет) · относительное время · тело. Под телом — действия: «Ответить» (на чужой),
  «Изменить» · «Удалить» (на свой). `updated_at` → «(изменено)». Ответы — с отступом под родителем
  (1 уровень), аватар мельче. **Счётчик в дереве:** у топ-комментария «Ответы (N)». Инлайн reply-бокс
  открывается под тредом по «Ответить». Удалённый топ с ответами → плашка «Комментарий удалён», ответы остаются.
- **Private:** плоский список своих заметок, без «Ответить»; edit/delete свои.
- **Пусто:** «Комментариев пока нет» / «Личных заметок пока нет» (existing `.comments-empty`).
- **Относительное время** — pure-util `relativeTimeRu(date)` («только что», «5 минут назад», «вчера»,
  «1 неделю назад», абсолютная дата для старого). Если в SP есть готовый — переиспользовать.
- **Аватар** — `author_avatar` из RPC; фолбэк — круг с инициалами (SP-стиль).

## 6. Тестирование

- **Unit сервиса** (mock supabase): каждый метод зовёт нужный RPC с верными аргументами; маппинг строк
  в `PropertyComment[]`.
- **Unit компонента**: построение 1-уровневого дерева из плоских строк; счётчики (All/Private/ответы);
  тогл скоупа; compose enable/disable; reply-бокс; edit/delete только свои; рендер относительного времени;
  empty-state по скоупу; тумбстоун удалённого с ответами.
- **SQL-смоук каждой RPC** (psql, `set_config('request.jwt.claim.sub', <uuid>, true)`):
  - видимость: невидимый объект → отказ/пусто;
  - изоляция Private: юзер B не видит приватные A;
  - ответы: нельзя приватно; нельзя на приватный; нельзя на удалённый; нельзя на ответ (только на топ);
  - edit/delete только свои (чужой → отказ);
  - счётчик `comments_count` после add/delete (только публичные неудалённые).

## 7. Миграции и гейты

- **Одна миграция** (`docs/migrations/`): ALTER (2 колонки + CHECK + индекс) + 4 RPC + RLS/GRANT +
  новый триггер `trg_property_comments_count` (+ бэкфилл `properties.comments_count` разовым UPDATE).
  Идемпотентна, обратима (DROP в хвосте). `trg_sync_context_comments` не трогаем.
- **DDL на прод — только после явного «да»** (применяю под `supabase_admin`, ROLLBACK-смоук как в LM).
- Реализация — **Subagent-Driven** (крупная фича; см. [[feedback-use-subagent-driven]]).
- Деплой-гейт перед пушем: `npm run lint && npm run buildFrontend:prodWeb`.

## 8. Вне scope v1 (roadmap)

- Реакции/лайки на комментарии (FB-фича) — не запрошено.
- Модерация чужих комментариев владельцем/админом в клиенте (`deleted_by_admin` → Control-панель).
- @-упоминания, уведомления о новых комментариях/ответах.
- Медиа в комментариях (обобщение дренера Storage уже в roadmap realtime на этот случай).
- Вынос общего `can_user_see_property()` (SC-10) — helper пишется заменяемым, но сам вынос отдельно.
