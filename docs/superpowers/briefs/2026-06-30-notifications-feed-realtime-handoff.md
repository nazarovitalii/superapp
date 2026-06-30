# Handoff realtime: лента уведомлений (BELL-2) — go-live + баг счётчика + 11 типов

> **Дата:** 2026-06-30 · **От:** superApp · **Кому:** realtime / владелец БД.
> **Назначение:** передать realtime-команде три задачи (A/B/C) по колокольчику. superApp параллельно делает фронт против контракта C (мок). Связанные документы: контракт BELL-1 [`2026-06-24-bell-notifications-realtime-contract.md`](2026-06-24-bell-notifications-realtime-contract.md), дизайн BELL-1 [`../specs/2026-06-29-bell-notifications-live-ui-design.md`](../specs/2026-06-29-bell-notifications-live-ui-design.md).

## Контекст: что в проде сейчас (проверено 2026-06-30)

Прямой замер прода `https://supaprod.mrsqm.com`:

| Проверка | Результат | Вывод |
| --- | --- | --- |
| `POST /rest/v1/rpc/get_bell` | **404** `PGRST202` (нет функции) | RPC не развёрнут |
| `POST /rest/v1/rpc/mark_bell_seen` | **404** | RPC не развёрнут |
| `GET https://notify.mrsqm.com/` | **timeout / 000** | WSS-хост не отвечает |
| миграции 016/017 | нет в репо superApp вообще | не написаны/не применены |

→ **Весь live-бэкенд колокольчика в проде отсутствует.** Фронт BELL-1 собран и зашиплен, но «оживлять» нечего: сокет долбится в мёртвый хост, `bell_unseen` всегда 0. Сейчас реально работает только опрос `get_saved_filters` раз в 60с (отсюда кружки на фильтрах вообще шевелятся).

---

## RT-BELL-A — Go-live колокольчика (срочно, блокер всего live-функционала)

То, что уже спроектировано в BELL-1, но не задеплоено.

1. **Применить миграции** (по контракту 2026-06-24):
   - **016** — триггер `bell_changed_notify` на `filter_matches` (statement-level, `pg_notify('bell_changed','')`, отдельный канал — не `match_jobs`).
   - **017** — `get_bell()` (джойнит display-поля как `get_feed`) + `mark_bell_seen()` (идемпотентно-дёшев: клиент зовёт его на КАЖДОЕ закрытие колокола, даже при нулевом курсоре).
2. **Поднять WSS** `wss://notify.mrsqm.com`:
   - Traefik: проброс `Upgrade`/`Connection`, эхо `Sec-WebSocket-Protocol`, origin-allowlist `https://sapp.mrsqm.com`.
   - secret `SUPABASE_JWT_SECRET` в Coolify.
   - сигнал в сокет — только `{"type":"bell.changed"}` (или `notification.new`, см. C), данные клиент берёт REST-ом.

**Критерий приёмки:** `get_bell` отдаёт 200 (не 404); `notify.mrsqm.com` отвечает на WSS-handshake; при добавлении объекта в проде на клиенте без перезагрузки растёт бейдж колокола.

---

## RT-BELL-B — Баг: фильтр-счётчик растёт на +3/+4 вместо +1

**Симптом (создатель):** другой юзер добавляет 1 объект, подходящий под мой фильтр → `unseen_count` фильтра растёт на 3–4, причём в счётчик попадают объекты, которые я уже просматривал и счётчик по которым обнулялся.

**РАЗОБРАНО 2026-06-30 — баг НЕ на стороне realtime, держим тут для истории.**

**Сначала думали:** renotify-пайплайн / шум `properties.updated_at` от обогащения. **Опровергнуто двумя фактами:**
1. realtime подтвердил: matcher пишет только `match_jobs`/`filter_matches`, `properties.updated_at` НЕ трогает (`match_property`/`match_filter` — STABLE SELECT);
2. создатель подтвердил: **таблицу `properties` пишет ТОЛЬКО superApp** — внешнего обогатителя у неё нет. → шум `updated_at` от парсеров исключён.

