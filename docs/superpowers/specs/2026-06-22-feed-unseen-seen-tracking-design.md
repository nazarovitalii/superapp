# Дизайн: unseen/seen-трекинг ленты (superApp)

> Дата: 2026-06-22 · Статус: согласован, к плану реализации
> Источник ТЗ: `~/Projects/realtime/docs/handoff-frontend-saved-filters.md` (v3)
> Контракт-первоисточник: `realtime/docs/superpowers/specs/2026-06-22-matcher-design.md §7.1`

## Цель

Объект в ленте — **«жёлтый» (новый/непросмотренный)** для юзера, если он появился/совпал/актуализировался
позже, чем юзер его последний раз **видел в ленте**. Фронт **ничего не считает** — шлёт два события
(показан / открыт) и рендерит то, что вернул бэк. Всё считает БД.

## Три поверхности — одна модель

Все три считаются из **одной** пары `(user_id, property_id)` в `user_seen_listings` с тремя метками
(третья, `contact_at`, добавляется на Стадии 2):

- **`shown_at`** — слабый частый сигнал «показан в ленте» (impression). Драйвит полоску, `is_unseen`, `seen_preview`.
- **`seen_at`** — средний сигнал «открыл карточку» (engagement). Драйвит `seen_full`.
- **`contact_at`** — сильнейший сигнал «нажал контакт WA/TG» (Стадия 2). Драйвит `seen_contact`.

Воронка владельца **вложенная**: `seen_preview` ⊇ `seen_full` ⊇ `seen_contact`.
Увидел объект **где угодно** → `shown_at` бампается → он гаснет везде, фильтры пересчитываются сами.

| Поверхность | Read-side формула | Кто блокирует | E2E сейчас |
|---|---|---|---|
| **2. Полоска в общей ленте** | `is_unseen` = `GREATEST(created,updated) > shown_at` (Прил. D) | никто — целиком superApp | ✅ да |
| **3. Воронка владельца** | `seen_preview` (shown_at) + `seen_full` (seen_at) + `seen_contact` (contact_at) | никто — целиком superApp | ✅ да |
| **1. Бейдж сохр. фильтра** | `unseen_count` = COUNT по `matched_at > shown_at` (Прил. A) | realtime: нет `filter_matches.matched_at` | ⚠️ нет |

## Авторитетные правки модели от владельца (канон поверх ТЗ)

1. **Жёлтое = вертикальная полоска по левому ребру карточки на всю высоту**, только в ленте (не фон, не значок).
2. **Impression (`shown_at`) пишется батчем на всю загруженную страницу ленты сразу** (не per-card
   IntersectionObserver, как в ТЗ §4.2). Упрощение — берём его.
3. **Открыл карточку → всегда шлём `seen_full` (`track_view`)**, независимо от того, видел ли объект в ленте.
4. **Гашение полоски:** видна сразу при загрузке, держится **3 секунды**, затем **плавно уходит анимацией**.
   Цель — «успеть увидеть новое» + чистый список при следующем чтении.
5. **`seen_contact` — третий сигнал воронки (Стадия 2):** нажатие кнопки контакта (WhatsApp/Telegram)
   в карточке листинга = самый сильный сигнал интереса. Засчитывать **на нажатие кнопки**, не на факт
   переписки. Нажатие подразумевает, что карточка открыта и объект показан → отдельно слать open/impression
   не нужно, бэк проставит нижележащие метки (`seen_at`, `shown_at`) сам.

## Состояние БД на старте (проверено по `docs/database.md`)

- `user_seen_listings`: PK `(user_id, property_id)`, есть `seen_at` — **нет `shown_at`**.
- Engagement-RPC называется **`track_view(p_property_id, p_user_id)`** (не `record_property_view`);
  пишет `seen_at` раз в день (гард `seen_at::date = CURRENT_DATE`); **с фронта не вызывается вообще**.
- Bulk-эндпоинт impression — **отсутствует**.
- `get_feed` jsonb-вывод **не содержит `is_unseen`**.
- `get_saved_filters` уже возвращает `unseen_count`, но это **хранимая колонка** `saved_filters.unseen_count`,
  а не живой COUNT по `shown_at` (семантика из Прил. A — другая).
- `filter_matches`: есть `notified_at`, **нет `matched_at`** (нужен для Прил. A/B — realtime-сторона).
- `get_listing_delivery_stats` — **не существует**.
- `user_seen_listings` **не имеет `contact_at`** (нужен для `seen_contact`, Стадия 2).

