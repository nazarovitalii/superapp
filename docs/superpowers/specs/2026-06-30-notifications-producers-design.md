# BELL-2b — 9 доменных продюсеров уведомлений (дизайн)

> **Дата:** 2026-06-30 · **Эпик:** BELL-2b (backend) · **Контракт:** `realtime/docs/handoff-notifications-feed-superapp.md` (§5, §9).
> **Цель:** оживить 9 не-матч-типов ленты — на доменные события писать строку в `notifications`.
> Матч-типы (`new_listing`/`price_drop`) и RPC/таблица/партиции/WS — **уже в проде** (realtime), их не трогаем.

---

## 0. Суть в одном абзаце

5 триггеров + 1 cron-задание (`SECURITY DEFINER`, минуют RLS) пишут одним `INSERT` в `notifications`
строку доменного события. WS-сигнал делать НЕ надо — на `notifications` уже висит `AFTER INSERT`-триггер
`bell_changed` от realtime, он пинает сокет на каждый наш INSERT. Схема `data` берётся из **уже
задеплоенного фронт-презентера** (`src/app/mrsqm/util/notification-presenter.ts`) — это реальный приёмник.

---

## 1. Источник правды — факты из прода (проверено 2026-06-30)

CHECK-констрейнты (authoritative, не из доков):

| Таблица.колонка             | Допустимые значения                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `properties.status`         | `draft`, `pending_review`, `active`, `rejected`, `expired`, `archived_sold`, `archived_withdrawn` |
| `friendships.status`        | `pending`, `accepted`, `rejected`                                                                 |
| `friendships.source`        | `referral`, `manual`, `system`                                                                    |
| `referrals.status`          | `pending`, `completed`, `failed`                                                                  |
| `subscriptions.status`      | `active`, `expired`, `cancelled`                                                                  |
| `subscription_gifts.source` | `registration`, `referral`, `admin`                                                               |

Ключевые колонки:

- `properties`: `id`, `owner_id`, `status`, `bedrooms`, `price`, `price_currency`, `location_id`, `rejection_reason` (есть в проде; пишет модератор Админки cross-repo).
- `property_photos`: `property_id`, `thumb_url`, `order_index` → обложка = `ORDER BY order_index LIMIT 1`.
- `property_comments`: `id`, `property_id`, `user_id`, `body`, `parent_id`, `deleted_at`.
- `friendships`: `user_id`, `friend_id`, `status`, `source`, `requested_by`.
- `referrals`: `referrer_id`, `referred_id`, `status`, `trigger_event` — **строка создаётся при регистрации со `status='pending'`** (architecture.md §153 п.8), бонус рефереру — позже при активации.
- `subscription_gifts`: `user_id`, `granted_by`, `months`, `source`.
- `subscriptions`: `user_id`, `plan`, `status`, `current_period_end`.
- `users.full_name`; `user_settings.photo_url` (аватар); `locations.name` (метка района).

Существующих триггеров, пишущих в `notifications`, **нет** (проверено) → конфликтов нет.
`notify_subscription_gift` пишет в `user_events` (другая таблица) → P8 не конфликтует.

---

## 2. Архитектура — 5 триггеров + 1 cron