**Истинный корень (superApp, read+write seen):** бейдж считается по `user_filter_seen`, а superApp пишет туда строку только при узком условии ([`feed-page.component.ts:570-602`](../../../src/app/mrsqm/pages/feed/feed-page.component.ts#L570-L602)): открыт именно этот сохранённый фильтр + объект провисел на экране 5с + объект чужой. Просмотр в общей ленте (без фильтра) / быстрый скролл / уход до 5с → строка НЕ пишется → объект считается непросмотренным «вечно». Отсюда +3/+4. **Время-колонка (`updated_at` vs `matched_at`) ни при чём — отсутствуют сами строки seen.**

**Следствие для контракта:** двусторонняя модель `matched_at` баг B **не лечит** (строки seen отсутствуют независимо от времени сравнения). Прод-правка формулы `get_saved_filters` под B владельцем НЕ запускается. `matched_at` как внутренняя модель времени `get_bell` — на усмотрение realtime, но развязано от B.

**Фикс — на стороне superApp** (отдельная задача, не в этом handoff): сделать «seen» консистентным — либо бейдж уважает глобальный `user_seen_listings`, либо расширить условие записи `user_filter_seen`. Продуктовое решение «что значит непросмотрено в фильтре» — за создателем.

---

## RT-BELL-C — Расширить модель до полноценной ленты уведомлений (12 типов)

Сейчас `get_bell` отдаёт ТОЛЬКО `filter_matches` (new / price_drop). Создатель хочет **плоскую ленту событий в стиле соцсети** с разнотипными уведомлениями.

### Модель

Обобщённая таблица:

```
notifications (
  id           uuid pk,
  user_id      uuid,            -- получатель (RLS: видит только свои)
  type         text,            -- enum ниже
  created_at   timestamptz,
  read_at      timestamptz null,-- курсор «прочитано» (аналог bell-seen, но per-row)
  entity_id    uuid null,       -- property_id / friend_id / listing_id / referral_id ...
  filter_id    uuid null,       -- только для match-типов
  thumb_url    text null,       -- фото объекта/аватар, для рендера слева
  data         jsonb            -- денормализованные поля под рендер строки (см. ниже)
)
```

### Типы (12) и данные под рендер

Фронт рисует строку из 3–4 строк текста + фото слева. Бэк отдаёт готовые поля в `data`, фронт НЕ джойнит:

| `type` | line1 (заголовок) | line2 (деталь) | line3 (контекст) | thumb |
| --- | --- | --- | --- | --- |
| `new_listing_below_op` | «New listing · below OP» | «1br · Damac Hills · 950k below OP» | `Filter "имя"` (серым) | фото объекта |
| `price_drop_below_op` | «Price dropped · below OP» | «2br · Marina · 2.1M ↓ 2.3M» | `Filter "имя"` (серым) | фото объекта |
| `subscription_expiring` | «Subscription ending» | дата окончания | — | icon-tile |
| `friend_request` | «{name} — запрос в друзья» | «Tap to review» | — | **аватар юзера** |
| `friend_request_accepted` | «{name} accepted» | — | — | аватар юзера |
| `ai_digest` | «AI digest» | краткое содержание | — | icon-tile |
| `referral_registered` | «{name} signed up» | — | — | аватар юзера |
| `bonus_month_granted` | «Bonus month added» | «+1 месяц подписки» | — | icon-tile |
| `listing_approved` | «Listing published» | «2br Apartment, Dubai Marina, 1,350,000» | — | фото объекта |
| `listing_rejected` | «Listing rejected» | причина | — | фото объекта |
| `listing_archived` | «Listing archived» | заголовок объекта | — | фото объекта |
| `new_comment` | «New comment» | текст комментария | — | фото объекта |

> **line3 (match-типы)** — фронт рисует `Filter "имя"` серым, имя берёт из `get_saved_filters` (Рамка №0). **Счётчик-кружок ⟨N⟩ в строке НЕ показываем** (решение создателя 2026-06-30). В `data` для match нужны: `bedrooms`, `location_label`, `price`, `previous_price`, `below_op` (булево/дельта).
> **listing_approved/rejected/archived** — в `data` нужны `title`, `location_label`, `price` (line2 = «{title}, {location}, {price}»).
> **thumb:** объектные типы → `thumb_url` (фото объекта); friend/referral → URL аватара юзера (тот же размер 44×44); subscription/ai_digest/bonus → без картинки, фронт рисует icon-tile.

### Продюсеры (триггеры/джобы)

- match-типы → из существующего пайплайна `filter_matches` (тот же источник, что 016).
- `subscription_expiring` → cron/джоба по `subscriptions.expires_at`.
- `friend_request` / `friend_request_accepted` → триггер на таблицу дружбы.
- `listing_approved` / `rejected` / `archived` → триггер на смену `properties.status` (модерация).
- `new_comment` → триггер на таблицу комментариев.
- `referral_registered` / `bonus_month_granted` → триггеры реферальной логики.

### RPC + сокет

```
get_notifications(p_limit int default 30, p_before timestamptz default null)
  -> [{ id, type, created_at, read_at, entity_id, filter_id, thumb_url, data }]   -- reverse-chrono, пагинация по created_at
mark_notifications_read(p_ids uuid[] default null)   -- null = все; гасит read_at (аналог mark_bell_seen)
unread_count  -- отдельным полем в ответе get_notifications или RPC
сигнал WSS: { "type": "notification.new" }   -- триггер refetch (данные REST-ом)
```

**Критерий приёмки:** `get_notifications` отдаёт плоский reverse-chrono список со всеми типами; новое событие любого типа приходит по WSS без перезагрузки; `mark_notifications_read` гасит `unread_count`.

---

## Разделение ответственности

| Задача | Сторона |
| --- | --- |
| RT-BELL-A (go-live), RT-BELL-B (баг счётчика), RT-BELL-C (модель+11 типов+RPC+WSS) | **realtime / БД** |
| Рендер ленты (4 строки + фото), формат времени, роутинг клика per-type, фикс «клик→карточка в сайдбаре», судьба «View all matches» | **superApp** (делается параллельно против мока контракта C) |