## Порядок работ — Подход A (стадиями по зависимостям)

Каждая стадия независимо верифицируется; человек-чекпойнт между ними.

---

## Стадия 1 — полоска в общей ленте + механика impression/engagement

Целиком в нашей власти, проверяемо end-to-end.

### Read-side SQL (в `docs/migrations/`, применяю через `/migrate` с явного согласия)

1. **`user_seen_listings += shown_at`** — `ALTER TABLE public.user_seen_listings ADD COLUMN IF NOT EXISTS shown_at timestamptz;`
   `IF NOT EXISTS` — идемпотентно, чтобы не конфликтовать с realtime (ТЗ относит DDL колонки к их стороне → координация).

2. **`mark_listings_shown(p_property_ids uuid[])`** — новый RPC, `SECURITY DEFINER`:
   - для `auth.uid()` upsert `shown_at = now()` по каждому id;
   - `ON CONFLICT (user_id, property_id) DO UPDATE SET shown_at = now()`;
   - **пропускает** объекты, где `properties.owner_id = auth.uid()` (чтобы не пачкать воронку `seen_preview`);
   - `seen_at` не трогает.

3. **Фикс `track_view`** (staleness-proof: `pg_get_functiondef` + regexp в DO-блоке, тело из БД, не из доков):
   - на **каждом** вызове: upsert `seen_at = now()` И `shown_at = now()`;
   - гард «раз в день» на запись меток **снят**;
   - `views_count++` — всегда; `unique_views_count++` — только при первой когда-либо записи пары `(user, property)`;
   - owner-skip остаётся (не считать просмотр владельцем своего объекта).

4. **`get_feed += is_unseen`** (staleness-proof DO-патч jsonb-вывода):
   `'is_unseen', (GREATEST(p.created_at, p.updated_at) > COALESCE((SELECT usl.shown_at FROM user_seen_listings usl WHERE usl.property_id = p.id AND usl.user_id = <current_user>), 'epoch'::timestamptz))`
   где `<current_user>` = текущий юзер по существующей в `get_feed` конвенции (`COALESCE(p_user_id, auth.uid())` — сверить по телу функции при реализации).

### Фронт (Angular, `src/app/mrsqm/`)

- **Тип:** `PropertyFeedItem += is_unseen?: boolean` (`types/database.ts`).
- **Новый `SeenTrackingService`** (`services/seen-tracking.service.ts`):
  - `markShown(ids: string[]): Promise<void>` → RPC `mark_listings_shown`. Fire-and-forget, ошибки глушим.
  - `recordView(id: string): Promise<void>` → RPC `track_view`. Fire-and-forget, на каждом открытии.
- **Feed-page** (`pages/feed/feed-page.component.ts`):
  - после `_load()` (первая загрузка и append) — собрать `property_id` загруженной страницы → `markShown(ids)`;
  - запустить **один таймер на батч**; через **3000 мс** флипнуть `is_unseen = false` у этих items в сигнале
    `properties` → CSS-анимация ухода полоски; для append флипать только новые items;
  - все таймеры зарегистрировать и очистить при destroy (`DestroyRef` callback);
  - `openDetail()`/`toggleDetail()` → `seen.recordView(property.id)` (всегда).
- **Property-card** (`components/property-card/`, **hot-path**):
  - `isUnseen = input(false)`; в шаблоне `[class.is-unseen]="isUnseen()"` на `.inner-wrapper`;
  - в фиде: `[isUnseen]="property().is_unseen"`;
  - SCSS: `.inner-wrapper::before` — `position:absolute; left:0; top:0; bottom:0; width:3px;`
    жёлтый токен темы, `opacity:0`, `transition: opacity 400ms`; `.inner-wrapper.is-unseen::before { opacity:1; }`.
    Снятие класса через 3 сек → плавный fade-out;
  - **никаких таймеров/подписок в карточке** — только класс-биндинг от сигнал-инпута + CSS.

### Поведение (динамика)

- Загрузка страницы → стрипы видны на `is_unseen`-объектах → батч `markShown` уходит на сервер →
  через 3 сек полоски плавно гаснут локально. На следующем чтении (`get_feed`) объект уже не `is_unseen`
  (т.к. `shown_at` обновлён) — стрип не показывается.
