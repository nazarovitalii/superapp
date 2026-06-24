# Дизайн: WP-M — редактирование листинга

> **Дата:** 2026-06-24 · **Статус:** утверждён к планированию (brainstorming-фаза пройдена)
> **Мандат:** продакшн для риелторов Дубая, **никакого говнокода и костылей**; защита — на сервере.
> **Источники:** `docs/TODO.md` секция «WP-M» (детализация 2026-06-24); форма добавления
> `src/app/mrsqm/pages/add-property/`; `update_property`/`republish_property` (эпик LM).

## 0. Контекст и цель

Владелец может править только цену+описание (инлайн-мини-редактор в owner-панели). Нужно **полноценное
редактирование** объекта — отдельное окно, как форма добавления, но с ограниченным набором полей и в 3 таба.
Окно открывается по «Изменить»/«Редактировать» в карточке своего объекта.

## 1. Закрытые решения (brainstorming 2026-06-24)

| #                  | Решение                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Раскладка          | **3 таба: Параметры · Описание · Фото.** Сверху read-only «шапка»: категория · сделка · адрес.                                  |
| Статус после правки| **Активный → остаётся активным + актуализируется** (`last_actualized_at=now()`, всплывает в ленте), **без модерации**.          |
| Отклонённый/снятый | **То же единое окно**; «Сохранить» = переопубликация (`status→pending_review`). Старый инлайн-мини-редактор **убираем**.         |
| Цена               | Текущую `price` менять можно (прежняя → `previous_price`). **`original_price`: если уже задана — НЕ менять** (read-only).        |
| Фото               | **Полное:** добавить новые + удалить существующие + переставить/главное + планировка.                                            |
| Beds/Baths         | **Неизменяемы** (не в списке создателя). Как и категория/адрес.                                                                 |
| Безопасность       | **Неизменяемые поля исключены и из UI, и из серверной RPC** — их нельзя поменять через devtools (см. §2).                       |

## 2. Whitelist редактируемого vs неизменяемое (СЕРВЕРНОЕ требование)

> ⚠️ **Главное требование создателя:** неизменяемые поля **не должны быть параметрами RPC вообще** — не
> только спрятаны в UI. Тогда обход через devtools/прямой вызов невозможен: функция физически не умеет
> менять то, чего нет в её сигнатуре.

**Редактируемые (whitelist — ТОЛЬКО эти поля принимает и пишет `edit_property`):**
`is_maid`, `is_study`, `is_hotel_pool`, `is_vastu`, `area_sqft` (BUA), `area_sqm`, `plot_sqft`,
`floor_level_id`, `floor_number`, `floors_in_unit`/`floors_in_unit_id`, `view_ids[]`, `position_ids[]`,
`amenity_ids[]`, `furnished`, `price` (+`price_period` для аренды), `occupancy_status`, `lease_until`,
`listing_type`, `visibility`, `public_location_id` (видимость адреса), `description`. Фото — отдельным
путём (§5).

**Неизменяемые (НЕТ в сигнатуре `edit_property`, не пишутся):**
`category_id`, `unit_type_id`, `sub_type_id`, `deal_type`, `location_id`, `bedrooms`, `bathrooms`,
`original_price` (если уже задана), `owner_id`, `status` (управляется логикой, не клиентом).

`original_price`: если в БД `NULL` — `edit_property` разрешает задать один раз; если уже не-NULL —
любое присланное значение **игнорируется** (серверный guard), поле в UI read-only.

## 3. UI — 3 таба (наш язык, SP-токены)

Открывается как страница (роут `/mrsqm/edit/:id`), верстка как форма добавления. По «Изменить» (active)
или «Редактировать» (rejected/withdrawn) из owner-панели карточки → навигация на этот роут.

- **Шапка (read-only):** категория · сделка · полный адрес — серым, без возможности правки (это контекст).
- **Таб «Параметры»:** динамический по типу объекта набор (переиспуёт `property-type-fields.ts`):
  Maid/Study/Hotel/Vastu (чекбоксы), BUA+Plot, этажность, виды, расположение, удобства, мебель,
  **цена** (текущая редактируется; `original_price` read-only если задана), занятость (+«занято до»),
  тип листинга, видимость (бегунок публичного адреса).
- **Таб «Описание»:** textarea.
- **Таб «Фото»:** галерея существующих (удалить/перетащить/сделать главным) + добавить новые + планировка.
- Кнопка «Сохранить» (с учётом статуса — текст «Сохранить» для active, «Отправить на проверку» для rejected/withdrawn); «Отмена» → назад.