| #   | Объект                                                                                                     | Событие (точное условие)                                                       | Тип                       | Получатель                 | `entity_id`   | `thumb_url`       | `data`                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------- | -------------------------- | ------------- | ----------------- | --------------------------------------------------- |
| P1  | `properties` AFTER UPDATE `WHEN (OLD.status IS DISTINCT FROM NEW.status)`                                  | `OLD.status='pending_review' AND NEW.status='active'`                          | `listing_approved`        | `owner_id`                 | `id`          | обложка           | `{bedrooms, location_label, price, price_currency}` |
| P2  | ↑ та же функция                                                                                            | `OLD.status='pending_review' AND NEW.status='rejected'`                        | `listing_rejected`        | `owner_id`                 | `id`          | обложка           | `{reason: rejection_reason}`                        |
| P3  | ↑ та же функция                                                                                            | `OLD.status='active' AND NEW.status IN ('archived_sold','archived_withdrawn')` | `listing_archived`        | `owner_id`                 | `id`          | обложка           | `{bedrooms, location_label, price, price_currency}` |
| P4  | `friendships` AFTER INSERT `WHEN (NEW.status='pending' AND NEW.source='manual')`                           | INSERT ручного запроса                                                         | `friend_request`          | адресат (≠ `requested_by`) | id инициатора | аватар инициатора | `{name: full_name инициатора}`                      |
| P5  | `friendships` AFTER UPDATE `WHEN (OLD.status='pending' AND NEW.status='accepted' AND NEW.source='manual')` | принятие                                                                       | `friend_request_accepted` | `requested_by`             | id принявшего | аватар принявшего | `{name: full_name принявшего}`                      |
| P6  | `property_comments` AFTER INSERT `WHEN (NEW.deleted_at IS NULL)`                                           | новый коммент (не свой)                                                        | `new_comment`             | `owner_id` листинга        | `property_id` | обложка           | `{comment_text: body}`                              |
| P7  | `referrals` AFTER INSERT                                                                                   | регистрация по ссылке (не self)                                                | `referral_registered`     | `referrer_id`              | `referred_id` | аватар реферала   | `{name: full_name реферала}`                        |
| P8  | `subscription_gifts` AFTER INSERT `WHEN (NEW.source <> 'registration')`                                    | начисление бонуса                                                              | `bonus_month_granted`     | `user_id`                  | NULL          | NULL              | `{months}`                                          |
| P9  | pg_cron, ежедневно                                                                                         | pro+active, `current_period_end` ∈ (now, now+7д], дедуп                        | `subscription_expiring`   | `user_id`                  | NULL          | NULL              | `{expires_at: current_period_end}`                  |

**Получатель в P4/P5 (робастно, без догадок о конвенции):**
`recipient = CASE WHEN requested_by = user_id THEN friend_id ELSE user_id END`; «другой» = `requested_by`.

**P6 skip-self:** если автор коммента = владелец листинга (`NEW.user_id = owner_id`) — не писать.
**P7 skip-self:** если `referrer_id = referred_id` — не писать.

---

## 3. Решённые продуктовые развилки (создатель, 2026-06-30)

1. **Статусы листинга** — только переходы модерации (P1–P3 выше). Мгновенная публикация своих network-объектов уведомление НЕ шлёт.
2. **Текст листинга** — структурные поля в `data` + правка фронт-презентера (см. §5). Формат строки — в одном месте.
3. **Бонус-месяц** — все source, кроме `registration` (P8).
4. **Истечение подписки** — один раз за период, дедуп (P9).

---

## 4. Общие хелперы (DRY в SQL — один раз на подсистему, не inline ×5)

Маленькие `STABLE`-функции в `public` (или inline-подзапросы, если ревью предпочтёт — решит план):

- `_notif_property_thumb(p_property_id uuid) → text` — `SELECT thumb_url FROM property_photos WHERE property_id=$1 ORDER BY order_index LIMIT 1`.
- аватар: `SELECT photo_url FROM user_settings WHERE user_id=$1`.
- имя: `SELECT full_name FROM users WHERE id=$1`.
- метка локации: `SELECT name FROM locations WHERE id = <property.location_id>`.

