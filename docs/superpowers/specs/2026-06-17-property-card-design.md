# Карточка объекта (right-panel) — дизайн-спека

Дата: 2026-06-17 · Статус: на ревью · Источник требований: фидбек создателя 2026-06-17 (пункты 8–11 + детальная спека карточки в переписке этого дня).

Компонент: `src/app/mrsqm/components/property-detail/property-detail.component.{ts,html,scss}`.
RPC данных: `get_property` (`docs/database.md:449`).

---

## 1. Контекст и текущее состояние

Карточка уже работает (P-3, на проде): галерея (Swiper + нативный `<dialog>` лайтбокс), реальные данные `get_property`, секции (Особенности/Расположение/Девелопер/Документы/Описание), блок «Агент», owner-actions (edit/actualize/archive), каркас из 2 табов (Инфо/Комментарии).

Что `get_property` **уже отдаёт** (используем без миграций):

- Все поля Tech-блока: `deal_type`, `category_id`/`unit_type_id`/`sub_type_id`, `bedrooms`, `is_maid`, `bathrooms`, `area_sqft`, `plot_sqft`, `floor_number`, `floor_level_id`, `floors_in_unit`, `layout_id`, `furnished`, `occupancy_status`, `lease_until`, `created_at`, `updated_at`.
- Блок `agent{}`: `full_name`, `photo_url`, `agency_name`, `emirate_name`, `whatsapp_phone` (с гейтом по плану/сети), `about`, `languages`.
- Флаги `is_owner`, `is_network`.
- Метрики: `views_count`, `unique_views_count`, `contacts_count`, `impressions_count`, `comments_count`.
- Локация: `location_full_path` (полный путь), `developer_name_ref`, `developer_logo_url`.

Что в БД **есть, но `get_property` не отдаёт / не хватает**:

- Проект из `location_developers` (`project_name`, `project_status`/`completion_status`, `completion_year`, `completion_q`, `developer_id`) — не джойнится.
- Путь по бегунку приватности (`public_location_id`) — колонка вероятно есть (миграция Header v4), но в `database.md` не задокументирована и `get_property` её путь не отдаёт.
- «Активных листингов агента» — не считается.
- `is_vastu` — колонки нет вообще.
- Метрика «контакт просмотрен»: есть колонка-счётчик `contacts_count`, но **нет таблицы дедупа и RPC записи**.
- `community_layouts` (привязка к `location_id`, поля `name/description/source/is_active/created_by/order_index`) — существует; `properties.layout_id` — FK (вероятно на неё). Автокомплита/fuzzy/создания пока нет.
- `property_photos.photo_type` (CHECK) — существует; `getPhotos` тянет **все** типы в одну ленту.

## 2. Принятые решения

1. **Карточка = 4 независимых слоя**, делаем по очереди; каждая миграция — с отдельного «да».
2. **Layouts → переиспользуем `community_layouts`** (не плодим `properties_layouts`). При нужде привязки к проекту — добавляем ссылку на девелопера/проект в существующую таблицу.
3. **Metrics-таб → показываем всё** (views, unique views, impressions, comments) + строку «Ваш контакт просмотрено: N». Таб виден **только владельцу** объекта (`is_owner`).

---

## Слой 1 — Фронт-редизайн (без миграций)

Всё на полях, которые `get_property` уже отдаёт. Поля из слоёв 2–4 (Project, slider-адрес, active listings, `+vastu`, контакт-метрика) **скрываются**, пока нет данных (`@if`), а не показываются пустыми.

### 1.1 Три таба

`activeTab: 'details' | 'comments' | 'metrics'` (переименовать текущий `'info'`→`'details'`).

- **Details** — весь контент-блоки (см. ниже).
- **Comments** — текущий каркас (инпут, All/Private, счётчик). Бэкенд — вне этого слоя (F-13e).
- **Metrics** — рендерится **только при `is_owner`**. Если не владелец — таба нет в шапке.

