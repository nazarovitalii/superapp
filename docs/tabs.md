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

**Тулбар ленты** (Bayut-style, одна строка над таблицей на всю её ширину; контейнер
расширен 800→960px; глобальный хедер чистый). Слева направо:

1. **Охват** — пилюля-селект «All Inventory · 1 154» (All Inventory / Friends Inventory /
   My Inventory / Favourites; WP-D, значения scope `public/friends/my/favourites` не изменились).
   При non-All Inventory — бордюр primary. Счётчик: All Inventory — серверный `count_total`
   (public+network), остальные — клиентский. ⚠️ Охват фильтруется **на клиенте** (owner_id / is_network / visibility) —
   серверного параметра нет (TODO API-9).
2. **Автокомплит «Адрес или агент»** — крупное поле:
   - **Адрес** → `search_locations` (p_mode=search) → выбор пишет `locationFilter{id,name}`
     → `p_location_ids=[id]` (реальный серверный фильтр). Выбранный адрес — чип с крестиком.
   - **Агент** (ФИО) → distinct `owner_full_name` из загруженных строк → `agentQuery` →
     **клиентский** фильтр `visibleProperties` (интерим; серверного поиска агента нет).
3. **Сегмент** — селект All Segments / Ready / Off-Plan → `p_handover` (null=all).
4. **Сделка** — селект Sale / Rent → `p_deal_type`. «Sale + Rent» (обе) — отложено
   (get_feed требует один deal_type).
5. **Тип объекта** — крупный **мега-дропдаун** Residential / Commercial (matMenu,
   широкая панель 2 колонки): категория → unit_types → подтипы чипами. Дерево из
   `get_filter_options` (parent_id). Маппинг `p_category_id`/`p_unit_type_id`/`p_sub_type_ids`.
   Состояние общее с sidebar-фильтрами. Футер: Сбросить / Готово.
6. **Сортировка** (`swap_vert`): новые/дорогие/дешёвые/давние → `p_sort_by`.
7. **Фильтры** (`tune`) → при ≥1 активном — primary-чип «tune N».

**Глобальный хедер на ленте:** лупа-поиск (разворачивается в инпут на всю строку,
поиск по описанию `p_description`), «+», профиль. При выборе строк (чекбокс) —
вместо лупы «Выбрано: N» + сброс. Убраны: Today-плашка, Play, Focus, Sync, Notes, провайдеры.

### Состояние сервисов

- `FeedFilterService` — `dealType` + `filters` (FeedFilters) + `sortBy` + `scope` +
  `handover`/`category` + `locationFilter` (адрес→p_location_ids) + `agentQuery` (клиент) +
  `searchQuery` (лупа хедера→p_description) + `activeFilterCount`.
- `FeedSelectionService` — Set выбранных id, `count`, `toggle`, `clear`.
- Клик по карточке → `PanelContentService.openProperty()` → нативная правая панель SP.

### Не сделано

- Поиск агента — серверный (сейчас клиентский по загруженной странице); нужен параметр
  в get_feed.
- «Sale + Rent» (обе сделки разом) — нужен nullable `p_deal_type` в get_feed.
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

**Данные (3 запроса параллельно при открытии):** `get_property({ p_property_id })`
(вся карточка + вложенный `agent{}`), `select` из `property_photos` (фото, сорт
`order_index`), `get_filter_options` (резолв id-массивов → названия). При отказе
доступа (`get_property` вернул `{error}`) — фолбэк на данные из ленты.

Открывается по клику из ленты в **нативной правой панели** Super Productivity
(`PanelContentService` + `slideInFromRight`). Стиль совпадает с task-detail инбокса:
шапка как в фильтрах (стрелка сворачивания + заголовок «Объект», фото под шапкой),
цена — заголовок с нижней линией primary, секции — карточки `--task-detail-bg` /
`--task-detail-shadow`.

### Табы (WP-G слой 1)

Три таба: **Details** · **Comments** · **Metrics**. Таб **Metrics виден только владельцу**
объекта (`is_owner`). Активный таб сбрасывается на Details при смене объекта в панели.
Лейблы табов — англ. (Details/Comments/Metrics).

- **Metrics** (владелец): «метрика: значение» — Показы (`impressions_count`), Просмотры
  (`views_count`), Уникальные (`unique_views_count`), Комментарии (`comments_count`),
  акцентом «Ваш контакт просмотрено» (`contacts_count`; реальная запись/дедуп — слой 3).
- **Comments** — каркас (инпут, переключатель All/Private, счётчик); бэкенд — F-13e.

### Содержимое таба Details (пустые блоки скрываются)

- **Галерея** — реальные фото из `property_photos` (`full_url`), листание + счётчик;
  стрелки prev/next поверх фото (hover-затемнение); клик → **fullscreen лайтбокс Swiper.js**
  (MIT v12; основной слайдер + полоса миниатюр снизу; клавиатура Escape/стрелки).
  Лайтбокс рендерится через нативный `<dialog>` + `showModal()` (**top layer** браузера) —
  иначе `position:fixed` запирался внутри right-panel (`will-change: transform`) и лента
  наезжала поверх галереи. Галерея уже включает все `photo_type` в одну ленту (floor-plan
  при появлении подтянутся автоматически; project-медиа из `location_developers.media` — слой 2)
- **Нет фото** — серый блок ~1/3 высоты с текстом «No Photo» (без иконки)
- **Кнопка «Добавить в избранное»** — под фото (toggle `save_property`, иконка `bookmark`)
- **Цена** — крупно; `previous_price > price` → старая зачёркнута + чип «Снижение».
  Чипы: Продажа/Аренда · Срочно · Торг (`is_negotiable`) · Комиссия включена
