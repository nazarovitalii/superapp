# Экраны / разделы UI — MrSQM (superapp)

CRM-платформа для риелторов Dubai. Дизайн — Super Productivity (CSS переменные,
тёмная/светлая тема, боковая навигация, модальные окна справа при клике, Angular Material).

---

## Login — `/login`

- Форма входа: email + пароль (`login-page.component`, стиль модалки SP).
- Supabase Auth (`signInWithPassword`) → SELECT из `users` по `auth.uid()` с
  `is_active = true` (через RLS `users_select_own`). Нет/деактивирован →
  принудительный `signOut` + inline-ошибка.
- При успехе: редирект на `/mrsqm/feed`.
- Доступ: публичный. Все `mrsqm/*` закрыты `mrsqmAuthGuard` (ждёт восстановления
  сессии при F5, иначе → `/login`).
- Выход: пункт «Выйти» в боковой навигации (`MrsqmAuthService.signOut` → `/login`).

---

## Лента объектов — `/mrsqm/feed` (главная)

**RPC:** `get_feed({ p_deal_type, p_limit, p_offset, фильтры })` — **подключён** (реальные данные).
Город берётся из `user_context` автоматически (auth.uid из JWT). Ответ
`{ results, count_total, limit, offset }`. Моки удалены.

Главная страница. Центрированный фрейм со списком объектов — переиспользует
task-box стили Super Productivity (тени/токены/радиусы task-list инбокса).

### Реализовано

**Строка (8 колонок, CSS grid):**

1. Чекбокс (`done-toggle`) — множественный выбор через `FeedSelectionService`
2. Адрес: leaf-локация + community (`community_name` из get_feed)
3. Тип (резолв `unit_type_id`/`sub_type_id` → label из `get_filter_options`)
4. Beds
5. Площадь (sqft)
6. Цена (без валюты; для аренды — `/период`)
7. 📷 (фотоаппарат, если у листинга есть фото)
8. Агентство: имя агентства + дата `last_actualized_at || published_at`

Бейджей Pocket/Official и «Срочно» в строке нет.

- **Активная строка** (открыта карточка) — как выбранная задача в инбоксе: без
  смены цвета, тень `--task-selected-shadow` + box продлевается вправо до sidebar
  (те же брейкпоинты и CSS, что `.isSelected` в `_task-base.scss`).
- **Hover-кнопки справа** (как task-hover-controls в инбоксе): при наведении
  выезжают «закладка» и «открыть карточку» (`right_panel_open`). Только на pointer-устройствах.
- **Типографика строки:** все тексты 14px, один цвет (`--text-color`), без жирности/курсива.
- **Избранное** — иконка `bookmark` в hover-кнопках, toggle `save_property`, состояние
  из `saved_properties`. Отдельного экрана нет.
- Sticky-шапка таблицы. Пагинация: `p_limit=20`, «Загрузить ещё».
- Пустой результат → empty-state; ошибка RPC → error-state.

**Хедер ленты:**

- Переключатель **Sale / Rent**
- Пилюля-меню **Охват**: Все / Мои объекты / Объекты сети / Public.
  ⚠️ Фильтруется **на клиенте** (owner_id / is_network / visibility) — в get_feed
  нет серверного параметра охвата (см. TODO API-9).
- Меню **сортировки** (иконка `swap_vert`): Сначала новые (`default`) / дорогие
  (`price_desc`) / дешёвые (`price_asc`) / давние (`date_asc`) → `p_sort_by`.
- Иконка **фильтров** `tune` → при ≥1 активном фильтре превращается в primary-чип «tune N».
- При выборе строк (чекбокс) — вместо Sale/Rent в хедере появляется «Выбрано: N» + сброс.
- Убраны: Today-плашка с точками, Play, Focus Mode, Sync, кнопка провайдеров.

### Состояние сервисов

- `FeedFilterService` — `dealType` + `filters` (FeedFilters) + `sortBy` + `scope` + `activeFilterCount`.
- `FeedSelectionService` — Set выбранных id, `count`, `toggle`, `clear`.
- Клик по карточке → `PanelContentService.openProperty()` → нативная правая панель SP.

### Не сделано

- District-автокомплит (`search_locations`) — API-2.
- Серверный фильтр охвата (`p_scope` в get_feed) — API-9.
- _Бейджи агентов (`owner_badge_level`) — НЕ в MVP._

