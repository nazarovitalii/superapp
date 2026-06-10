# Экраны / разделы UI — MrSQM (superapp)

CRM-платформа для риелторов Dubai. Дизайн — Super Productivity (CSS переменные,
тёмная/светлая тема, боковая навигация, модальные окна справа при клике, Angular Material).

---

## Login — `/login`
- Форма входа: email + пароль
- Supabase Auth → проверка в таблице `users` (is_active = true)
- При успехе: редирект на `/`; при ошибке: inline-сообщение
- Доступ: публичный

---

## Лента объектов — `/` (главная)
**RPC:** `get_feed({ p_deal_type })`

Главная страница. Список карточек объектов.

### UI компоненты
- Переключатель **Sale / Rent** вверху
- Фильтры: район (автокомплит `search_locations`), тип объекта, кол-во комнат
- Фильтры MVP-2: цена мин/макс
- Сортировка: по умолчанию (дата), price_asc, price_desc, date_desc
- Пагинация: p_limit=20, p_offset, кнопка «Загрузить ещё»
- Бейдж сети: иконка если `is_network = true`
- _Бейджи агентов (`owner_badge_level`) — НЕ в MVP_
- Счётчик скрытых: «ещё N объектов на Pro»

### Карточка объекта в ленте
- Главное фото
- Цена + валюта
- Тип + количество комнат + площадь sqft
- Район (`location_name`)
- Имя агента
- Дата публикации
- Иконки: Pocket / Official listing type

### Клик → модальное окно карточки (правая панель)

---

## Карточка объекта — модальное окно справа
**RPC:** `get_property({ p_property_id })`

Открывается по клику из ленты. Анимация справа (стиль Super Productivity task-detail).
URL-параметр `?property=<uuid>` — можно поделиться ссылкой.

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

## Избранное — `/saved`
**RPC:** `get_saved_properties()`

- Список сохранённых объектов
- Карточки как в ленте + дата сохранения
- Кнопка «Убрать из избранного» (toggle)
- Пагинация

---

## AI Чат — `/chat`
**Заглушка MVP**

- Интерфейс как в Telegram (сообщения слева/справа)
- Поле ввода внизу, кнопка отправки
- Приветственное сообщение-заглушка
- Будет подключён к mrsqm-ai-chat (`https://ai.mrsqm.com`)

---

## Уведомления — `/notifications`
*(план после MVP)*

- Лента событий из `user_events`
- Новые объекты по сохранённым фильтрам
- Реферальные бонусы

---

## Компоненты Layout

### Sidebar
Навигационные пункты (стиль Super Productivity left sidebar):

| Иконка | Название | Маршрут |
|---|---|---|
| Home | Лента | `/` |
| Plus | Добавить объект | `/add` |
| Heart | Избранное | `/saved` |
| Users | Сеть | `/network` |
| User | Профиль | `/profile` |
| MessageSquare | AI Чат | `/chat` |

- Сворачивается в режим иконок
- Показывает аватар + имя + план (Free/Pro)
- Кнопка «Выйти» — внизу

### Header
- Заголовок текущего раздела
- Кнопка переключения темы (светлая/тёмная)
- Фиксированный

### Toast
- Уведомления success / error / info / warning
- Появляются снизу справа, исчезают через 4 сек

### PropertyModal
- Анимация появления справа (slide-in, как task-detail в Super Productivity)
- Закрывается по крестику, по клику вне, по Escape
- Ширина ~480px (desktop), полный экран (mobile)

---

## Адаптивность

| Ширина | Поведение |
|---|---|
| > 1024px | Sidebar 220px + контент |
| 768–1024px | Sidebar 56px (иконки) + контент |
| < 768px | Sidebar как drawer (overlay), контент полная ширина |

---

## PWA & Telegram Mini App

- `manifest.json` — название MrSQM, иконки, `display: standalone`
- Service Worker — кэш статики
- `telegram-web-app.js` SDK
- `TgWebApp.ready()` при монтировании App
