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

**RPC:** `get_feed({ p_deal_type, … })` — ⚠️ сейчас на **mock** (`feed.mock.ts`),
реальный вызов не подключён: `get_feed` требует город/авторизацию (см. API-1 в TODO).

Главная страница. Центрированный фрейм со списком объектов — переиспользует
task-box стили Super Productivity (тени/токены/радиусы task-list инбокса).

### Реализовано (на mock)

- Карточка объекта — **одна строка, без фото**, 6 колонок (CSS grid):
  1. Адрес (leaf-локация + community ниже), 2. Тип, 3. Beds (Studio/N BR),
  2. Площадь (sqft), 5. Цена + валюта/период, 6. бейдж Pocket/Official + «Срочно».
- Sticky-шапка таблицы с заголовками колонок.
- Переключатель **Sale / Rent** — **в верхнем хедере** (не на странице), виден
  только на роуте ленты, рядом с «+».
- Иконка **фильтров** (`tune`) справа в хедере с бейджем кол-ва активных → открывает
  sidebar фильтров (см. ниже).
- Пагинация: `p_limit=20`, `p_offset`, кнопка «Загрузить ещё».
- Подсказка «ещё N объектов на Pro» (на mock; в реале — `count_nearby`, см. API-3).

### Состояние сервиса

- `FeedFilterService` — глобальный сигнал: `dealType` + `filters` + `activeFilterCount`.
- Клик по карточке → `PanelContentService.openProperty()` → нативная правая панель SP.

### Не сделано

- Реальный `get_feed`, бейдж сети `is_network`, district-автокомплит.
- _Бейджи агентов (`owner_badge_level`) — НЕ в MVP._

---

## Sidebar фильтров — правая панель (тип `FILTERS`)

Открывается иконкой `tune` в хедере. Стиль = модалка task-detail инбокса
(`feed-filter-panel.component`). Поля (на mock): тип объекта, спальни (чипы),
цена от/до, листинг (Все/Official/Pocket), «только срочные». Кнопки «Сбросить» /
«Применить». TODO: district через `search_locations`, беды как массив (API-2).

---

## Карточка объекта — правая панель (тип `PROPERTY`)

**RPC:** `get_property({ p_property_id })` — ⚠️ сейчас показывает данные из ленты
(mock), дозагрузка через `get_property` не подключена.

Открывается по клику из ленты в **нативной правой панели** Super Productivity
(`PanelContentService` + `slideInFromRight`). Стиль совпадает с task-detail инбокса.

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

**RPC:** `publish_property()`

Форма создания нового листинга.

### Поля формы (MVP)

- `deal_type`: sale | rent (переключатель)
- `listing_type`: official | pocket (radio)
- `price` + `price_currency` (AED по умолчанию) + `price_period` (для rent)
- `bedrooms`, `bathrooms`, `area_sqft`
- `location_id` — автокомплит (`search_locations`)
- `description` — textarea
- `furnished`: yes | no
- `handover`: ready | offplan
- `visibility`: public | network
- Фото — upload (1–3 в MVP, до 10 в MVP-2)

### Ограничения

- Pocket listing — только для Pro-пользователей
- Official listing — для всех

---

## Профиль агента — `/profile`

**RPC:** `get_agent_listings(p_agent_id)`

### Собственный профиль

- Фото (из `user_settings.photo_url`)
- Имя, агентство, эмират
- _Бейдж / баллы / прогресс — НЕ в MVP_
- Реферальная ссылка + кнопка «Копировать»
- Настройки: языки (`user_settings.languages`), зоны обслуживания (`service_areas`)
- Мои объекты — список (`get_agent_listings`)
- Переключатель языка интерфейса: RU / EN / AR

### Чужой профиль (`/agent/:id`)

- Фото, имя, агентство
- О себе, языки, зоны
- Объекты агента
- Кнопки: «Добавить в сеть», «Написать» (Pro)

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
