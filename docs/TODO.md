# TODO — MrSQM (superapp)

Статусы: `[ ]` pending · `[~]` in-progress · `✅` done · `[!]` баг

Пометки: 👤 от создателя · 🤖 от Claude · 🔴 высокий · 🟡 средний · 🟢 низкий

Беклог группы (admin + parser4 + parser5) — в `~/Projects/admin/docs/TODO.md`.
Здесь — задачи только по superapp (MrSQM mainapp).

---

## Инфраструктура

| #   | Приоритет | Задача                                                                                                                                                                                                                        | Статус |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M-0 | 🔴        | Система документирования: `.claude/` (skills deploy/export-convo/daily-summary/migrate/test-prod, hooks, rules), export-convo скрипт, git (origin→свой репо, upstream→SuperProductivity, master→main), CLAUDE.md MrSQM-секция | ✅     |
| M-1 | 🔴        | Документация MrSQM в docs/\*.md (README, architecture, database, tabs, TODO)                                                                                                                                                  | ✅     |
| M-2 | 🔴        | Supabase клиент: `src/app/mrsqm/services/supabase.service.ts` + env (anon-ключ в `environment*.ts`)                                                                                                                           | ✅     |
| M-3 | 🔴        | Auth: LoginPage + AuthGuard + AuthService (Supabase Auth + users.is_active) + logout в nav                                                                                                                                    | ✅     |
| M-4 | 🟡        | Базовый routing: `/mrsqm/feed`,`/add`,`/saved`,`/network`,`/profile`,`/chat` + stub-страницы                                                                                                                                  | ✅     |
| M-5 | 🔴        | Полный справочник схемы БД (`docs/database.md`): RPC+тела, триггеры, RLS, enum                                                                                                                                                | ✅     |
| M-6 | 🟡        | Инструкция деплоя в Coolify (`docs/deploy-coolify.md`, домен sapp.mrsqm.com)                                                                                                                                                  | ✅     |
| M-7 | 🔴        | Coolify-деплой web-клиента (Docker Image из GHCR, DNS, public-пакет, HTTPS) → https://sapp.mrsqm.com работает                                                                                                                 | ✅     |
| M-8 | 🔴        | CI-сборка образа: GitHub Actions → GHCR (`.github/workflows/build-web-image.yml`), чтобы НЕ собирать на VPS                                                                                                                    | ✅     |
| M-9 | 🔴        | ⚠️ **Настоящий вход через Telegram `initData`** (схема `users` парольная НЕ предусмотрена: `telegram_id`/`channel_origin`, паролей нет). Сейчас стоит ВРЕМЕННЫЙ dev-вход email+пароль (см. M-3-dev). Нужна серверная проверка подписи initData (Edge Function/RPC) + выдача сессии по `telegram_id` | `[ ]`  |
| M-3-dev | 🔴     | ⚠️ **ВРЕМЕННО:** 9 активным юзерам заведён парольный вход в `auth.users` (id = `public.users.id`, email-identity) для dev/тестов. **Удалить перед продом** (это обход реального TG-флоу). Откат: `DELETE FROM auth.users WHERE id IN (SELECT id FROM public.users WHERE is_active);` | `[~]`  |

---

## MVP-1 — Разработка

> **Объём согласован 2026-06-09.** Система бейджей полностью исключена.
> Дизайн = Super Productivity (стили, темы, анимации сохраняются).

| #    | Приоритет | Задача                                                                                | Упрощение для MVP-1                                                     | Статус |
| ---- | --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| P-1  | 🔴        | Типы БД: `src/app/mrsqm/types/database.ts` (PropertyFeedItem и др.)                   | без BadgeLevel/AgentBadge                                               | `[~]`  |
| P-2  | 🔴        | Лента (`/mrsqm/feed`): карточки 1-строкой, Sale/Rent, пагинация, центрированный фрейм | сделано на **mock**, реальный `get_feed` не подключён (нужен auth+city) | `[~]`  |
| P-3  | 🔴        | Карточка: модалка справа (нативная right-panel SP), данные агента, WhatsApp           | на **mock**, `get_property` не подключён                                | `[~]`  |
| P-4  | 🔴        | Фильтры ленты: sidebar (тип/беды/цена/листинг/distress) + тогл Sale/Rent в хедере     | на **mock**; district через `search_locations` не подключён             | `[~]`  |
| P-5  | 🟡        | Добавить объект (`/add`): 5-шаг. форма → INSERT в `properties` под RLS (НЕ `publish_property` — его нет), справочники `get_filter_options`, локация `search_locations`. **Боевой INSERT проверен** (status→draft, значения сверены с CHECK) | **без фото** (P-5b) | ✅     |
| P-6  | 🟡        | Профиль агента (`/profile`): мои объекты, реф-ссылка                                  | без бейджа/баллов/прогресса                                             | `[ ]`  |
| P-7  | 🟡        | Избранное (`/saved`): `get_saved_properties`, toggle `save_property`                  | —                                                                       | `[ ]`  |
| P-8  | 🟡        | Сеть коллег (`/network`): список агентов, поиск, добавить                             | —                                                                       | `[ ]`  |
| P-9  | 🟢        | AI Чат (`/chat`): заглушка интерфейса                                                 | статичная заглушка                                                      | `[ ]`  |
| P-10 | 🟢        | Мобильный sidebar — drawer на < 768px                                                 | —                                                                       | `[ ]`  |
| W-1  | 🟡        | manifest.json — PWA setup                                                             | —                                                                       | `[ ]`  |
| W-3  | 🟡        | Telegram Mini App SDK интеграция                                                      | —                                                                       | `[ ]`  |

