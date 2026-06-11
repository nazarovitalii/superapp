# MrSQM — Бизнес-логика и обзор продукта

**MrSQM** — B2B платформа обмена объектами недвижимости для дубайских риелторов.

Это приложение Super Productivity **переосмыслено как риелторская платформа**: сохранены
дизайн, темы, UX и анимации Super Productivity, но функциональность — полностью MrSQM.

**Стек:** Angular + Electron + Capacitor (base), Coolify + Supabase self-hosted + N8N self-hosted  
**Каналы:** Telegram WebApp + WhatsApp (внешний браузер)

---

## Тарифные планы

| Free                         | Pro                                       |
| ---------------------------- | ----------------------------------------- |
| Official Listings безлимит   | Pocket Listings (эксклюзив, нет на Bayut) |
| AI бот 11 из 12 инструментов | AI аналитика рынка                        |
| PDF карточки                 | Realtime уведомления                      |
| Уведомления дайджест 8:00    | Прямое сообщение агенту                   |
| Связь через объект           | Аналитика просмотров                      |
| A2A — только подписать       | Приоритет в поиске + A2A инициировать     |

---

## Реферальная программа

| Условие                   | Реферер (А)                        | Новый пользователь (Б) |
| ------------------------- | ---------------------------------- | ---------------------- |
| Регистрация без реферала  | —                                  | 2 мес Pro триала       |
| Регистрация по реф-ссылке | +1 мес Pro после активации Б       | 3 мес Pro триала       |
| Максимум реф-бонуса для А | **3 месяца суммарно за всё время** | —                      |

Бонус Б — при регистрации. Бонус А — триггером при активации Б
(`trg_activate_on_property` или `trg_activate_on_filter`).

---

## Auth-модель

**Решение:** Supabase Auth + таблица `users`. При входе: Supabase Auth сессия → SELECT из `users`
по `email` с `is_active = true`. Если записи нет — принудительный `signOut` + ошибка клиенту.

**Роли:** `agent` / `admin` / `moderator` / `superadmin` (поле `users.role`).

**Почему anon key:** `supabaseAnonKey` (из `src/environments/environment.ts`) виден в бандле —
это нормально для SPA. Вся защита данных — через RLS на стороне БД. Service key обходит RLS
и никогда не кладётся в браузер. (Angular читает конфиг из `environment.ts`, не через `VITE_*`.)

---

## Правила видимости объектов (Reciprocity)

| Тип объекта                            | Free план                                    | Pro план        |
| -------------------------------------- | -------------------------------------------- | --------------- |
| Объекты друзей/коллег (`user_network`) | Все, без лимита                              | Все, без лимита |
| Public объекты (первые N)              | N = `ai_configs.reciprocity_none_fixed` (=5) | Все             |
| Public объекты сверх лимита            | Только счётчик `count_hidden`                | —               |

---

## Система бейджей — ВНЕ MVP

⛔ **Решение (2026-06-09): система бейджей полностью исключена из MVP** — ни начисление,
ни пересчёт, ни отображение. Причина: начисление и пересчёт требуют N8N (которого в MVP нет),
а показывать статичный бейдж, который никогда не меняется, — вводить пользователя в заблуждение.

В MVP приложение **не читает и не показывает** `agent_badge` / `owner_badge_level` нигде.
Поле `agent_badge.badge_level` остаётся в БД (заполняется регистрацией = 'starter'), но UI
его игнорирует.

**Как заработает позже:** скользящее окно 90 дней, N8N cron раз в день пересчитывает бейджи.

---

## Деплой

> ⚠️ **Сборку НЕЛЬЗЯ запускать на нашем VPS.** Сборка Angular съедает всю память
> и роняет общую Supabase (инцидент 2026-06-10 — пришлось перезагружать сервер).

**Схема:** `git push main` → **GitHub Actions** собирает Docker-образ (на мощностях
GitHub, бесплатно) → пушит в **GHCR** (`ghcr.io/nazarovitalii/superapp-web:latest`) →
**Coolify** тянет готовый образ и запускает nginx (~30 МБ, без нагрузки на VPS).
Workflow: [`.github/workflows/build-web-image.yml`](../.github/workflows/build-web-image.yml).
В Coolify тип ресурса — **Docker Image** (НЕ сборка из репозитория).
**Прод (план):** `https://sapp.mrsqm.com` (app.mrsqm.com занят mainapp).
Пошаговая инструкция: [`docs/deploy-coolify.md`](deploy-coolify.md).

**Supabase-конфиг:** Angular `src/environments/environment.ts` (`supabaseUrl` / `supabaseAnonKey`) —
зашит в файл, попадает в бандл при сборке. Не `VITE_*` (это React/Vite-механизм mainapp).

**TG-summary** (`/deploy`) — `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` из локального `.env.local`,
шлётся с машины разработчика, в бандл не идёт.

---

## PWA & Telegram Mini App

**PWA:** `manifest.json` + Service Worker. Установка на телефон как приложение.
**Telegram Mini App:** `telegram-web-app.js` SDK. Тема берётся из Telegram-клиента.

---

## Что НЕ входит в MVP

- Верификация лицензии RERA (есть UI, нет логики)
- **Система баллов и бейджей — полностью**
- Аналитика просмотров (`get_property_viewers`)
- N8N интеграции и уведомления
- Платёжная система
- Карта объектов

---

## Связанные проекты

| Проект                 | Путь                  | Роль                                      |
| ---------------------- | --------------------- | ----------------------------------------- |
| **superapp (mainapp)** | `~/Projects/superapp` | Основное agent-facing приложение          |
| **admin (control)**    | `~/Projects/admin`    | Оркестратор: очереди, UI, RapidAPI-синк   |
| **parser4**            | `~/Projects/parser4`  | v4-скрейпер: scrape-one, check-alive      |
| **parser5**            | `~/Projects/parser5`  | v5-обогатитель: enrich/one, Building info |

Общая БД: Supabase self-hosted VPS (`ubuntu@51.83.197.222`).
