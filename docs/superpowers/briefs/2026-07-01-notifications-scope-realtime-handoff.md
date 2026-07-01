# Handoff realtime: вкладки уведомлений — `p_scope` + `personal_unread_count`

> **Дата:** 2026-07-01 · **От:** superApp · **Кому:** realtime / владелец БД.
> **Назначение:** addendum к `get_notifications` под вкладки «Все / Личные» в сайдбаре.
> Связанные документы: контракт ленты [`2026-06-30-notifications-feed-realtime-handoff.md`](2026-06-30-notifications-feed-realtime-handoff.md) §RT-BELL-C, дизайн [`../specs/2026-07-01-notifications-tabs-design.md`](../specs/2026-07-01-notifications-tabs-design.md).

## Проблема

Матч-уведомления (`new_listing`/`price_drop`) сыпятся пачками и топят редкие важные личные
(`friend_request`, `new_comment`, статус объекта). Создатель хочет вкладку «Личные» = всё, кроме матчей.
Чисто клиентский фильтр несовместим с keyset-пагинацией (страница матчей отдаст «Личные» почти пустыми),
поэтому фильтрация нужна на сервере.

## Addendum к `get_notifications`

```
get_notifications(
  p_limit  int         default 30,
  p_cursor timestamptz default null,
  p_scope  text        default 'all'      -- НОВОЕ: 'all' | 'personal'
) -> {
  items:                 [...],           -- как сейчас
  unread_count:          int,             -- непрочитанные В ТЕКУЩЕМ scope
  personal_unread_count: int,             -- НОВОЕ: непрочитанные личные, всегда (независимо от p_scope)
  next_cursor:           timestamptz|null
}
```

**Семантика:**

- `p_scope='personal'` → в `WHERE` добавляется `type NOT IN ('new_listing','price_drop')`.
  Пагинация, `unread_count`, `next_cursor` считаются уже по отфильтрованному набору.
- `p_scope='all'` (или отсутствует) → поведение как сейчас, **обратно совместимо**.
- `personal_unread_count` — **всегда** число непрочитанных личных (даже когда открыта «Все»),
  чтобы вкладка показывала индикатор. Один `COUNT(*) FILTER (WHERE read_at IS NULL AND type NOT IN
  ('new_listing','price_drop'))` в том же запросе, не отдельным раундтрипом.

## Обратная совместимость

Параметр опциональный с дефолтом → текущий вызов `get_notifications(p_limit)` и `mark_notifications_read`
не ломаются. `personal_unread_count` — новое поле, старый фронт его игнорит.

## Клоббер-риск

Пока realtime не вложил `p_scope` в каноничную миграцию, любой их редеплой её затрёт. Поэтому путь —
именно хендофф (мерж в их источник), а не наш прод-патч.

## Критерий приёмки

`get_notifications(p_scope=>'personal')` не содержит `new_listing`/`price_drop`; `unread_count` — по scope;
`personal_unread_count` = непрочитанные личные независимо от `p_scope`; `p_scope=>'all'` идентичен текущему.

## Разделение ответственности

| Задача                                                           | Сторона                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `p_scope`-фильтр + `personal_unread_count` в каноничной миграции | **realtime / БД**                           |
| Таб-бар, scope-сигнал, `p_scope` в RPC-вызовах, индикатор        | **superApp** (фронт против мока до деплоя)   |
