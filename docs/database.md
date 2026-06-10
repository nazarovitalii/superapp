# Database Architecture — MrSQM (superapp)

Supabase (PostgreSQL self-hosted на VPS `ubuntu@51.83.197.222`).  
Клиент использует `VITE_SUPABASE_ANON_KEY` — доступ к приватным данным регулируется **RLS**.  
Последнее обновление: 2026-06-09.

**Рутина:** при каждой миграции обновляй этот файл.

---

## Принципы архитектуры

| Таблица | Роль |
|---|---|
| `users` | Идентификаторы и системные флаги. Источник правды по identity |
| `user_settings` | Профессиональный профиль брокера — редактируется самим пользователем |
| `user_identities` | Официальные данные из госреестра — меняет только система или admin |
| `user_context` | Всё для AI — никогда не является источником правды, обновляется триггерами |
| `user_events` | Лог всех событий пользователя — читается N8N для уведомлений |
| `subscriptions` | Активная подписка пользователя |
| `subscription_gifts` | История подарочных месяцев подписки |
| `plans` | Тарифные планы (Free / Pro) |
| `agent_badge` | Текущий бейдж пользователя |
| `agent_activity` | Накопленный скор за всё время |
| `agent_score_events` | Лог каждого начисления/списания баллов |
| `sessions` | Оперативное состояние сессии в мессенджере |
| `friendships` | Связи между брокерами |
| `properties` | Листинги недвижимости (official + pocket) |
| `locations` | Иерархия локаций Dubai (country→city→community→…→building→checkpoint) |
| `saved_properties` | Избранные объекты пользователя |
| `saved_filters` | Сохранённые фильтры поиска |
| `referrals` | Рефералы между пользователями |
| `developers` | Застройщики |
| `location_developers` | Связь застройщик–локация (проекты) |
| `agencies` | Агентства |
| `agency_members` | Члены агентства |
| `brokers_registry` | Реестр RERA (только чтение) |
| `ai_configs` | Конфигурация — `reciprocity_none_fixed`, `nearby_radius_km` |
| `user_network` | Сеть пользователя: `friend_ids[]`, `colleague_ids[]` |

---

## Таблицы

### `users`
```
id                          uuid PK
telegram_id                 bigint UNIQUE
tg_username                 text
whatsapp_phone              text UNIQUE
full_name                   text NOT NULL
email                       text
phone                       text
role                        text DEFAULT 'agent'         -- agent/admin/moderator/superadmin
referral_code               text NOT NULL UNIQUE
referred_by                 uuid FK → users.id
channel_origin              text                          -- 'telegram' | 'whatsapp'
is_active                   boolean DEFAULT true
activated_at                timestamptz
whatsapp_verified           boolean DEFAULT false
email_verified              boolean DEFAULT false
email_verification_code     text
email_verification_expires  timestamptz
created_at                  timestamptz DEFAULT now()
updated_at                  timestamptz DEFAULT now()
```

### `user_settings`
```
user_id        uuid PK FK → users.id
photo_url      text
about          text
languages      text[]
service_areas  text[]
updated_at     timestamptz DEFAULT now()
```

### `user_identities`
```
id                    uuid PK
user_id               uuid UNIQUE FK → users.id
user_type             text DEFAULT 'individual'
broker_license        text
broker_license_expiry date
emirate_id            uuid FK → emirates.id
emirate_name          text
city_id               uuid FK → locations.id
agency_id             uuid FK → agencies.id
agency_name           text
created_at            timestamptz DEFAULT now()
```

### `user_context`
Денормализованный кэш для AI. Обновляется триггерами при изменении исходных таблиц.