---

## Sidebar фильтров — правая панель (тип `FILTERS`)

Открывается иконкой `tune` в хедере. Стиль = модалка task-detail инбокса
(`feed-filter-panel.component`): каждая группа — карточка `--task-detail-bg` /
`--task-detail-shadow` с иконкой и названием (14px), как input-item строки модалки.

Поля — 1:1 с параметрами `get_feed` (обновлено 2026-06-12):

- Тип недвижимости: все `unit_types` из `get_filter_options` → `p_unit_type_id`
- Спальни и санузлы: **мультиселект** (чипы) → `p_bedrooms[]` / `p_bathrooms[]`
- Цена AED: диапазон мин/макс, разделители-запятые, суффикс AED в поле → `p_price_min/max`
- Площадь sqft: диапазон мин/макс → `p_area_sqft_min/max`
- Мебель: чипы (furnished / unfurnished) → `p_furnished`
- Готовность: чипы (Ready / Off-plan) → `p_handover`
- Листинг: чипы (Все / Official / Pocket) → `p_listing_type`

«Только срочные» удалён (нет в API). Все тексты 14px, uniform. Кнопки «Сбросить» / «Применить».
TODO: district через `search_locations` (API-2).

---

## Карточка объекта — правая панель (тип `PROPERTY`)

**RPC:** `get_property({ p_property_id })` — ⚠️ сейчас показывает данные из ленты
(mock), дозагрузка через `get_property` не подключена.

Открывается по клику из ленты в **нативной правой панели** Super Productivity
(`PanelContentService` + `slideInFromRight`). Стиль совпадает с task-detail инбокса:
шапка как в фильтрах (стрелка сворачивания + заголовок «Объект», фото под шапкой),
цена — заголовок с нижней линией primary, секции (расположение/описание/агент) —
карточки `--task-detail-bg` / `--task-detail-shadow`.

### Содержимое

- Галерея фото
- Цена + deal_type + price_period (для аренды)
- Тип: listing_type (Official / Pocket)
- Параметры: bedrooms, bathrooms, area_sqft, furnished, handover, occupancy_status
- Локация: полный путь `location_full_path`
- Описание
- Данные агента: фото, имя, агентство, языки
- **WhatsApp кнопка** — только если `agent.whatsapp_phone != null` (Pro или в сети)
- Если Free и не в сети → заглушка «Доступно на Pro»
- Кнопка **Сохранить в избранное** (toggle, `save_property`)
- `track_view(p_property_id)` — fire and forget при открытии

---

## Добавить объект — `/add`

**Создание:** прямой `INSERT в properties` под RLS `properties_insert (owner_id=auth.uid())`.
RPC `publish_property` **не существует**. Справочники — `get_filter_options`,
локация — `search_locations`. Реализовано (5 шагов, без фото — P-5b).

**Статус при создании (продуктовое правило, в БД модерации нет):**
`visibility=network` → `status='active'` (сразу в ленте у сети);
`visibility=public` → `status='pending_review'` (на модерацию).

**UI:** визард с **5 шагами** (нумерованные точки сверху). Каждый шаг — один крупный
блок в стиле task-detail-panel с иконкой, заголовком (17px) и «Шаг N/5» справа.
Поля и чипы на шаге — 15px. Навигация: Назад / Далее / Опубликовать.

### Поля формы (реализовано)

- Шаг 1 — категория / тип / подтип (uuid из `get_filter_options`) + сделка sale|rent
- Шаг 2 — локация (автокомплит `search_locations` → `location_id` uuid)
- Шаг 3 — bedrooms/bathrooms (int), area_sqft (+авто area_sqm),
  furnished (`furnished`/`unfurnished`), handover, occupancy_status
- Шаг 4 — price (+ period для rent), торг, срочность, описание, visibility
- Шаг 5 — listing_type (pocket|official)
- **Фото — НЕ реализовано** (нужен Storage-bucket `property_photos` + RLS — P-5b)

### Значения enum (сверено с CHECK)

- `furnished`: **furnished | unfurnished** (НЕ yes/no)
- `occupancy_status`: vacant | occupied | vacant_on_transfer

### Ограничения

- Pocket listing — только для Pro-пользователей
- Official listing — для всех

---

## Профиль агента — `/profile`

