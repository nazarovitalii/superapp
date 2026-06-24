# Continuation Prompt — WP-M (редактирование листинга)

Используй этот документ как стартовый контекст для следующей сессии.

---

## Контекст проекта

**superapp** = форк Super Productivity (Angular/Electron/Capacitor), переосмыслен как **MrSQM** — CRM-клиент для дубайских риелторов. Код MrSQM — в `src/app/mrsqm/`. Общая Supabase self-hosted. Деплой: GitHub Actions → GHCR → Coolify (`cancel-in-progress: true`).

Все ответы, комментарии, UI-строки — **на русском**.

**Гейты (ОБЯЗАТЕЛЬНО):**

- DDL на прод — только явное «да» создателя
- Пуш/деплой — только по явной просьбе
- `npm run lint && npm run buildFrontend:prodWeb` перед КАЖДЫМ пушем
- `npm run checkFile <filepath>` после каждого изменённого `.ts`/`.scss` файла
- Один `git push` (не два подряд — CI cancel-in-progress убьёт первый билд)
- `git push --no-verify` — разрешено (pre-push тест-флейк не наш, полный сьют чистый)

---

## Текущее состояние (на 2026-06-24)

**Задеплоено:**

- SC-эпик (серверный охват get_feed): p_scope, P2-фикс, снос оптимистики бейджа, unseen-трекинг.
- LM-эпик (управление листингами): owner-панель (статус+кнопки НАВЕРХУ карточки, выше цены), «Активно до 20 июля 2026» из `expires_at`, rejection_reason, renew/republish/delete RPCs, durable Storage-queue.
- CD-1/2/3: «В избранное» скрыто у своих объектов; owner-панель редизайн (`.owner-panel`, тон-акцент, `.is-delete` красным справа).
- Storage-дренер: очередь дурабельная, realtime-команда пишет дренер (их репо, не трогаем).

**Закоммичено локально (НЕ запушено — дождаться следующего деплоя):**

- `c350c8b99` — переписка+резюме дня 2026-06-24 (CD задеплоена; F-13 спека+план)

**Ждут реализации:**

1. **WP-M** (редактирование листинга) — спека УТВЕРЖДЕНА, план НЕ написан — **ТЕКУЩАЯ ЗАДАЧА**
2. **F-13** (комментарии) — спека+план готовы, Task 1 = миграция БД (нужен явный «да»)
3. **SC-7** (селектор города в тулбаре) — фронтенд-only, без миграций
4. **W-4** (онбординг-мастер SP блокирует логин) — баг

---

## WP-M — что уже сделано

**Спека утверждена:** `docs/superpowers/specs/2026-06-24-wp-m-edit-listing-design.md`

**Что выяснено при де-риске (сверка с живой БД):**

- `get_property` уже отдаёт `expires_at` — дополнительных серверных правок для чтения нет.
- `is_vastu` колонка СУЩЕСТВУЕТ в `properties` (не нужно добавлять).
- Бакет `property_photos` СУЩЕСТВУЕТ и содержит данные (24 фото в проде). Задача K = подключить загрузку UI, не создавать бакет.
- `update_property` принимает только `(p_property_id, p_price, p_description)` — слишком узкий; заменяется новой `edit_property`.
- `republish_property` тоже заменяется новой `edit_property`.

---

## Ключевые решения спеки WP-M

**Архитектура:**

- Роут `/mrsqm/edit/:id` → standalone component `pages/edit-property/edit-property.component.*`
- 3 таба: Параметры · Описание · Фото
- Read-only шапка наверху: категория · сделка · полный адрес
- Guard: только владелец (owner_id === auth.uid())

**Whitelist (ТОЛЬКО эти поля в RPC `edit_property`):**
`is_maid, is_study, is_hotel_pool, is_vastu, area_sqft, area_sqm, plot_sqft,
floor_level_id, floor_number, floors_in_unit, floors_in_unit_id, view_ids[], position_ids[],
amenity_ids[], furnished, price (+ price_period для аренды), occupancy_status, lease_until,
listing_type, visibility, public_location_id, description`