**Все продюсер-функции:** `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, владелец — привилегированная роль (`postgres`/`supabase_admin`). Без `SET search_path` SECURITY DEFINER — дыра/поломка.

---

## 5. Правка фронта (один презентер)

`src/app/mrsqm/util/notification-presenter.ts`: `listing_approved` и `listing_archived` сейчас рисуют
`detail: (d) => str(d, 'title')`. Заменить на композитор из структурных полей (как `matchDetail`):

```ts
const listingDetail = (d) => {
  const br = num(d, 'bedrooms');
  const loc = str(d, 'location_label');
  const price = num(d, 'price');
  return [br != null ? `${br}br` : '', loc, fmtMoney(price)].filter((p) => p).join(' · ');
};
```

`listing_rejected` остаётся `str(d, 'reason')`. Обновить co-located spec презентера.
`subscription_expiring.detail` сейчас сырой `str(d,'expires_at')` — форматирование даты вынесено в
отдельный фронт-бэклог (handoff «Next»), здесь продюсер просто кладёт timestamptz.

---

## 6. P9 — дедуп без хрупкости

Cron-функция `notify_subscriptions_expiring()` (вызывается pg_cron ежедневно). Для каждой строки
`subscriptions WHERE plan='pro' AND status='active' AND current_period_end BETWEEN now() AND now()+interval '7 days'`
писать `subscription_expiring`, **только если** этому юзеру ещё не слали за этот период:

```sql
WHERE NOT EXISTS (
  SELECT 1 FROM notifications n
  WHERE n.user_id = s.user_id
    AND n.type = 'subscription_expiring'
    AND (n.data->>'expires_at')::timestamptz = s.current_period_end  -- обе стороны timestamptz, не текст
)
```

Можно переиспользовать существующую `get_pro_expiring_soon(7)` как источник набора (она уже фильтрует pro+active+окно).

---

## 7. ai_digest — НЕ здесь

`ai_digest` (12-й тип) — продюсер на стороне **gpt** (`~/Projects/gpt`), пишет в `notifications` тем же
`INSERT … data {summary}`. В этом эпике НЕ реализуется. Для gpt-чата — отдельный handoff (граница:
из superApp-сессии gpt не трогаем). Здесь только зафиксировать это инструкцией.

---

## 8. Верификация (после каждого продюсера — по брифу)

Для каждого P1–P9: спровоцировать событие в проде безопасным способом (точечный UPDATE/INSERT на
тестовом юзере/объекте, либо ручной вызов cron-функции для P9) → `SELECT … FROM notifications` →
подтвердить наличие строки с корректным `type`/`data`/`entity_id`/`thumb_url` → подтвердить, что
`get_notifications` отдаёт её в ленте. Результаты — в `docs/tests.md` (T-N).

---

## 9. Риски

- **Hot path `properties`:** `WHEN (OLD.status IS DISTINCT FROM NEW.status)` — тело не крутится на правках цены/`last_actualized_at`.
- **Кросс-репо актор:** статус листинга меняет модератор Админки (другой репо) — триггер на `properties` ловит независимо от инициатора, `SECURITY DEFINER` проводит INSERT мимо RLS.
- **Ложные friend_request:** фильтр `source='manual'` в P4/P5 — авто-дружба от рефералов/системы не шлёт «запрос в друзья».
- **Двойной flip статуса** (pending→active→pending→active) → дубль уведомления. Редкий кейс, допустимо в v1.
- **Все изменения БД** — высокий риск (общая Supabase); каждая миграция — только по явному «да», apply через `.claude/skills/migrate/tools/apply-migration.sh`, файлы в `docs/migrations/`.

---

## 10. Карта связей (что перезапускать)

| Правка                         | Затрагивает                                                        |
| ------------------------------ | ------------------------------------------------------------------ |
| Схема `data` любого типа       | соответствующий продюсер + фронт-презентер (один тип = одна ветка) |
| Формат метки листинга          | только `listingDetail` в презентере (структурные поля стабильны)   |
| DDL `notifications` (realtime) | все продюсеры (INSERT-контракт) — но DDL не меняем                 |

---

## 11. Definition of Done

- [ ] 5 миграций-триггеров + 1 cron в `docs/migrations/applied/`, применены и верифицированы в проде.
- [ ] Все продюсер-функции `SECURITY DEFINER SET search_path=public`.
- [ ] P4/P5 фильтруют `source='manual'`; P6/P7 skip-self; P8 skip `registration`; P9 дедуп timestamptz.
- [ ] Фронт-презентер: `listing_approved/archived` → структурный композитор; spec обновлён; `checkFile` зелёный.
- [ ] T-N в `docs/tests.md` по каждому продюсеру: событие → строка в `notifications` → видна в `get_notifications`.
- [ ] `ai_digest` вынесен инструкцией для gpt (этот эпик не реализует).