- **Tech (характеристики)** — формат «Поле: Значение»: Deal · Type (категория+тип+подтип
  +«hotel apartment») · Bedrooms (+maid) · Bathrooms · BUA (`area_sqft`) · Plot (`plot_sqft`) ·
  Floor (`floor_level_id`) · Floors (`floors_in_unit`) · Furnished · Handover · Completion ·
  Occupancy (+`lease_until`) · Created · Updated. (Layout-имя и «+vastu» — слой 2)
- **Особенности** — views/positions/amenities (id → названия через `get_filter_options`)
- **Локация** — полный путь `location_full_path`
- **Девелопер** — логотип (`developer_logo_url`) + название
- **Документы** (только official) — Title Deed, plot, municipality
- **Описание**
- **Агент** (из вложенного `agent{}`) — фото, имя, агентство, эмират, языки, «о себе»;
  **WhatsApp** + **Telegram** только если контакт != null (Pro или в сети), иначе
  заглушка «Доступно на Pro»
- **Статистика** — «Обновлено N дней назад» + `views_count`
- **Управление своим объектом** (только при `is_owner`): три кнопки **вне блоков, центрированы
  внизу** карточки — **Редактировать** (цена+описание, inline-форма → `update_property`),
  **Актуализировать** (`actualize_property`), **Архивировать** (Продан/Снят → `archive_property`).
  3 SECURITY DEFINER RPC, миграция `applied/2026-06-16-property-owner-actions.sql`
- Клик по фото → **полноэкранный лайтбокс Swiper.js** (миниатюры + стрелки)
- Бейдж агента **не показывается** (вне MVP)
- `track_view(p_property_id)` — fire and forget при открытии

---

## Добавить объект — `/add`

**Создание:** прямой `INSERT в properties` под RLS `properties_insert (owner_id=auth.uid())`.
RPC `publish_property` **не существует**. Справочники — `get_filter_options`,
локация — `search_locations`. Реализовано (8 шагов, без фото — P-5b).

**Статус при создании (продуктовое правило, в БД модерации нет):**
`visibility=network` → `status='active'` (сразу в ленте у сети);
`visibility=public` → `status='pending_review'` (на модерацию).

**UI:** визард с **8 шагами** (нумерованные точки сверху). Каждый шаг — один крупный
блок в стиле task-detail-panel с иконкой, заголовком (17px) и «Шаг N/8» справа.
Поля и чипы на шаге — 15px. Навигация: Назад / Далее / Опубликовать.

### Поля формы (8 шагов, реализовано 2026-06-15)

1. **Категория** — category → unit_type → sub_type (uuid из `get_filter_options`; подтип только для apartment/house)
2. **Сделка** — sale|rent (+ price_period для rent)
3. **Адрес** — каскад до leaf: `search_locations` (mode=search) → выбор → `search_locations` (mode=info) отдаёт children. Внутри комьюнити (children>10) «Уточните адрес» — **глобальный поиск по всем нижним уровням** (sub_community/cluster/building), отфильтрованный по `community_name` (не только прямые дети). Выше комьюнити (город→комьюнити) — фильтр прямых children: поиск если >10, чипы если ≤10. leaf = children пуст. Building info из `location_developers`. Бегунок приватности адреса F-12b (`public_location_id`, минимум — комьюнити)
4. **Параметры** — набор полей зависит от unit_type (`property-type-fields.ts`): beds/baths, чекбоксы `is_maid`/`is_hotel_pool`, BUA `area_sqft`, `plot_sqft`, `floor_level_id` (Low/Mid/High), `floors_in_unit` (G+…), `layout_id` (community_layouts), мультиселекты `view_ids`/`position_ids`/`amenity_ids`, `furnished`. (Поле «номер этажа» убрано — оставлен только уровень этажа)
5. **Цена** — price (AED) + торг
6. **Состояние** — handover; off-plan → completion_year/q (+developer_id из leaf); ready → occupancy; occupied → `lease_until` (месяц+год); distress
7. **Листинг** — listing_type, visibility. Документы (Title Deed №/год, plot/municipality number) + заметка Form A — **только для official**; для pocket-листинга документы не нужны
8. **Описание** — текст + загрузка фото (нарезка в браузере → Storage `property_photos`, P-5b)

**Расхождение таксономии:** в живой БД `hotel_apartment` — коммерческий unit_type
(в CSV-матрице он был подтипом Apartment); «Residential Land» в БД = `land`.
Подтипы Apartment уже без Hotel Apartment.

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
- **Только на ленте:** лупа-поиск и меню выбора строк (все переключатели/фильтры — в тулбаре самой ленты).
- Кнопка «+» (добавить задачу/объект).
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

- `manifest.json` — иконки, `display: standalone` (название пока «Super Productivity»/«sup» —
  перебрендировать под MrSQM, см. TODO)
- Service Worker **отключён** в прод-вебе (`productionWeb serviceWorker: false`): ngsw намертво
  кэшировал ассеты/фото и не пускал обновления (инцидент 2026-06-17). Установка на рабочий стол
  не пострадала — она на manifest+apple-touch-icon, SW не требуется. Self-unregister: safety-worker
  по пути `/ngsw-worker.js` чистит уже застрявшие браузеры. Вернуть минимальный SW только если
  понадобится веб-пуш (iOS 16.4+)
- `telegram-web-app.js` SDK
- `TgWebApp.ready()` при монтировании App