```
user_id               uuid PK FK → users.id
full_name             text
channel_origin        text
whatsapp_verified     boolean
referral_code         text
created_at_user       timestamptz
broker_license        text
broker_license_expiry date
emirate_name          text
agency_name           text
city_id               uuid
plan                  text  DEFAULT 'free'
subscription_status   text
plan_expires_at       timestamptz
badge_level           text  DEFAULT 'starter'
score                 integer DEFAULT 0
active_listings       integer DEFAULT 0
total_listings_ever   integer DEFAULT 0
friends_count         integer DEFAULT 0
referrals_count       integer DEFAULT 0
comments_count        integer DEFAULT 0
pdf_generated_count   integer DEFAULT 0
total_searches        integer DEFAULT 0
saved_filters_count   integer DEFAULT 0
agency_members_count  integer DEFAULT 0
ai_context_text       text
recent_events         jsonb DEFAULT '[]'
last_active_at        timestamptz
recalculated_at       timestamptz DEFAULT now()
```

### `subscriptions`
При регистрации создаются **две записи**: Free (бессрочная) + Pro (через subscription_gifts).

```
id                    uuid PK
user_id               uuid NOT NULL FK → users.id
agency_id             uuid FK → agencies.id
plan                  text  -- 'free' | 'pro'
status                text  -- 'active' | 'expired'
current_period_start  timestamptz
current_period_end    timestamptz  -- NULL для Free (бессрочно)
gift_reason           text
gifted_by             uuid FK → users.id
created_at            timestamptz DEFAULT now()
updated_at            timestamptz DEFAULT now()
```

Запрос активного плана:
```sql
SELECT plan FROM subscriptions
WHERE user_id = $1
  AND status = 'active'
  AND (current_period_end IS NULL OR current_period_end > now())
ORDER BY CASE plan WHEN 'pro' THEN 1 ELSE 2 END
LIMIT 1
```

### `properties`
```
id                uuid PK
owner_id          uuid FK → users.id
deal_type         text -- 'sale' | 'rent'
listing_type      text -- 'official' | 'pocket'
price             numeric
price_currency    text DEFAULT 'AED'
price_period      text -- 'yearly' | 'monthly' (для rent)
bedrooms          integer
bathrooms         integer
area_sqft         numeric
location_id       uuid FK → locations.id
description       text
furnished         text -- 'yes' | 'no'
handover          text -- 'ready' | 'offplan'
completion_year   integer
completion_q      integer
is_distress       boolean DEFAULT false
visibility        text DEFAULT 'public' -- 'public' | 'network'
status            text DEFAULT 'active' -- 'active' | 'pending' | 'archived'
photos            text[]
published_at      timestamptz DEFAULT now()
created_at        timestamptz DEFAULT now()
updated_at        timestamptz DEFAULT now()
```

### `friendships`
```
id          uuid PK
user_id     uuid FK → users.id
friend_id   uuid FK → users.id
status      text -- 'pending' | 'accepted'
created_at  timestamptz DEFAULT now()
```

### `saved_properties`
```
user_id      uuid FK → users.id
property_id  uuid FK → properties.id
saved_at     timestamptz DEFAULT now()
PRIMARY KEY (user_id, property_id)
```

### `referrals`
```
id          uuid PK
referrer_id uuid FK → users.id
referred_id uuid FK → users.id
status      text -- 'pending' | 'activated' | 'rewarded'
months      integer -- бонус рефереру
created_at  timestamptz DEFAULT now()
```

---

## Триггеры

| Триггер | Таблица | Что делает |
|---|---|---|
| `trg_apply_subscription_gift` | `subscription_gifts` INSERT | Создаёт Pro запись в `subscriptions` |
| `trg_notify_subscription_gift` | `subscription_gifts` INSERT | Создаёт `user_event` |
| `trg_sync_context_subscription` | `subscriptions` | Обновляет `user_context.plan`, `plan_expires_at` |
| `trg_activate_on_property` | `properties` INSERT (status=active) | Устанавливает `users.activated_at`, начисляет реф-бонус |
| `trg_activate_on_filter` | `saved_filters` INSERT | Устанавливает `users.activated_at`, начисляет реф-бонус |
| `sync_geom` | `locations` INSERT/UPDATE | Автоматически заполняет `geom` из `lat/lng` |
| `trg_agent_score_agg` | `agent_score_events` INSERT | `UPDATE agent_activity SET score = score + NEW.points` |

---

## RPC-функции

### Поиск и лента