---

## MVP-2 — Упрощённое/отложенное

| #    | Приоритет | Задача                                                                | Статус |
| ---- | --------- | --------------------------------------------------------------------- | ------ |
| P-3b | 🟡        | Карточка: блок «Похожие объекты» (`get_similar_properties`) + галерея | `[ ]`  |
| P-4b | 🟡        | Фильтры: цена мин/макс + количество комнат                            | `[ ]`  |
| P-5b | 🟡        | Добавить объект: загрузка фото (Storage-bucket `property_photos` + RLS, compress thumb/full webp, INSERT в `property_photos`). Образец логики — React-проект nazarovitalii/dubai-realtors-app- (AddPropertyPage.jsx). Bucket пока НЕ создан (есть только `avatars`) | `[ ]`  |
| W-2  | 🟢        | Service Worker — кэш статики                                          | `[ ]`  |

---

## После MVP

| #   | Приоритет | Задача                                            | Статус |
| --- | --------- | ------------------------------------------------- | ------ |
| A-1 | 🟡        | Страница застройщика (`get_developer_projects`)   | `[ ]`  |
| A-2 | 🟡        | Аналитика просмотров Pro (`get_property_viewers`) | `[ ]`  |
| A-3 | 🟡        | Сохранённые фильтры и уведомления                 | `[ ]`  |
| A-4 | 🟡        | Чужой профиль агента (`/agent/:id`)               | `[ ]`  |
| A-5 | 🟢        | Карта объектов                                    | `[ ]`  |
| A-6 | 🟢        | Верификация лицензии RERA                         | `[ ]`  |
| A-7 | 🟢        | Платёжная система (Pro upgrade)                   | `[ ]`  |
| A-8 | 🟢        | Система бейджей (N8N cron пересчёт)               | `[ ]`  |

---

## 🐛 Баги / расхождения с реальным API

> Найдено 2026-06-10 при сверке кода с живой схемой БД (`docs/database.md`).
> Чинить при подключении реального `get_feed` вместо моков (часть P-2…P-4).

| #     | Приоритет | Описание                                                                                                                                                              | Статус |
| ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| API-1 | 🔴        | `get_feed` требует `city_id` (из `p_city_id` или `user_context`); без города → **ошибка**. M-3 (Auth) ✅ — теперь юзер залогинен; осталось подключить реальный `get_feed` вместо мока и прокинуть город из контекста юзера | `[ ]`  |
| API-2 | 🟡        | `p_bedrooms`/`p_bathrooms` — **массивы** `int[]` (мультивыбор), в текущих фильтрах одно значение                                                                      | `[ ]`  |
| API-3 | 🟡        | Ответ `get_feed` — `count_total`/`count_nearby` (нет `count_hidden`); типы объектов — id+lookup из `get_filter_options`, не строка                                    | `[ ]`  |
| API-4 | 🟢        | `properties.status` имеет 7 значений (draft/pending_review/active/rejected/expired/archived_sold/archived_withdrawn). Типы обновлены ✅                                | ✅     |
| API-5 | 🟡        | На `properties` НЕТ DELETE-RLS-политики (есть только insert/select по owner). Юзер не может удалить свой объект с клиента → для «удалить объявление» нужна политика или RPC | `[ ]`  |
| API-6 | 🟢        | CHECK-значения enum-полей: `furnished`=furnished/unfurnished (НЕ yes/no), `occupancy_status`=vacant/occupied/vacant_on_transfer. Брать из `get_filter_options`, не хардкодить | ✅     |

---

## ✅ Выполнено

| Дата       | Что                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-11 | M-3: auth (Supabase email+пароль). LoginPage `/login`, `mrsqmAuthService` (проверка users.is_active по auth.uid через RLS), `mrsqmAuthGuard` на всех mrsqm/*, «Выйти» в nav. 4 unit-теста. |
| 2026-06-11 | M-7: web-клиент задеплоен → **https://sapp.mrsqm.com** (HTTPS валиден, SPA-роуты ок), образ public в GHCR, Coolify тип Docker Image                                                                                                |
| 2026-06-11 | M-8: CI-сборка образа в GHCR через GitHub Actions (`.github/workflows/build-web-image.yml`) — после инцидента, когда сборка на VPS уронила общую Supabase. Coolify тип ресурса → Docker Image. Инструкция деплоя переписана. |
| 2026-06-10 | M-7-инфра: инструкция деплоя Coolify (`docs/deploy-coolify.md`, sapp.mrsqm.com, приватный репо через GitHub App)                                                              |
| 2026-06-10 | M-5: полный справочник схемы БД из живой Supabase (RPC+тела, 31 триггер, 45 RLS, enum)                                                                                        |
| 2026-06-10 | M-2/M-4 + P-1…P-4 (на mock): Supabase-клиент, env, routing+stubs, типы, лента, карточка-детали в right-panel, sidebar фильтров, тогл Sale/Rent в хедере, реструктуризация nav |
| 2026-06-10 | M-0: система документирования (`.claude/` skills+hooks+rules, export-convo, git origin/upstream/main, CLAUDE.md MrSQM-секция)                                                 |
| 2026-06-09 | M-1: Полная документация MrSQM (README, architecture, database, tabs, TODO)                                                                                                   |