**НЕ в сигнатуре RPC (физически невозможно поменять):**
`category_id, unit_type_id, sub_type_id, deal_type, location_id, bedrooms, bathrooms,
original_price (если уже задана), owner_id, status`

**Логика статуса после сохранения:**

- `active` → остаётся active + `last_actualized_at = now()` (без модерации, всплывает в ленте)
- `rejected` / `archived_withdrawn` → `status = 'pending_review'` (переопубликация)
- `pending_review` / `expired` / `archived_sold` → RAISE (запрещено)

**Логика цены:**

- Новая цена ≠ OLD.price → `previous_price = OLD.price, price_changed_at = now()`
- `original_price`: писать ТОЛЬКО если `OLD.original_price IS NULL`

**Фото (расширить PropertyPhotoService):**

- Добавить `deletePhoto(propertyId, path)` — точечное удаление (не через storage_cleanup_queue)
- Добавить `reorder(propertyId, orderedKeys)` — обновить `order_index`

**Сервис:** новый метод `PropertyOwnerService.editProperty(payload)` заменяет `updateProperty` + `republishProperty`

**Безопасность (КРИТИЧНО, требование создателя):**

> «убрать все неизменяемые поля не только из UI но и из функции чтобы пидоры через devtools не смогли отправить на изменение все что хотят»
> RPC `edit_property` SECURITY DEFINER, принимает ТОЛЬКО whitelist. Неизменяемые поля = не параметры вообще.

**Миграция:** одна — `docs/migrations/`, `edit_property` + DROP `update_property` + DROP `republish_property`. Применяется ТОЛЬКО с явного «да» создателя.

---

## Что делать в следующей сессии

### Шаг 1: writing-plans

Invoke `superpowers:writing-plans` skill для написания подробного плана реализации WP-M по спеке `docs/superpowers/specs/2026-06-24-wp-m-edit-listing-design.md`.

Сохранить в `docs/superpowers/plans/2026-06-24-wp-m-edit-listing.md`.

### Шаг 2: Запросить «да» на миграцию

Перед Task 1 (DDL) — явно запросить согласие создателя:

- Показать SQL миграции: `CREATE OR REPLACE FUNCTION edit_property(...)` + `DROP FUNCTION update_property(...)` + `DROP FUNCTION republish_property(...)`
- Дождаться явного «да»

### Шаг 3: SDD (Subagent-Driven Development)

После «да» — запустить реализацию субагентами по плану. Порядок задач примерно:

1. Миграция БД + smouk (требует «да»)
2. PropertyPhotoService.deletePhoto + reorder (unit-тесты)
3. PropertyOwnerService.editProperty (unit-тесты)
4. Route + component scaffold (edit-property.component)
5. Таб Параметры (переиспользует property-type-fields.ts + PropertyCreateService)
6. Таб Описание
7. Таб Фото (галерея + reorder CDK + add + delete)
8. Guard + навигация из owner-панели
9. E2E или финальный smoke

---

## Ключевые паттерны (копировать, не изобретать)

**Supabase RPC:**

```ts
const { data, error } = await this._supabase.rpc<ReturnType>('edit_property', {
  p_property_id: id,
  p_price: this.price(),
  // только whitelist-поля
});
```

**Angular signals/OnPush:**

```ts
readonly detail = signal<PropertyDetail | null>(null);
readonly expiryDate = computed(() => formatLongDateRu(this.detail()?.expires_at));
```

**Форма (переиспользовать из add-property):**

- `PropertyCreateService` — справочники `get_filter_options`, `search_*`
- `property-type-fields.ts` — набор полей по типу объекта
- `PropertyPhotoService` — загрузка/порядок фото

**RLS-backstop паттерн (для property_comments, F-13):**

```sql
ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON table FROM anon, authenticated;
-- access only through SECURITY DEFINER RPC
```

**Форматирование дат:**