### 1.2 Фото

- **Кнопка «Добавить в избранное» под фото** (вне галереи). Toggle через существующий `save_property` RPC; состояние из `saved_properties`. Иконка-закладка + лейбл. Доступна всем залогиненным.
- **Нет фото** → не показывать заглушку с иконкой. Вместо неё: блок высотой **в 3 раза меньше** обычного, серый фон, **по центру текст «No Photo»**, без иконки.
- **Слияние фото + Floor Plan в одну ленту.** `getPhotos` уже возвращает все `photo_type`. На планировании **проверить**: где лежат floor-plan (в `property_photos` с `photo_type='floor_plan'` → уже в ленте, нужно лишь упорядочить их после обычных; либо в `location_developers.media` → тянуть отдельно и доклеивать в конец массива фото).

### 1.3 Блоки таба Details

Порядок и формат:

**Блок Agent** — простой и аккуратный дизайн (горизонтальная карточка):

- фото агента (или плейсхолдер-инициалы),
- имя,
- название агентства,
- «Активных листингов: N» (данные — слой 2; до него строку скрыть),
- кнопка WhatsApp (логика контакт-метрики — слой 3; в слое 1 просто открывает `wa.me` с префилл-текстом).

**Блок Расположение:**

- Полный адрес = `location_full_path` (`Golf Promenade 4a › … › Damac Hills`).
- Ниже — адрес по бегунку (тот неполный, что видят коллеги). Данные — слой 2; до него строку скрыть.

**Блок Tech (характеристики)** — строго формат `Поле: Значение`:

- `Deal: Sale`
- `Type: Residential Apartment - Flat (hotel apartment)` — собрать из категория + unit_type + sub_type (+ `is_hotel_pool`).
- `Bedrooms: 2 + maid + vastu` — `bedrooms` (+`is_maid`→`maid`; +`is_vastu`→`vastu` из слоя 2).
- `Bathrooms: 1`
- `BUA: 2,250 sqft` — `area_sqft`.
- `Plot: 2,500 sqft` — `plot_sqft`; показывать только если задан.
- `Floor:` — для apartment: уровень (`floor_level_id`→Low/Mid/High); для house: `floors_in_unit` (напр. `G+1`).
- `Floors: 12` — только для apartment; для house **строку не показывать**. (На планировании уточнить, какое поле несёт «всего этажей в здании» vs «этажей в юните».)
- `Layout: TH-L` — `layout_id`→`community_layouts.name` (отображение; автокомплит ввода — слой 4, в форме).
- `Furnished: Yes`
- `Occupancy: Vacant on Transfer` — `occupancy_status` (+`lease_until` если есть).
- `Created:` / `Updated:` — `created_at` / `updated_at` (или `last_actualized_at`).

**Блок Project** (из `location_developers`, данные — слой 2; до него блок скрыть):

- `Name:` `project_name`
- `Cluster:` (из иерархии локации — `loc_cluster`/`sub_community`; уточнить источник на планировании)
- `Developer:` `developer_name_ref`
- `Completion:` `project_status`/`completion_status` (Off-Plan/Ready)
- `Handover:` `completion_q` + `completion_year` (`Q4 2029`)

**Блок Description** — `description`.

**Блок Additional:**

- `View:` `view_ids`→labels
- `Расположение:` `position_ids`→labels (back-to-back и т.п.)
- `Удобства:` `amenity_ids`→labels

### 1.4 Кнопки действий (владелец)

Три кнопки **вне блоков**, аккуратно **центрированы** (не в одном «уродливом» блоке как сейчас):

- Редактировать · Актуализировать · Архивировать.
  Показываются только при `is_owner`. Дизайн — отдельная центрированная строка под контентом.

### 1.5 Критерии готовности слоя 1