#### `get_feed(p_deal_type, ...)`
Главная поисковая функция. Применяет правила reciprocity по плану пользователя.

Параметры: `p_deal_type`* · `p_user_id` · `p_city_id` · `p_location_ids` · `p_bedrooms` ·
`p_price_min/max` · `p_price_currency` · `p_listing_type` · `p_sort_by` (default|price_asc|price_desc|date_desc|date_asc) · `p_limit` (20) · `p_offset` (0)

Ответ:
```json
{
  "results": [ /* поля properties + location_name, developer_name, owner_badge_level, is_network */ ],
  "count_visible": 6,
  "count_hidden": 27,
  "count_nearby": 14,
  "plan": "free",
  "limit": 20,
  "offset": 0
}
```

Правила видимости:
- Объекты из `user_network` — всегда, без лимита
- Public объекты для Free — первые N из `ai_configs.reciprocity_none_fixed` (= 5)
- Public объекты для Pro — все

#### `get_property(p_property_id)`
Карточка объекта со всеми деталями. Включает данные агента.
Контакты агента — null для Free, если владелец не в сети.

#### `search_locations(p_query, p_city_id?, p_limit?)`
Автокомплит локаций. Мин. 2 символа, debounce 300ms.

#### `get_filter_options(p_unit_type_id?, p_category_id?)`
Справочники для UI фильтров. Вызывается один раз при инициализации.

#### `get_similar_properties(p_property_id, p_limit?)`
Похожие объекты. Каскадный поиск вверх по иерархии локаций до community.

#### `get_agent_listings(p_agent_id, p_limit?, p_offset?)`
Объекты агента. Видимость зависит от отношения текущего пользователя к агенту.

### Сохранение и избранное

#### `save_property(p_property_id)` — toggle
```json
{ "action": "saved"|"removed", "property_id": "uuid" }
```

#### `get_saved_properties(p_limit?, p_offset?)`
Избранные объекты + `saved_at`. Сортировка: `saved_at DESC`.

#### `save_filter(p_filters, p_auto_name?, p_city_id?, p_notification_type?)`
#### `get_saved_filters()`
#### `delete_filter(p_filter_id)`

### Аналитика

#### `track_view(p_property_id)` — fire and forget
Записывает просмотр карточки. Не считает просмотры владельца своего объекта.

#### `track_impressions(p_property_ids)` — fire and forget
Записывает показы в ленте батчем.

#### `get_property_viewers(p_property_id, p_limit?, p_offset?)` — Pro only
Кто смотрел объект.

### Публикация

#### `publish_property(...)` — основной insert
Создаёт новый листинг. Pocket listing — только для Pro-пользователей.

---

## RLS-политики

| Таблица | Операция | Правило |
|---|---|---|
| `users` | SELECT | Только своя строка (`id = auth.uid()`) |
| `user_settings` | SELECT/UPDATE | Только свои (`user_id = auth.uid()`) |
| `user_identities` | SELECT | Только свои |
| `user_context` | SELECT | Только свои |
| `subscriptions` | SELECT | Только свои |
| `properties` | SELECT | `status='active'` AND (`visibility='public'` OR владелец в `user_network`) |
| `saved_properties` | ALL | Только свои (`user_id = auth.uid()`) |
| `saved_filters` | ALL | Только свои |
| `brokers_registry` | SELECT | Публичный |

---

## Индексы

```sql
idx_properties_status_visibility  ON properties(status, visibility)
idx_properties_deal_type          ON properties(deal_type)
idx_properties_location_id        ON properties(location_id)
idx_properties_owner_id           ON properties(owner_id)
idx_properties_price              ON properties(price)
idx_properties_published_at       ON properties(published_at DESC)
idx_properties_bedrooms           ON properties(bedrooms)
idx_locations_parent_id           ON locations(parent_id)
idx_locations_level               ON locations(level)
idx_locations_geom                ON locations USING GIST(geom)
idx_subscriptions_user_status     ON subscriptions(user_id, status)
idx_user_network_user_id          ON user_network(user_id)
```