```ts
import { formatLongDateRu } from '../../util/feed-date.util'; // → «20 июля 2026»
import { formatDetailDate } from '../../util/feed-date.util'; // → «Today» / «16 June»
```

---

## Файловая структура для создания

```
src/app/mrsqm/pages/edit-property/
├── edit-property.component.ts       # standalone, OnPush
├── edit-property.component.html
├── edit-property.component.scss
└── edit-property.component.spec.ts
```

**Модифицировать:**

- `src/app/mrsqm/services/property-owner.service.ts` — добавить `editProperty()`
- `src/app/mrsqm/services/property-photo.service.ts` — добавить `deletePhoto()`, `reorder()`
- `src/app/mrsqm/routing` — добавить роут `/mrsqm/edit/:id`
- `src/app/mrsqm/components/property-detail/property-detail.component.*` — кнопка «Изменить»/«Редактировать» → навигация на роут

---

## Горячие факты, которые надо знать

1. **`property-type-fields.ts`** — уже существует, содержит набор полей по unit_type. Переиспользовать как есть.
2. **`PropertyCreateService`** — справочники (get_filter_options, search_locations, search_developers). Переиспользовать.
3. **`PropertyPhotoService`** — уже есть `uploadAndAttach()` и `getPhotos()`. Добавить `deletePhoto()` и `reorder()`.
4. **`PropertyOwnerService`** — уже есть `updateProperty()` / `republishProperty()` / `deleteProperty()` / `actualizeProperty()` / `renewProperty()`. Добавить `editProperty()`, убрать вызовы `updateProperty`/`republishProperty`.
5. **`get_property`** отдаёт все поля объекта + `expires_at` + `rejection_reason`. Загрузка текущих значений для формы редактирования — через `get_property`.
6. **`OWNER_ACTIONS_BY_STATUS`** — константа в property-owner.service, определяет доступные кнопки по статусу. Кнопки «Изменить»/«Редактировать» показываются только для `active`, `rejected`, `archived_withdrawn`.
7. **`edit_property` заменяет** `update_property` + `republish_property`. После миграции старые методы в сервисе убрать.
8. **Форма добавления** — монолит 38 КБ в `pages/add-property/`. НЕ рефакторить под двойной режим (риск). Edit — отдельный компонент, переиспользует только ассеты.
9. **`docs/migrations/` папка** — все новые SQL-файлы сюда; после применения перекладывать в `applied/`.

---

## F-13 (комментарии) — не начинать без DDL-гейта

Спека: `docs/superpowers/specs/2026-06-24-f13-property-comments-design.md`
План: `docs/superpowers/plans/2026-06-24-f13-property-comments.md`

Task 1 плана = миграция `property_comments` + хелпер `_can_see_property` + `get_property_comments` RPC + счётчик-триггер.

**Критические факты F-13:**

- `properties.comments_count` НИКЕМ не поддерживался (все 22 = 0) → план заводит новый триггер `trg_property_comments_count`
- `trg_sync_context_comments` = ДРУГОЙ счётчик (user_context.comments_count = кол-во authored комментов юзера) — НЕ трогать
- `is_mine` в RPC-ответе = `(c.user_id = auth.uid())` — сервер, не клиент
- Helper `_can_see_property` должен быть 1:1 с гейтом `get_property`: `owner_id = v_uid OR (active AND public) OR (active AND network AND owner = ANY(v_network_ids))`
- Constraint `property_comments_deleted_by_check` = `IN('author','moderator')` — 'author' валиден
- **DDL Task 1 требует явного «да» создателя**

---

## Незапущенные деплои (локальные коммиты)

При следующем пуше включить (ОДНИМ пушем вместе с WP-M):

- `c350c8b99` — переписка+резюме дня 2026-06-24
- `docs/TODO.md` (обновления WP-M + P-5b)
- `docs/tabs.md` (секция /mrsqm/edit/:id)

Гейт: `npm run lint && npm run buildFrontend:prodWeb` → всё ок → один пуш.
