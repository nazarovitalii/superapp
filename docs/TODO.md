# TODO — MrSQM (superapp)

Статусы: `[ ]` pending · `[~]` in-progress · `✅` done · `[!]` баг

Пометки: 👤 от создателя · 🤖 от Claude · 🔴 высокий · 🟡 средний · 🟢 низкий

Беклог группы (admin + parser4 + parser5) — в `~/Projects/admin/docs/TODO.md`.
Здесь — задачи только по superapp (MrSQM mainapp).

---

## Инфраструктура

| # | Приоритет | Задача | Статус |
|---|---|---|---|
| M-0 | 🔴 | Система документирования: `.claude/` (skills deploy/export-convo/daily-summary/migrate/test-prod, hooks, rules), export-convo скрипт, git (origin→свой репо, upstream→SuperProductivity, master→main), CLAUDE.md MrSQM-секция | ✅ |
| M-1 | 🔴 | Документация MrSQM в docs/*.md (README, architecture, database, tabs, TODO) | ✅ |
| M-2 | 🔴 | Supabase клиент: `src/app/mrsqm/services/supabase.service.ts` + env | `[ ]` |
| M-3 | 🔴 | Auth: LoginPage + AuthGuard + AuthService (Supabase Auth + users.is_active) | `[ ]` |
| M-4 | 🟡 | Базовый routing: `/`, `/add`, `/saved`, `/network`, `/profile`, `/chat` | `[ ]` |

---

## MVP-1 — Разработка

> **Объём согласован 2026-06-09.** Система бейджей полностью исключена.
> Дизайн = Super Productivity (стили, темы, анимации сохраняются).

| # | Приоритет | Задача | Упрощение для MVP-1 | Статус |
|---|---|---|---|---|
| P-1 | 🔴 | Типы БД: `src/app/mrsqm/types/database.ts` | без BadgeLevel/AgentBadge | `[ ]` |
| P-2 | 🔴 | Лента (`/`): `get_feed`, карточки, Sale/Rent, пагинация | без бейджей агентов | `[ ]` |
| P-3 | 🔴 | Карточка: модалка справа, `get_property`, данные агента, WhatsApp | без «Похожих», 1 фото | `[ ]` |
| P-4 | 🔴 | Фильтры ленты | только Sale/Rent + район (`search_locations`) | `[ ]` |
| P-5 | 🟡 | Добавить объект (`/add`): `publish_property`, autocomplete локации | урезанная форма, 1–3 фото | `[ ]` |
| P-6 | 🟡 | Профиль агента (`/profile`): мои объекты, реф-ссылка | без бейджа/баллов/прогресса | `[ ]` |
| P-7 | 🟡 | Избранное (`/saved`): `get_saved_properties`, toggle `save_property` | — | `[ ]` |
| P-8 | 🟡 | Сеть коллег (`/network`): список агентов, поиск, добавить | — | `[ ]` |
| P-9 | 🟢 | AI Чат (`/chat`): заглушка интерфейса | статичная заглушка | `[ ]` |
| P-10 | 🟢 | Мобильный sidebar — drawer на < 768px | — | `[ ]` |
| W-1 | 🟡 | manifest.json — PWA setup | — | `[ ]` |
| W-3 | 🟡 | Telegram Mini App SDK интеграция | — | `[ ]` |

---

## MVP-2 — Упрощённое/отложенное

| # | Приоритет | Задача | Статус |
|---|---|---|---|
| P-3b | 🟡 | Карточка: блок «Похожие объекты» (`get_similar_properties`) + галерея | `[ ]` |
| P-4b | 🟡 | Фильтры: цена мин/макс + количество комнат | `[ ]` |
| P-5b | 🟡 | Добавить объект: полные поля (до 10 фото) | `[ ]` |
| W-2 | 🟢 | Service Worker — кэш статики | `[ ]` |

---

## После MVP

| # | Приоритет | Задача | Статус |
|---|---|---|---|
| A-1 | 🟡 | Страница застройщика (`get_developer_projects`) | `[ ]` |
| A-2 | 🟡 | Аналитика просмотров Pro (`get_property_viewers`) | `[ ]` |
| A-3 | 🟡 | Сохранённые фильтры и уведомления | `[ ]` |
| A-4 | 🟡 | Чужой профиль агента (`/agent/:id`) | `[ ]` |
| A-5 | 🟢 | Карта объектов | `[ ]` |
| A-6 | 🟢 | Верификация лицензии RERA | `[ ]` |
| A-7 | 🟢 | Платёжная система (Pro upgrade) | `[ ]` |
| A-8 | 🟢 | Система бейджей (N8N cron пересчёт) | `[ ]` |

---

## 🐛 Баги

| # | Приоритет | Описание | Статус |
|---|---|---|---|
| _нет_ | | | |

---

## ✅ Выполнено

| Дата | Что |
|---|---|
| 2026-06-10 | M-0: система документирования (`.claude/` skills+hooks+rules, export-convo, git origin/upstream/main, CLAUDE.md MrSQM-секция) |
| 2026-06-09 | M-1: Полная документация MrSQM (README, architecture, database, tabs, TODO) |