- Юнит-тесты: таб Metrics рендерится только при `is_owner`; no-photo показывает «No Photo» без иконки; кнопка избранного дёргает `save_property`; блоки слоёв 2–4 скрыты при отсутствии данных.
- `npm run checkFile` зелёный на изменённых файлах; `npm test` по компоненту зелёный.

---

## Слой 2 — Обогащение `get_property` (1 миграция)

Прод-сверка 2026-06-17: `properties.public_location_id` — колонка ЕСТЬ (FK `properties_public_location_id_fkey` на `locations`, пока NULL у всех). `is_vastu` — НЕТ. У всех 10 объектов `developer_id = NULL`. `location_developers` сейчас **переделывается в параллельном чате** — текущее состояние таблицы НЕ финальное.

Добавить в `get_property` (соблюдая лимит 100 аргументов — split `jsonb_build_object` + `||`, как уже сделано):

1. **`agent.active_listings_count`** — `COUNT(*)` по `properties` владельца, `status='active'`. Независимо от rework. ✅ готово к работе.
2. **`public_location_path`** — резолв пути по `properties.public_location_id` тем же `CONCAT_WS`-приёмом, что `location_full_path`, но через JOIN на `public_location_id`. Независимо от rework. ✅ готово.
3. **`is_vastu`** — `ALTER TABLE properties ADD COLUMN is_vastu boolean NOT NULL DEFAULT false` (поглощает WP-F). Применено: колонка ✅, `get_feed` возвращает поле ✅. **В ленте vastu НЕ показываем** (решение 2026-06-17 — лента: число beds сверху, `maid` серым снизу). Чекбокс «Vastu» в форме — **только для резидентных `apartment` и `house`** (не hotel_apartment, не коммерческие). В карточке «+ vastu» в строке Bedrooms — через `get_property` (M-2b).
4. **Project-блок** — `location_developers` по `location_id = property.location_id` (вернётся **ровно одна строка**; проект висит на leaf-локации). ⚠️ **ЗАВИСИТ от rework `location_developers`** — применять только после новой схемы. Каждая строка блока **скрывается, если её источник NULL**. Маппинг (уточнён 2026-06-17):
   - **Name** ← `project_group_name`. NULL → строку не показывать.
   - **Building / Cluster** — значение = `project_name`, подпись зависит от `is_building`:
     - `is_building = true` → `Building: {project_name}`
     - `is_building = false` → `Cluster: {project_name}`
     - `is_building = NULL` (ещё не обогащён) → `Project: {project_name}` (нейтрально)
     - `project_name` NULL → строку не показывать.
   - **Developer** ← `developer_name` (поле location_developers напрямую). NULL → не показывать.
   - **Completion** ← из `project_status`: `under_construction`/`planned` → `Off-Plan`; `completed` → `Ready`; NULL → не показывать.
   - **Handover**: если `project_status = 'completed'` → `built_year` (напр. «2021»); иначе (`under_construction`/`planned`) → `completion_q` + « » + `completion_year` (напр. «Q4 2029»); нужные поля NULL → не показывать.

Гейт: миграция (объяснить → «да» → применяет создатель в Studio). Обновить `database.md` после. Зависимость: п.4 — после rework `location_developers` (карта связей, правило В-3).

### Критерии: `get_property` возвращает новые поля; контракт остальных байт-в-байт не изменён; карточка показывает active-listings/slider-адрес/`+vastu` сразу, Project — после rework.

---

## Слой 3 — Метрика контакта (1 миграция)

Поведение: клик по кнопке WhatsApp в блоке Agent → открыть `wa.me` с префилл-текстом **и** записать метрику.

