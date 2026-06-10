# Архитектурные решения — MrSQM (superapp)

Документирует стратегические решения, не очевидные из кода.

---

## Продукт

**MrSQM** — B2B платформа обмена объектами недвижимости для дубайских риелторов.

**Базовый стек:** Angular + Electron + Capacitor (Super Productivity)  
**Инфраструктура:** Coolify + Supabase self-hosted + N8N self-hosted  
**Каналы:** Telegram WebApp + WhatsApp (внешний браузер)

---

## Стратегическое решение: Super Productivity как база

**Решение:** MrSQM строится поверх Super Productivity. Полностью сохраняется дизайн-система
(8px-сетка, Material Design 3, Angular Material, тёмная/светлая тема, анимации, UX-паттерны).

**Почему:** Super Productivity — зрелая Angular-архитектура с проработанной системой состояний
(NgRx), дизайном и UX. Это ускоряет разработку vs создание с нуля.

**Что меняется:** функциональные модули (задачи, таймтрекинг) заменяются риелторскими
модулями (лента объектов, карточки, сеть агентов). Стили, темы, компоненты — остаются.

**Что НЕ трогаем:** `src/app/ui/`, Angular Material тема, `styles.scss`, токены дизайн-системы.

---

## Дизайн-система

**База:** Super Productivity CSS-переменные + Angular Material MD3.

**Тёмная тема:** `[data-theme='dark']` / Angular Material `dark-theme` класс.
Переключатель в Header. Выбор пользователя сохраняется.

**Ключевые токены:**
- `--bg`, `--bg-card`, `--bg-hover` — поверхности
- `--text`, `--text-muted`, `--text-disabled` — типографика
- `--accent`, `--accent-hover` — акцентный цвет
- `--border`, `--border-muted` — границы
- `--shadow-xs` … `--shadow-xl` — 5 уровней теней
- `--s` … `--s9` — 8px-сетка отступов
- `--radius-xs` … `--radius-pill` — скругления

---

## Auth-модель

**Решение:** Supabase Auth + таблица `users`. При входе: Supabase Auth сессия → SELECT из `users`
по `email` с `is_active = true`. Если записи нет — принудительный `signOut` + ошибка клиенту.

**Роли:** `agent` / `admin` / `moderator` / `superadmin` (поле `users.role`).

**Почему anon key:** `supabaseAnonKey` (из `environment.ts`) виден в бандле — это нормально для SPA.
Вся защита данных — через RLS на стороне БД. Service key обходит RLS и никогда не кладётся
в браузер.

---

## Архитектура компонентов

### Роутинг
Angular Router. `AuthGuard` → редирект на `/login` если нет сессии.

### Лента объектов
Главная страница вместо Dashboard Super Productivity.
Используются карточки в стиле SP task-list. Пагинация: `p_limit=20`, бесконечный скролл или
кнопка «Загрузить ещё».

### PropertyModal
Модальное окно справа — в стиле `task-detail` из Super Productivity.
Состояние хранится в URL-параметре `?property=<uuid>` — для шеринга ссылок.
Закрывается по крестику / клику вне / Escape. На мобайле — полный экран.

### Toast
Уведомления в стиле Super Productivity SnackBar — появляются снизу справа.

### Sidebar
Навигация слева в стиле SP sidebar. Сворачивается в режим иконок (56px). Мобайл — drawer.

---

## Supabase-паттерны

### Вызов RPC из Angular
```typescript
const { data, error } = await this.supabase.rpc('get_feed', {
  p_deal_type: 'sale',
  p_limit: 20,
  p_offset: 0
})
```
`p_user_id` не нужен — RLS берёт `auth.uid()` автоматически из JWT.

### Правила видимости объектов (Reciprocity)

| Тип объекта | Free план | Pro план |
|---|---|---|
| Объекты друзей/коллег (`user_network`) | Все, без лимита | Все, без лимита |
| Public объекты (первые N) | N = `ai_configs.reciprocity_none_fixed` (=5) | Все |
| Public объекты сверх лимита | Только счётчик `count_hidden` | — |

### Пагинация ленты
`p_limit=20`, `p_offset` инкрементируется. `count_visible` / `count_total` в ответе.