**Реализовано** (на чтение). Данные из `user_context` (денормализованный профиль) +
`users` (контакты). Мои объекты — прямой запрос к `properties` под RLS (НЕ
`get_agent_listings`: та отдаёт только `active`, а владельцу нужны draft/pending).

**3 вкладки:**

- **Обзор:** контакты (email/phone/whatsapp+verified/telegram), агентство
  (название/эмират/команда), лицензия+срок, план/подписка+срок, реф-код+копировать.
- **Объекты:** мои объекты со статусом (Активен/На модерации/Черновик…), типом, ценой.
- **Активность:** статистика (объекты/сеть/рефералы/фильтры/поиски), даты регистрации/
  активности, канал.

_Бейдж / баллы / score — НЕ показываем (вне MVP)._

**Не реализовано:** правка контактов (на `users` нет self-UPDATE RLS — только
`admins_update`, см. API-8), фото (`user_settings` пуст), переключатель языка, чужой
профиль `/agent/:id` (после MVP).

---

## Сеть коллег — `/network`

**RPC:** `user_network`, `friendships`

- Список агентов в сети (друзья + коллеги)
- Для каждого: фото, имя, агентство, количество активных объектов
- Кнопка «Добавить агента» — поиск по имени/лицензии
- Добавление → запись в `friendships`

---

## Избранное — В ЛЕНТЕ (не отдельный экран)

**RPC:** `save_property()` (toggle), `saved_properties` (чтение состояния)

Решение (2026-06-11): отдельного экрана `/saved` НЕТ. Избранное — иконка-закладка
(`bookmark`/`bookmark_border`) прямо на карточке объекта в ленте. Клик → toggle
через `save_property`, состояние из прямого чтения `saved_properties` (Set id).
Оптимистичное обновление с откатом при ошибке.

> RPC `get_saved_properties()` существует в БД (на будущее — если понадобится
> отдельный список), но в MVP не используется.

---

## AI Чат — `/chat`

**Заглушка MVP**

- Интерфейс как в Telegram (сообщения слева/справа)
- Поле ввода внизу, кнопка отправки
- Приветственное сообщение-заглушка
- Будет подключён к mrsqm-ai-chat (`https://ai.mrsqm.com`)

---

## Уведомления — `/notifications`

_(план после MVP)_

- Лента событий из `user_events`
- Новые объекты по сохранённым фильтрам
- Реферальные бонусы

---

## Компоненты Layout

### Sidebar

Навигационные пункты (стиль Super Productivity left sidebar):

Реализовано через нативный `magic-side-nav` Super Productivity (6 CRM-пунктов
сверху, ниже — разделитель и рабочие пункты SP). Projects/Tags-деревья убраны.

| Иконка    | Название        | Маршрут          |
| --------- | --------------- | ---------------- |
| apartment | Лента           | `/mrsqm/feed`    |
| add_home  | Добавить объект | `/mrsqm/add`     |
| group     | Сеть            | `/mrsqm/network` |
| smart_toy | AI Чат          | `/mrsqm/chat`    |
| person    | Профиль         | `/mrsqm/profile` |

- `/add` и `/profile` — реализованы; `/network`, `/chat` — пока **stub-страницы**
  (`stub-page.component`). Экрана `/saved` нет — избранное в ленте (закладка).
- Сворачивается в режим иконок (поведение SP).

### Header (`main-header`)

- Заголовок текущего раздела (`page-title`).
- **Только на ленте:** тогл Sale/Rent + иконка фильтров `tune` (с бейджем).
- Кнопка «+» (добавить задачу/объект), sync-иконка — наследие SP.
- Фиксированный.

### Toast

- Уведомления success / error / info / warning
- Появляются снизу справа, исчезают через 4 сек

### PropertyModal

- Анимация появления справа (slide-in, как task-detail в Super Productivity)
- Закрывается по крестику, по клику вне, по Escape
- Ширина ~480px (desktop), полный экран (mobile)

---

## Адаптивность

| Ширина     | Поведение                                           |
| ---------- | --------------------------------------------------- |
| > 1024px   | Sidebar 220px + контент                             |
| 768–1024px | Sidebar 56px (иконки) + контент                     |
| < 768px    | Sidebar как drawer (overlay), контент полная ширина |

---

## PWA & Telegram Mini App

- `manifest.json` — название MrSQM, иконки, `display: standalone`
- Service Worker — кэш статики
- `telegram-web-app.js` SDK
- `TgWebApp.ready()` при монтировании App