- **Текст префилла** (черновик, согласовать): `Hi, it's {моё_имя}, your colleague — found your property on the SQM platform and have some questions.` Пользователю в WhatsApp остаётся нажать «Отправить».
- **Момент записи:** на клик по кнопке (фактический «Отправить» внутри WhatsApp недоступен веб-приложению — это единственная точка).
- **Дедуп:** по `(property_id, viewer_user_id)` — один юзер = 1, сколько бы раз ни кликал. Метрика привязана **к объекту**, не к автору.
- **Схема:** таблица `property_contact_views(property_id, viewer_id, created_at, PK(property_id, viewer_id))` + RPC `record_property_contact(p_property_id)` → `INSERT … ON CONFLICT DO NOTHING`, затем синхронизировать `properties.contacts_count`. RLS: автор объекта видит счётчик; писать может любой залогиненный.
- **Отображение:** «Ваш контакт просмотрено: N» = `contacts_count`, в **Metrics-табе** (владелец).

Гейт: одна миграция. Обновить `database.md`.

### Критерии: повторные клики одного юзера не растят счётчик; счётчик растёт на уникального; строка видна владельцу.

---

## Слой 4 — Layouts (миграция + кросс-репо)

Переиспользуем `community_layouts`. В основном это работа в **форме** добавления/редактирования (карточка лишь отображает `Layout: TH-L`).

- **Автокомплит** в форме: RPC `search_layouts(p_location_id, p_query)` — поиск доступных layouts по локации. **Fuzzy/нормализация**: `lower()` + срез не-алфанумерики, чтобы `thl` находил `TH-L`.
- **Создание:** если нет совпадения — кнопка «Создать» → RPC `create_layout(p_location_id, p_name)` → `INSERT community_layouts(location_id, name, source='user', is_active=…)`. Создаётся для всех.
- **Привязка к проекту:** при необходимости точнее, чем комьюнити — добавить в `community_layouts` ссылку на девелопера/проект (`developer_id`/`location_developer_id`). Решить на планировании этого слоя.
- **Модерация:** созданные пользователями layouts проверяет модератор — **отдельная задача в репо Control** (таб Модерации). В этом репо — только пометить `source='user'`/`is_active=false` до проверки и передать задачу. Кросс-репо, вне кода superapp.

Гейт: миграция(и) + кросс-репо задача.

### Критерии: ввод `thl` находит `TH-L`; создание пишет в `community_layouts`; задача модерации заведена в Control.

---

## Карта зависимостей (что на чём стоит)

```
Слой 1 (фронт) ─ база, ничего не ждёт
  ├── Слой 2 (get_property) → разблокирует: Project-блок, slider-адрес, active-listings, +vastu
  ├── Слой 3 (контакт-метрика) → независим (нужен лишь блок Agent из слоя 1)
  └── Слой 4 (layouts) → независим (форма; карточка лишь отображает layout)
```

Порядок реализации: **1 → 2 → 3 → 4** (каждый слой = отдельный деплой; слои 2–4 — каждый с отдельным «да» на миграцию).

## Вне объёма

- Бэкенд комментариев (`is_private`, RLS, RPC) — отдельная задача F-13c/F-13e.
- Реализация таба Модерации в Control — отдельный репо.
- Реальная проверка подписи Telegram (M-9).

## Открытые пункты на проверку при планировании

1. ~~Где лежат floor-plan фото~~ — РЕШЕНО (слой 1, Task 7): `property_photos` сейчас только `photo_type='gallery'` (floor-plan-строк нет), `getPhotos` уже мержит все типы → property-floor-plan подтянутся сами. `location_developers.media` = маркетинговые фото проекта (`photos`/`cover_photo`/`cover_video`), отдельного floor-plan нет → сюрфейс project-медиа = слой 2.
2. Наличие колонки `properties.public_location_id` на проде (для slider-адреса).
3. Какое поле несёт «всего этажей в здании» vs «этажей в юните» (`floors_in_unit` vs прочее) и логика Floor/Floors apartment↔house.
4. Источник `Cluster` для Project-блока (иерархия локации vs `location_developers`).
5. Текущий FK-таргет `properties.layout_id` (подтвердить, что `community_layouts`).