- Открытие карточки → `track_view` бампает `seen_at` + `shown_at` → объект гаснет при следующем чтении везде.
- Реактуализация (`updated_at` двинулся вперёд) → `GREATEST(created,updated) > shown_at` снова `true` →
  объект снова жёлтый. Локально «видел навсегда» **не кэшируем** (ТЗ §4.4).

### Тесты (Стадия 1)

- `SeenTrackingService`: `markShown` зовёт RPC с ids; `recordView` зовёт `track_view`; ошибки не валят поток.
- Feed-page: на load вызывается `markShown(ids)`; после таймера `is_unseen` флипается в `false`; таймеры
  чистятся при destroy; `openDetail` зовёт `recordView`.
- Property-card: класс `is-unseen` отражает инпут `isUnseen`.
- SQL (через `/test-prod` + SELECT): `is_unseen` присутствует в выводе `get_feed`; `mark_listings_shown`
  бампает `shown_at`; `track_view` бампает обе метки на двух подряд вызовах в один день; owner-skip работает.

### Верификация Стадии 1

Применить миграции → SELECT-ами подтвердить колонку/RPC/поле → запустить фронт → загрузить ленту →
увидеть полоску + 3-сек fade → открыть карточку → `seen_at`/`shown_at` бампнулись.

---

## Стадия 2 — воронка владельца (вложенная: `seen_preview` ⊇ `seen_full` ⊇ `seen_contact`)

- **SQL:**
  - `user_seen_listings += contact_at timestamptz` — `ADD COLUMN IF NOT EXISTS` (аддитивно, с согласия владельца БД).
  - **«Отметить контакт»** — расширить `track_view` параметром `p_action text DEFAULT 'view'`
    (рекомендация — DRY, переиспользует owner-skip + идемпотентный upsert): `action='contact'` бампает
    `contact_at = now()` **И** `seen_at = now()` **И** `shown_at = now()` (контакт ⟹ открыл ⟹ показан);
    `action='view'` — как в Стадии 1. Идемпотентно по PK пары `(user, property)`.
  - новый `get_listing_delivery_stats(p_property_id)` → три цифры (Прил. C):
    `seen_preview` = `COUNT(DISTINCT user_id) WHERE shown_at IS NOT NULL`,
    `seen_full` = `COUNT(DISTINCT user_id) WHERE seen_at IS NOT NULL`,
    `seen_contact` = `COUNT(DISTINCT user_id) WHERE contact_at IS NOT NULL`.
- **Фронт:**
  - в карточке листинга на нажатие кнопки **WhatsApp/Telegram** → `SeenTrackingService.recordContact(id)`
    (`track_view` с `p_action='contact'`). Засчитывать на нажатие, не на факт переписки;
  - в карточке владельца (`property-detail`) показать три цифры воронки.
- Верифицируется отдельно (данные `shown_at`/`seen_at` уже копятся со Стадии 1).
- **Опционально на будущее (не v1):** колонка `contact_channel` для разбивки контакт через WA vs TG.

---

## Стадия 3 — бейдж сохранённого фильтра

- **Фронт сразу:** `SavedFilter += unseen_count: number`; в `feed-filter-panel` на `.saved-filter-item`
  рисовать бейдж при `unseen_count > 0`; перечитывать список при открытии панели / pull-to-refresh /
  возврате на экран после ленты. Рисуем из текущего хранимого `unseen_count` (что уже отдаёт `get_saved_filters`).
- **Апгрейд семантики (ждёт realtime):** когда появится `filter_matches.matched_at`, переписать
  `get_saved_filters.unseen_count` на живой COUNT (Прил. A) и добавить `get_filter_feed.is_unseen` (Прил. B).

---

## Зависимости realtime-стороны (вне нашего объёма — инструкции владельцу)

- `filter_matches += matched_at` (timestamptz) + matcher populates его на каждый матч и price_drop.
- Координация по `user_seen_listings.shown_at`: добавляем `IF NOT EXISTS` с обеих сторон, кто первый — тот добавил.

## Открытые уточнения (не блокируют Стадию 1)

- **«Значимое изменение» для общей ленты (ТЗ §7):** Стадия 1 берёт буквальный `GREATEST(created,updated)`
  (Прил. D). Если тривиальные правки `updated_at` начнут шуметь — сузить до price/status. YAGNI сейчас.
- Точки открытия карточки помимо feed-page (saved-properties, поиск) — `recordView` туда добавить
  как follow-up, если потребуется.
