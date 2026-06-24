# Контракт: live-уведомления (колокольчик) — superApp ↔ realtime

> **Дата:** 2026-06-24 · **Стороны:** superApp (фронт-клиент + потребитель read-модели) ↔ realtime (notifier, `get_bell`, триггеры, WSS).
> **Назначение:** зафиксировать контракт и разделение ответственности, чтобы realtime-команда могла реализовать бэк, а superApp — фронт, без рассинхрона. Аналог брифа Storage-дренера.

## Суть архитектуры (согласовано)

Браузер держит WSS → notifier шлёт крошечный сигнал `bell.changed` → фронт по нему (и на каждом коннекте) перечитывает колокольчик через REST `get_bell()` → обновляет бейдж+список без перезагрузки. **Сокет = только сигнал «обновись», данные всегда из REST.** Закрыл вкладку → офлайн ловит Delivery (TG/WA).

## ⚠️ Рамка №0 — НЕ плодить второй счётчик «seen» (важнее всех пунктов)

У superApp уже в проде источник истины по «непросмотренным в фильтре»:
`get_saved_filters.unseen_count` + таблицы `user_seen_listings` / `user_filter_seen`
(`applied/2026-06-22..23-*-per-filter-seen*.sql`, RT-4). Различаем ДВЕ «прочитанности»:

| Что | Семантика | Где живёт | Кто гасит |
| --- | --- | --- | --- |
| **listing-seen** | юзер открыл карточку объекта = «N непросмотренных в фильтре» | `user_seen_listings` (есть) | открытие карточки в ленте |
| **bell-seen** | юзер открыл колокольчик = погасить точку на иконке | НОВЫЙ курсор (ваш) | `mark_bell_seen()` |

`get_bell` отдаёт **поток событий** (new / price_drop). «Сколько непросмотрено в фильтре» фронт берёт из **существующего** `get_saved_filters`. Открытие колокольчика гасит ТОЛЬКО bell-точку и НЕ помечает объекты просмотренными (иначе `unseen_count` ложно обнулится — мы это уже ловили на бейдже, RT-4).

## Продуктовое требование создателя (2026-06-24)

Уведомление на фронте с тегами:
- **New** — объекты, которых в этом фильтре ещё не было → `match_type = 'new'` (listing_new/backfill пайплайна).
- **Price Reduction** — объекты фильтра со сниженной ценой → `match_type = 'price_drop'`.
- В уведомлении: **название фильтра** + **сколько всего НЕ просмотренных объектов в фильтре сейчас**.
  → имя фильтра (`saved_filters.name`) и счётчик (`unseen_count`) фронт берёт из `get_saved_filters`, НЕ из `get_bell`.

## Решения по 12 вопросам

### A. Read-модель и данные (realtime/бэк)
1. **get_bell/mark_bell_seen/курсор — да, ваши.** Но `get_bell` читает существующие `filter_matches` + `user_seen_listings`, не свою копию «seen».
2. **Поля карточки:** `property_id, title, price, price_currency, previous_price, thumb_url, location_label, deal_type, match_type, matched_at` + **обязательно** `filter_id`, `status` объекта. `filter_name`/`unseen_count` НЕ дублировать в карточку — фронт берёт из `get_saved_filters`.
3. **price_drop: old→new** (рекомендуем вместо «только текущая+↓»). `previous_price` уже в схеме `properties`, отдать дёшево; тег «Price Reduction» осмыслен как «2.1M ↓ с 2.3M».
4. **Курсор bell-seen — отдельная таблица/колонка** (ваша). Это bell-seen, НЕ трогает `user_seen_listings`.
5. **Mark-seen при открытии дропдауна — да (v1)**, гасит bell-точку. Per-item — v2. НЕ помечает объекты просмотренными.
6. **Гранулярность — карточка-на-объект с дедупом.** Агрегат = Delivery-дайджест (офлайн).

### B. Прод/инфра (владелец БД)
7. **Триггер 016:** ⚠️ сверить имена с уже применённым бандлом **009–012** (`applied/2026-06-22-realtime-match-pipeline-009-012.sql`) — там statement-level notify + триггеры на `filter_matches`/`properties`, риск конфликта имён. Применять statement-level; сперва осмотреть существующие триггеры. Применяет владелец.
8. **GOTRUE_JWT_SECRET:** владелец заводит secret в Coolify. ⛔ Из прод-контейнеров секрет не тащить.
9. **WSS:** сабдомен `wss://notify.<домен>`, origin фронта в CORS/Traefik. Инфра владельца.

### C. Поведение клиента (superApp)
10. **Да** — на каждом (ре)коннекте клиент берёт свежий токен и ре-синкает `get_bell`. Сокет = сигнал, REST = данные.
11. **Да** — тумблер «живость» = localStorage superApp.
12. **Да** — access-token в `Sec-WebSocket-Protocol` единственным значением; на реконнекте — свежий токен (см. №10).

## Минимальный контракт (что нужно фронту для сборки)

```
get_bell() -> [{
  property_id      uuid,
  filter_id        uuid,
  match_type       text,         -- 'new' | 'price_drop'  → теги New / Price Reduction
  matched_at       timestamptz,
  title            text,
  price            numeric,
  price_currency   text,
  previous_price   numeric,      -- для price_drop (old→new)
  thumb_url        text,
  location_label   text,
  deal_type        text,
  status           text          -- скрывать sold/archived
}]
mark_bell_seen()                 -- гасит bell-точку (bell-seen курсор)
signal 'bell.changed'            -- WSS, только триггер на refetch get_bell()
```
Имя фильтра + «N непросмотренных всего» — сторона superApp из `get_saved_filters` (`name`, `unseen_count`).

## Ответы superApp на B1 / K2 / K4 (2026-06-24)

**B1 — триггеров на `filter_matches` в бандле 009–012 НЕТ.** Бандл вешает триггеры на:
`properties` (`properties_insert_match`, `properties_activate_match`, `properties_price_drop_match`, FOR EACH ROW),
`saved_filters` (`saved_filters_insert_match`, FOR EACH ROW),
`match_jobs` (`match_jobs_notify`, FOR EACH STATEMENT → `pg_notify('match_jobs','')`).
Пайплайн: properties/saved_filters → `match_jobs` (очередь) → воркер → пишет `filter_matches`. Notify — на `match_jobs`, не на результатах.
→ **016 без конфликта имён.** Рекомендация: `AFTER INSERT ON filter_matches FOR EACH STATEMENT → pg_notify('bell_changed','')` на **отдельном канале** (не `match_jobs`); folding пустым payload как в `notify_match_jobs`.

**K2 — `get_bell` джойнит display-поля сам (не N+1 на клиенте).** В `properties` нет `title`/`thumb_url`/`location_label` (title композитный, thumb из `property_photos`, location — join). `get_bell` строит их так же, как `get_feed`. `filter_name`/`unseen_count` — отдельно из `get_saved_filters`.

**K4 — поток НЕ фильтруется по `user_seen_listings` (v1).** `get_bell` = лог событий, гасится bell-курсором. `user_seen_listings` уже отражён в `unseen_count` из `get_saved_filters`. Двойной фильтр = те же грабли двойного «seen» (Рамка №0).

## Открытые к подтверждению владельцем/realtime
- §8 кто и когда заводит `GOTRUE_JWT_SECRET` в Coolify.
- §9 финальный WSS-хост/сабдомен.