## 4. Сервер — `edit_property` RPC (строгий whitelist)

Новая RPC `edit_property(...)` SECURITY DEFINER, owner-check (`owner_id = auth.uid()`), принимает **только
whitelist §2**. Логика статуса:
- `active` → UPDATE whitelist + `last_actualized_at = now()`; статус не меняется.
- `rejected` / `archived_withdrawn` → UPDATE whitelist + `status = 'pending_review'` (переопубликация).
- `pending_review` / `expired` / `archived_sold` → правка запрещена (`RAISE`): pending ждёт модерации, expired — сперва «Продлить», sold — архив (только удаление). UI «Изменить»/«Редактировать» для этих статусов и так не показывается (`OWNER_ACTIONS_BY_STATUS`).
- `price`: если новое `price` ≠ текущему → `previous_price = OLD.price`, `price_changed_at = now()`.
- `original_price`: писать только если `OLD.original_price IS NULL`.

**Заменяет** узкие `update_property`(цена+описание) и `republish_property` — их вызовы из карточки
убираются; сами RPC дропаем в миграции (других потребителей нет: только `property-owner.service`).
`actualize_property` (кнопка «Поднять вверх») остаётся.

Миграция — с явного «да» создателя; ROLLBACK-смоук как в LM.

## 5. Фото — расширить `PropertyPhotoService`

Сейчас есть `uploadAndAttach` (нарезка+Storage+INSERT) и `getPhotos`. Дописать:
- `deletePhoto(propertyId, path)` — удалить из Storage + DELETE из `property_photos` (full+thumb).
- `reorder(propertyId, orderedKeys)` — обновить `order_index` (главное = 0); отдельные счётчики для
  `gallery` и `floor_plan` (как в `getPhotos`).
Таб «Фото» грузит существующие через `getPhotos`, добавляет новые через `uploadAndAttach`, удаляет/двигает
новыми методами. Удаление одиночного фото — точечное (не через storage_cleanup_queue, та — для удаления объекта).

## 6. Архитектура

Отдельный standalone-компонент **`pages/edit-property/edit-property.component.{ts,html,scss}`** (+spec).
Форма добавления — монолит 38 КБ; не рефакторим её под двойной режим (риск). Edit переиспуёт **ассеты**, не
разметку: `PropertyCreateService` (справочники `get_filter_options`, `search_*`), `property-type-fields.ts`
(набор полей по типу), `PropertyPhotoService`. Загрузка текущих значений — через `get_property` (owner видит
свой объект в любом статусе). Роут `/mrsqm/edit/:id` + guard (только владелец). Сервис-обёртка
`property-owner.service`: метод `editProperty(payload)` вместо `updateProperty`/`republishProperty`.

## 7. Тестирование

- **Сервер (psql-смоук):** `edit_property` от владельца меняет whitelist; **чужой → отказ**; присланные
  неизменяемые поля невозможны (их нет в сигнатуре — тест: вызвать с попыткой и убедиться, что bedrooms/
  category не изменились); `original_price` не перезаписывается если задана; active→active+actualize,
  rejected→pending_review; price→previous_price.
- **Сервис (unit, mock supabase):** `editProperty` шлёт верные параметры; `deletePhoto`/`reorder` зовут
  Storage+DB.
- **Компонент (unit):** 3 таба; шапка read-only; набор полей по типу; `original_price` disabled если задана;
  кнопка «Сохранить»/«Отправить на проверку» по статусу; валидация (цена>0, обязательные); фото add/delete/reorder.

## 8. Миграции и гейты

- **Одна миграция** (`docs/migrations/`): `edit_property` (whitelist+actualize+guard) + DROP `update_property`/
  `republish_property`. Идемпотентна, обратима. **DDL на прод — только «да».**
- Деплой-гейт: `npm run lint && npm run buildFrontend:prodWeb`. Реализация — Subagent-Driven.

## 9. Вне scope

- Правка категории/сделки/адреса/beds/baths (по решению — неизменяемы).
- Правка в статусах pending/expired/sold (expired — сперва «Продлить»).
- Рент-чеки (`cheques`) в whitelist — не в списке создателя; добавить позже при запросе.
- Рефактор формы добавления в общий компонент (отдельная задача, если понадобится переиспользование).