### Автокомплит локаций
`search_locations(p_query, p_limit=10)` — debounce 300ms, мин. 2 символа.

---

## Типы данных

Ключевые TypeScript-типы (зеркало схемы БД):

```typescript
UserRole = 'agent' | 'admin' | 'moderator' | 'superadmin'
BadgeLevel = 'starter' | 'silver' | 'gold' | 'platinum'
Plan = 'free' | 'pro'
SubStatus = 'active' | 'expired'
GiftSource = 'registration' | 'referral' | 'admin'
```

Полная схема → `src/app/mrsqm/types/database.ts`

---

## Логика регистрации (N8N, не mainapp)

Flow в N8N: ввод данных пользователем → создание в БД:

1. `users` INSERT
2. `user_identities` INSERT (broker_license, emirate, agency)
3. `user_settings` INSERT (photo_url)
4. `agent_badge` INSERT (badge_level='starter')
5. `agent_activity` INSERT (score=0)
6. `subscription_gifts` INSERT → триггер создаёт Pro запись в `subscriptions`
7. `user_context` INSERT
8. Если есть реферер: `referrals` INSERT (status='pending')

Бонус рефереру — при **активации** нового пользователя
(первый опубликованный объект или первый сохранённый фильтр).

---

## Система бейджей — ВНЕ MVP

⛔ **Решение (2026-06-09): система бейджей полностью исключена из MVP.**

Причина: начисление и пересчёт требуют N8N (которого в MVP нет). Показывать статичный бейдж,
который никогда не меняется, — вводить пользователя в заблуждение.

Приложение **не читает и не показывает** `agent_badge` / `owner_badge_level` нигде.

**Как заработает позже:** скользящее окно 90 дней — N8N cron раз в день пересчитывает
бейджи и обновляет `agent_badge.badge_level`.

---

## PWA & Telegram Mini App

**PWA:** `manifest.json` + Service Worker. Установка на телефон.

**Telegram Mini App:** `telegram-web-app.js` SDK. `window.Telegram.WebApp.ready()` при
монтировании. Тема — из Telegram-клиента.

---

## Деплой

**Coolify autodeploy** из ветки `main`. Web-сборка: `npm run buildFrontend:prodWeb`
(Angular `ng build --configuration productionWeb` → `.tmp/angular-dist/browser`), раздача статики.
(`npm run build` собирает Electron-приложение — для веб-прода не используется.)
**Прод (план):** `https://app.mrsqm.com` — Coolify-ресурс ещё не настроен.

**Supabase-конфиг** — через Angular `src/environments/environment.ts` (`supabaseUrl` / `supabaseAnonKey`),
значения зашиты в файл и попадают в бандл при сборке. Angular **не использует** `VITE_*`-префикс.
`supabaseAnonKey` публичен (RLS защищает данные); service-key в клиент не кладётся.

**TG-summary** после деплоя (`/deploy` skill) — `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` из локального
`.env.local`, шлётся с машины разработчика (в бандл/прод не идёт).

---

## Что НЕ входит в MVP

- Верификация лицензии RERA
- **Система баллов и бейджей — полностью**
- Аналитика просмотров (`get_property_viewers`)
- N8N интеграции и уведомления
- Платёжная система
- Карта объектов
- Блок «Похожие объекты» (MVP-2)
- Фильтры по цене (MVP-2)
- Полная форма добавления объекта (MVP-2)

---

## Связанные проекты

| Проект | Путь | Роль |
|---|---|---|
| **superapp (mainapp)** | `~/Projects/superapp` | Основное agent-facing приложение |
| **admin (control)** | `~/Projects/admin` | Оркестратор: очереди, UI, RapidAPI-синк |
| **parser4** | `~/Projects/parser4` | v4-скрейпер: scrape-one, check-alive |
| **parser5** | `~/Projects/parser5` | v5-обогатитель: enrich/one, Building info |
| **mrsqm-ai-chat** | `https://ai.mrsqm.com` | Node.js AI-сервис |

Общая БД: Supabase self-hosted VPS (`ubuntu@51.83.197.222`).
Беклог группы: `~/Projects/admin/docs/TODO.md`.
