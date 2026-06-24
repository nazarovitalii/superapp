# База данных MrSQM — полный справочник

> Последнее обновление: 2026-06-10 (схема), журнал изменений ниже.
> Источник: живая Supabase `supaprod.mrsqm.com` (контейнер `supabase-db-…`), чтение схемы из `pg_catalog`.
> **Покрытие:** колонки таблиц, сигнатуры **и тела** всех клиентских RPC, триггеры, RLS-политики, enum-значения (CHECK).
> БД общая с парсерами; `bayut_*`, `scrape_*`, `v5_*`, бэкапы и админ-служебное — не документированы.

## ⚙️ Журнал изменений схемы (прим\* — тела функций ниже могут быть устаревшими)

| Дата       | Объект                                                                                         | Что                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Миграция                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-24 | `properties`, `get_property()`                                                                 | LM-3: +колонка `rejection_reason text` (заметка модератора при reject). `get_property` отдаёт поле ТОЛЬКО владельцу (`CASE WHEN p.owner_id = v_current_user_id`, как whatsapp/license); чужому NULL (защита PII конкурентам). Staleness-proof DO-патч (regexp-якорь status,p.status; флаг g — все json-ветки). Колонку пишет модератор Админки (cross-repo); мы читаем.                                                                                                                                                          | `…/applied/2026-06-24-lm3-rejection-reason.sql`                                                                                                                                    |
| 2026-06-23 | `get_feed()`                                                                                   | R4 (путь A) — per-filter `is_unseen`: +`p_filter_id uuid` (DROP+CREATE 46→47 арг). При передаче `is_unseen` считается формулой бейджа 1:1 (`filter_matches`+`user_filter_seen`, re-notify), иначе прежнее глобальное (`user_seen_listings.shown_at`) → лента и жёлтый бейдж синхронны. Аддитивный `DEFAULT NULL` = обратная совместимость. ROLLBACK-смоук поймал missing `;` после `$function$`.                                                                                                                                 | `…/applied/2026-06-23-get-feed-per-filter-unseen.sql`                                                                                                                              |
| 2026-06-23 | `get_feed()`                                                                                   | Эпик SC — серверный охват: +`p_scope` ('all'/'friends'/'my'), +`p_my_status` ('all'/'active'/'archived'/'rejected'/'expired'/'pending'). Дублированный COUNT/SELECT WHERE слит в ЕДИНЫЙ проход (CTE `base MATERIALIZED` + `count(*) OVER()` + `row_number()`, tiebreaker `p.id`). Scope-предикат §3.2: all = active∧не-свой∧(public∨network-в-сети); friends = active∧не-свой∧network-в-сети; my = свои по p_my_status. **P2-фикс**: network ограничен сетью юзера (`owner=ANY(v_network_ids)`). Полный DROP+CREATE (44→46 арг). | `…/applied/2026-06-23-get-feed-scope-rework.sql`                                                                                                                                   |
| 2026-06-23 | `get_saved_filters()`                                                                          | My-фильтры (`sf.filters->>'scope'='my'`) → `unseen_count=0` (жёлтого бейджа нет). Staleness-proof DO-патч (обёртка re-notify формулы в CASE по scope).                                                                                                                                                                                                                                                                                                                                                                           | `…/applied/2026-06-23-get-saved-filters-my-scope-zero.sql`                                                                                                                         |
| 2026-06-23 | `get_feed()`                                                                                   | Публичный адрес восстановлен (был потерян при DROP+CREATE 2026-06-21): `public_location_name`/`public_community_name` = `COALESCE(public-локация по public_location_id, полная локация)`. Модель приватности (бегунок add-property): `public_location_id` NULL → owner раскрыл ПОЛНЫЙ адрес (дефолт=leaf); задан → урезано до уровня (минимум community). ⚠️ Инвертирует старый V-10 (2026-06-18 «полный только владельцу») — теперь по умолчанию полный. CREATE OR REPLACE (сигнатура та же).                                   | `…/applied/2026-06-23-get-feed-public-address.sql`                                                                                                                                 |
| 2026-06-23 | `property_matches_filter()` (realtime-owned)                                                   | SC-8: матчер зеркалит суженный get_feed §3.2 — scope-ветка (my→не матчит; all=public∨network-в-сети; friends=network-в-сети), owner-skip, сеть из `user_network`. Применено мной на общий прод; файл и откат живут в репо realtime (`migrations/product/015_scope_predicate.{up,down}.sql`).                                                                                                                                                                                                                                     | (realtime `015_scope_predicate.up.sql`)                                                                                                                                            |
| 2026-06-22 | `filter_matches`, `mark_listings_shown()` overload, `get_saved_filters()`                      | Стадия 3 + realtime: `filter_matches += matched_at` (NOT NULL DEFAULT now(); matcher realtime пишет на матч/price_drop); перегрузка `mark_listings_shown(uuid[], uuid)` для gpt-бота (GRANT только `service_role`; явный REVOKE с `anon`/`authenticated` — Supabase default-privileges, не PUBLIC); `get_saved_filters.unseen_count` → LIVE COUNT по `MAX(matched_at) > shown_at` (Прил. A, было хранимое `sf.unseen_count`).                                                                                                    | `…/applied/2026-06-22-filter-matches-add-matched-at.sql`, `…/applied/2026-06-22-mark-listings-shown-server-overload.sql`, `…/applied/2026-06-22-get-saved-filters-live-unseen.sql` |
| 2026-06-22 | `user_seen_listings`, `mark_listing_contact()` (новый), `get_listing_delivery_stats()` (новый) | Стадия 2 воронка владельца: +колонка `contact_at` (сигнал `seen_contact` — нажатие WA/TG); RPC `mark_listing_contact(uuid)` (bump contact_at+seen_at+shown_at, owner-skip); RPC `get_listing_delivery_stats(uuid)` — owner-only, 3 DISTINCT-COUNT (preview/full/contact).                                                                                                                                                                                                                                                        | `…/applied/2026-06-22-user-seen-listings-add-contact-at.sql`, `…/applied/2026-06-22-mark-listing-contact.sql`, `…/applied/2026-06-22-get-listing-delivery-stats.sql`               |
| 2026-06-22 | `user_seen_listings`                                                                           | Стадия 1 unseen-трекинга: +колонка `shown_at timestamptz` (impression «показан в ленте»); снят `NOT NULL` с `seen_at` (нужна строка «показан, но не открыт»).                                                                                                                                                                                                                                                                                                                                                                    | `…/applied/2026-06-22-user-seen-listings-add-shown-at.sql`, `…/applied/2026-06-22-user-seen-listings-seen-at-nullable.sql`                                                         |
| 2026-06-22 | `mark_listings_shown()` (новый), `track_view()`                                                | Стадия 1: новый bulk-RPC `mark_listings_shown(p_property_ids uuid[])` — bump `shown_at=now()` (auth.uid()×объект, owner-skip, SECURITY DEFINER). `track_view` фикс: bump `seen_at`+`shown_at` на КАЖДОМ открытии (гард «раз в день» снят), `unique_views_count++` только при первом касании пары; `search_path 'public','extensions'` сохранён.                                                                                                                                                                                  | `…/applied/2026-06-22-mark-listings-shown.sql`, `…/applied/2026-06-22-track-view-every-open.sql`                                                                                   |
| 2026-06-22 | `get_feed()`                                                                                   | Стадия 1: +поле `is_unseen` в jsonb-вывод — `GREATEST(created_at,updated_at) > COALESCE(shown_at,'epoch')` (объект новее последнего показа в ленте, Прил. D). Staleness-proof DO-патч (якорь `community_name`).                                                                                                                                                                                                                                                                                                                  | `…/applied/2026-06-22-get-feed-is-unseen.sql`                                                                                                                                      |
| 2026-06-22 | `get_property()`                                                                               | Дедупликация пути: узел-лист больше не дублируется, если он самоссылочен в любой колонке-предке (`cluster_id=self`, `sub_community_id=self` и пр.). Было: `CASE WHEN l.building_id = l.id THEN NULL ELSE l.name END`. Стало: `CASE WHEN l.id IN (l.community_id, l.sub_community_id, l.cluster_id, l.building_id) THEN NULL ELSE l.name END` — аналогично для `pl` (public_location_path). Staleness-proof DO-патч.                                                                                                              | `…/applied/2026-06-22-get-property-dedup-self-ref-path.sql`                                                                                                                        |
| 2026-06-21 | `get_feed()`                                                                                   | Раунд 2.1 «панель v2.1»: заселённость МУЛЬТИСЕЛЕКТ — `p_occupancy_status text` → `text[]` (DROP+CREATE; тело `= ANY(p_occupancy_status)`).                                                                                                                                                                                                                                                                                                                                                                                       | `…/applied/2026-06-21-get-feed-occupancy-multiselect.sql`                                                                                                                          |
| 2026-06-21 | `get_feed()`                                                                                   | Раунд 2 «Фильтры v2»: смена сигнатуры (полный DROP+CREATE). Убран `p_is_distress`; `p_floor_level_id uuid`→`p_floor_level_ids uuid[]`; `p_floors_in_unit text[]`→`p_floors_in_unit_ids uuid[]` (фикс: фильтр шёл по мёртвой text-колонке, теперь по `floors_in_unit_id`); +`p_cheques int[]`/`p_is_study`/`p_is_reduced`/`p_is_below_op`/`p_is_vastu`. Из jsonb-вывода убраны `is_distress`/`is_negotiable` (терминированы), `floors_in_unit`→`floors_in_unit_id`.                                                               | `…/applied/2026-06-21-get-feed-filters-v2.sql`                                                                                                                                     |
| 2026-06-21 | `properties`, `get_property()`, триггер `trg_property_price_flags`                             | Раунд 1 «новые поля»: колонка `floors_in_unit_id` (uuid → property_type_values, бэкфилл из text `floors_in_unit`, старая колонка legacy); `get_property` отдаёт `floors_in_unit_id` + `is_reduced`/`is_below_op` (staleness-proof DO-патч, якорь на запятую — `\b` в Postgres = backspace). Новый триггер `set_property_price_flags()` BEFORE INSERT/UPDATE: `is_below_op` (производное), `is_reduced` (sticky). Колонки `is_study`/`original_price`/`is_below_op`/`is_reduced`/`cheques` уже существовали.                      | `…/applied/2026-06-21-floors-in-unit-uuid.sql`, `…/applied/2026-06-21-property-price-flags-trigger.sql`                                                                            |
| 2026-06-18 | `get_property()`                                                                               | Приватность адреса (V-10/V-11): не-владельцу со скрытым адресом не отдаётся `location_full_path`, `location_name`=публичный leaf. Пост-обработка `v_result` перед RETURN (staleness-proof DO-патч).                                                                                                                                                                                                                                                                                                                              | `…/applied/2026-06-18-get-property-private-address.sql`                                                                                                                            |
| 2026-06-18 | `get_feed()`                                                                                   | Приватность адреса (V-10): `location_name`/`community_name` гейтятся (полный только владельцу/нескрытым); добавлены `public_location_name`/`public_community_name`. Точечный DO-патч (staleness-proof).                                                                                                                                                                                                                                                                                                                          | `…/applied/2026-06-18-get-feed-private-address.sql`                                                                                                                                |
| 2026-06-18 | `get_feed()`                                                                                   | Сортировка по дате (`p_sort_by` default/date_desc/date_asc) — `published_at` → `COALESCE(last_actualized_at, published_at)`: лента показывала дату актуализации, а сортировалась по публикации (U-3). Патч ORDER BY через `pg_get_functiondef` (staleness-proof).                                                                                                                                                                                                                                                                | `…/applied/2026-06-18-get-feed-sort-by-actualized.sql`                                                                                                                             |
| 2026-06-22 | `activate_user()`                                                                              | **SECURITY DEFINER** (было INVOKER). Цепочка триггера: `INSERT properties(active)` → `trg_activate_on_property` → `activate_user()` → `INSERT agent_score_events` → `trg_sync_activity_score` → `INSERT agent_activity` [RLS on, нет INSERT-политики] → **42501** для нового агента. Исправлено: функция выполняется под `supabase_admin` (bypassrls). Pre-existing юзеры не затронуты — `activated_at IS NOT NULL` выходит раньше. Это **продовый баг**: падало создание ПЕРВОГО active-объекта у ЛЮБОГО нового агента.         | `…/applied/2026-06-22-activate-user-security-definer.sql`                                                                                                                          |
| 2026-06-22 | `match_property(uuid)`, `match_filter(uuid)`                                                   | **Owner-skip (014)**: добавлено условие `sf.user_id IS DISTINCT FROM properties.owner_id` (NULL-safe) — владелец объекта не получает матч-нотификацию на свой же объект. `IS DISTINCT FROM` = корректно при NULL `owner_id`. Verif: `match_filter('9ad6160b-…')` = 2 (объекты test2), 12 своих исключены.                                                                                                                                                                                                                        | `…/applied/2026-06-22-match-owner-skip-014.sql`                                                                                                                                    |
| 2026-06-11 | `activate_user()`                                                                              | Триггер на `properties` падал (`NEW.user_id`, а поле `owner_id`) → INSERT объекта невозможен. Ветка по `TG_TABLE_NAME`.                                                                                                                                                                                                                                                                                                                                                                                                          | `docs/migrations/applied/2026-06-11-fix-activate-user-owner-id.sql`                                                                                                                |
| 2026-06-11 | `get_feed()`                                                                                   | Добавлен `LEFT JOIN locations lc ON lc.id = l.community_id` + поле `community_name` в jsonb-вывод.                                                                                                                                                                                                                                                                                                                                                                                                                               | `…/2026-06-11-get-feed-add-community-name.sql`                                                                                                                                     |
| 2026-06-11 | `get_agent_listings()`                                                                         | Был сломан (`>100 args` в одном `jsonb_build_object`, ошибка 54023). Разбит на два через `\|\|`.                                                                                                                                                                                                                                                                                                                                                                                                                                 | `…/2026-06-11-fix-get-agent-listings-jsonb-limit.sql`                                                                                                                              |
| 2026-06-16 | `update_property()`, `actualize_property()`, `archive_property()`                              | Новые SECURITY DEFINER RPC для действий владельца над своим объектом (на `properties` нет UPDATE-RLS). Каждая проверяет `owner_id = auth.uid()`; правят только цену+описание / `last_actualized_at` / `status`.                                                                                                                                                                                                                                                                                                                  | `…/2026-06-16-property-owner-actions.sql`                                                                                                                                          |

> Известные **серверные баги (не чинены)**: на `properties` нет DELETE-RLS-политики
> (удаление объекта с клиента невозможно — для «снять» используется `archive_property`);
> на `users` нет self-UPDATE RLS (только `admins_update`) — агент не может править свои контакты.

---

## Enum-значения (из CHECK-констрейнтов)

| Поле                              | Допустимые значения                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `deal_type`                       | sale, rent                                                                          |
| `listing_type`                    | pocket, official                                                                    |
| `visibility`                      | public, network (drafts: + private)                                                 |
| `status (properties)`             | draft, pending_review, active, rejected, expired, archived_sold, archived_withdrawn |
| `furnished`                       | furnished, unfurnished                                                              |
| `handover`                        | ready, offplan                                                                      |
| `occupancy_status`                | vacant, occupied, vacant_on_transfer                                                |
| `price_period`                    | yearly, monthly                                                                     |
| `completion_q`                    | Q1, Q2, Q3, Q4                                                                      |
| `subscriptions.plan`              | trial, free, pro, agency                                                            |
| `subscriptions.status`            | active, expired, cancelled                                                          |
| `saved_filters.notification_type` | realtime, digest                                                                    |
| `users.role`                      | agent, moderator, admin, superadmin                                                 |
| `users.channel_origin`            | telegram, whatsapp                                                                  |

---

## Иерархия локаций

```
country → city → community → sub_community → cluster → building → checkpoint
```

`p_location_ids` принимает UUID любого уровня — поиск охватывает все дочерние.

---

## RPC — клиентские (с телами)

`SECURITY DEFINER`, `auth.uid()` из JWT. `p_user_id` в сигнатуре — для service_role (n8n), из клиента не передаётся.

### `get_feed`

> ⚠️ **Тело и параметры ниже УСТАРЕЛИ (до-SC, 2026-06-21).** Актуальное тело — в применённых миграциях
> 2026-06-23: `applied/2026-06-23-get-feed-scope-rework.sql` (единый CTE, +`p_scope`/`p_my_status`, P2-фикс)
>
> - `applied/2026-06-23-get-feed-public-address.sql` (`public_location_name`/`public_community_name` = COALESCE(public, full)).
>   Источник истины — живой `pg_get_functiondef('public.get_feed')`, не блок ниже. Сигнатура сейчас **47 арг**
>   (хвост: `…, p_is_vastu boolean, p_scope text DEFAULT 'all', p_my_status text DEFAULT 'all', p_filter_id uuid DEFAULT NULL`).
>   ✅ **ПРИМЕНЕНО 2026-06-23** (R4, путь A): `applied/2026-06-23-get-feed-per-filter-unseen.sql` — +`p_filter_id uuid` (→ 47 арг, DROP+CREATE). При передаче `is_unseen` считается per-filter (`filter_matches`
> - `user_filter_seen`, формула бейджа 1:1), иначе прежнее глобальное (`user_seen_listings.shown_at`).
>   Аддитивный `DEFAULT NULL` → обратная совместимость (старые вызовы без p_filter_id = прежнее поведение).
>   ROLLBACK-смоук поймал отсутствующий `;` после `$function$` (починен до применения).

**Возвращает:** `jsonb`

**Параметры:** `p_deal_type text`, `p_user_id uuid DEFAULT NULL::uuid`, `p_city_id uuid DEFAULT NULL::uuid`, `p_category_id uuid DEFAULT NULL::uuid`, `p_unit_type_id uuid DEFAULT NULL::uuid`, `p_sub_type_ids uuid[] DEFAULT NULL::uuid[]`, `p_location_ids uuid[] DEFAULT NULL::uuid[]`, `p_developer_ids uuid[] DEFAULT NULL::uuid[]`, `p_developer_name text DEFAULT NULL::text`, `p_bedrooms integer[] DEFAULT NULL::integer[]`, `p_bathrooms integer[] DEFAULT NULL::integer[]`, `p_is_maid boolean DEFAULT NULL::boolean`, `p_is_hotel_pool boolean DEFAULT NULL::boolean`, `p_furnished text DEFAULT NULL::text`, `p_floor_level_ids uuid[] DEFAULT NULL::uuid[]`, `p_floors_in_unit_ids uuid[] DEFAULT NULL::uuid[]`, `p_area_sqft_min numeric DEFAULT NULL::numeric`, `p_area_sqft_max numeric DEFAULT NULL::numeric`, `p_plot_sqft_min numeric DEFAULT NULL::numeric`, `p_plot_sqft_max numeric DEFAULT NULL::numeric`, `p_price_min numeric DEFAULT NULL::numeric`, `p_price_max numeric DEFAULT NULL::numeric`, `p_price_currency text DEFAULT 'AED'::text`, `p_price_period text DEFAULT NULL::text`, `p_view_ids text[] DEFAULT NULL::text[]`, `p_position_ids text[] DEFAULT NULL::text[]`, `p_amenity_ids text[] DEFAULT NULL::text[]`, `p_listing_type text DEFAULT NULL::text`, `p_occupancy_status text[] DEFAULT NULL::text[]`, `p_handover text DEFAULT NULL::text`, `p_completion_year integer[] DEFAULT NULL::integer[]`, `p_completion_q text[] DEFAULT NULL::text[]`, `p_description text DEFAULT NULL::text`, `p_lat numeric DEFAULT NULL::numeric`, `p_lng numeric DEFAULT NULL::numeric`, `p_exclude_location_ids uuid[] DEFAULT NULL::uuid[]`, `p_sort_by text DEFAULT 'default'::text`, `p_limit integer DEFAULT 20`, `p_offset integer DEFAULT 0`, `p_cheques integer[] DEFAULT NULL::integer[]`, `p_is_study boolean DEFAULT NULL::boolean`, `p_is_reduced boolean DEFAULT NULL::boolean`, `p_is_below_op boolean DEFAULT NULL::boolean`, `p_is_vastu boolean DEFAULT NULL::boolean`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_feed(p_deal_type text, p_user_id uuid DEFAULT NULL::uuid, p_city_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_unit_type_id uuid DEFAULT NULL::uuid, p_sub_type_ids uuid[] DEFAULT NULL::uuid[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_developer_ids uuid[] DEFAULT NULL::uuid[], p_developer_name text DEFAULT NULL::text, p_bedrooms integer[] DEFAULT NULL::integer[], p_bathrooms integer[] DEFAULT NULL::integer[], p_is_maid boolean DEFAULT NULL::boolean, p_is_hotel_pool boolean DEFAULT NULL::boolean, p_furnished text DEFAULT NULL::text, p_floor_level_ids uuid[] DEFAULT NULL::uuid[], p_floors_in_unit_ids uuid[] DEFAULT NULL::uuid[], p_area_sqft_min numeric DEFAULT NULL::numeric, p_area_sqft_max numeric DEFAULT NULL::numeric, p_plot_sqft_min numeric DEFAULT NULL::numeric, p_plot_sqft_max numeric DEFAULT NULL::numeric, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_price_currency text DEFAULT 'AED'::text, p_price_period text DEFAULT NULL::text, p_view_ids text[] DEFAULT NULL::text[], p_position_ids text[] DEFAULT NULL::text[], p_amenity_ids text[] DEFAULT NULL::text[], p_listing_type text DEFAULT NULL::text, p_occupancy_status text[] DEFAULT NULL::text[], p_handover text DEFAULT NULL::text, p_completion_year integer[] DEFAULT NULL::integer[], p_completion_q text[] DEFAULT NULL::text[], p_description text DEFAULT NULL::text, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_exclude_location_ids uuid[] DEFAULT NULL::uuid[], p_sort_by text DEFAULT 'default'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_cheques integer[] DEFAULT NULL::integer[], p_is_study boolean DEFAULT NULL::boolean, p_is_reduced boolean DEFAULT NULL::boolean, p_is_below_op boolean DEFAULT NULL::boolean, p_is_vastu boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id        uuid    := COALESCE(p_user_id, auth.uid());
  v_city_id                uuid;
  v_network_ids            uuid[];
  v_developer_ids          uuid[];
  v_developer_location_ids uuid[];
  v_radius_km              numeric;
  v_results                jsonb;
  v_count_total            bigint;
  v_nearby_info            jsonb;
BEGIN

  -- ШАГ 1: Валидация
  IF p_deal_type IS NULL THEN
    RAISE EXCEPTION 'deal_type is required';
  END IF;
  IF p_deal_type NOT IN ('sale', 'rent') THEN
    RAISE EXCEPTION 'deal_type must be sale or rent';
  END IF;

  -- ШАГ 2: Определить city_id
  IF p_city_id IS NOT NULL THEN
    v_city_id := p_city_id;
  ELSE
    SELECT city_id INTO v_city_id
    FROM user_context
    WHERE user_id = v_current_user_id;
  END IF;
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'city_id could not be determined: user has no city set';
  END IF;

  -- ШАГ 3: Сеть юзера
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;
  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- ШАГ 4: Радиус гео из ai_configs
  SELECT value::numeric INTO v_radius_km
  FROM ai_configs
  WHERE key = 'nearby_radius_km';
  IF v_radius_km IS NULL THEN
    v_radius_km := 2;
  END IF;

  -- ШАГ 5: Поиск девелопера
  IF p_developer_name IS NOT NULL THEN
    SELECT array_agg(id) INTO v_developer_ids
    FROM developers
    WHERE name ILIKE '%' || p_developer_name || '%'
      AND is_active = true;
  END IF;
  IF p_developer_ids IS NOT NULL AND cardinality(p_developer_ids) > 0 THEN
    v_developer_ids := array_cat(
      COALESCE(v_developer_ids, ARRAY[]::uuid[]),
      p_developer_ids
    );
  END IF;
  IF v_developer_ids IS NOT NULL AND cardinality(v_developer_ids) > 0 THEN
    SELECT array_agg(DISTINCT loc_id) INTO v_developer_location_ids
    FROM (
      SELECT location_id AS loc_id
      FROM location_developers
      WHERE developer_id = ANY(v_developer_ids)
      UNION
      SELECT id AS loc_id
      FROM locations
      WHERE developer_id = ANY(v_developer_ids)
    ) base_locs;
  END IF;

  -- ШАГ 7: Основной COUNT
  SELECT COUNT(*) INTO v_count_total
  FROM properties p
  WHERE
    p.status     = 'active'
    AND p.visibility IN ('public', 'network')
    AND p.deal_type  = p_deal_type
    AND EXISTS (
      SELECT 1 FROM locations loc
      WHERE loc.id = p.location_id
        AND loc.city_id = v_city_id
        AND (
          p_location_ids IS NULL
          OR loc.id               = ANY(p_location_ids)
          OR loc.city_id          = ANY(p_location_ids)
          OR loc.community_id     = ANY(p_location_ids)
          OR loc.sub_community_id = ANY(p_location_ids)
          OR loc.cluster_id       = ANY(p_location_ids)
          OR loc.building_id      = ANY(p_location_ids)
          OR loc.country_id       = ANY(p_location_ids)
        )
        AND (
          v_developer_location_ids IS NULL
          OR loc.id               = ANY(v_developer_location_ids)
          OR loc.community_id     = ANY(v_developer_location_ids)
          OR loc.sub_community_id = ANY(v_developer_location_ids)
          OR loc.cluster_id       = ANY(v_developer_location_ids)
          OR loc.building_id      = ANY(v_developer_location_ids)
        )
    )
    AND (p_category_id      IS NULL OR p.category_id      = p_category_id)
    AND (p_unit_type_id     IS NULL OR p.unit_type_id     = p_unit_type_id)
    AND (p_sub_type_ids     IS NULL OR p.sub_type_id      = ANY(p_sub_type_ids))
    AND (p_bedrooms         IS NULL OR p.bedrooms         = ANY(p_bedrooms))
    AND (p_bathrooms        IS NULL OR p.bathrooms        = ANY(p_bathrooms))
    AND (p_is_maid          IS NULL OR p.is_maid          = p_is_maid)
    AND (p_is_hotel_pool    IS NULL OR p.is_hotel_pool    = p_is_hotel_pool)
    AND (p_furnished        IS NULL OR p.furnished        = p_furnished)
    AND (p_floor_level_ids  IS NULL OR p.floor_level_id   = ANY(p_floor_level_ids))
    AND (p_floors_in_unit_ids IS NULL OR p.floors_in_unit_id = ANY(p_floors_in_unit_ids))
    AND (p_area_sqft_min    IS NULL OR p.area_sqft        >= p_area_sqft_min)
    AND (p_area_sqft_max    IS NULL OR p.area_sqft        <= p_area_sqft_max)
    AND (p_plot_sqft_min    IS NULL OR p.plot_sqft        >= p_plot_sqft_min)
    AND (p_plot_sqft_max    IS NULL OR p.plot_sqft        <= p_plot_sqft_max)
    AND (p_price_min        IS NULL OR p.price            >= p_price_min)
    AND (p_price_max        IS NULL OR p.price            <= p_price_max)
    AND (p_price_currency   IS NULL OR p.price_currency   = p_price_currency)
    AND (p_price_period     IS NULL OR p.price_period     = p_price_period)
    AND (p_view_ids         IS NULL OR p.view_ids         @> p_view_ids)
    AND (p_position_ids     IS NULL OR p.position_ids     @> p_position_ids)
    AND (p_amenity_ids      IS NULL OR p.amenity_ids      @> p_amenity_ids)
    AND (p_listing_type     IS NULL OR p.listing_type     = p_listing_type)
    AND (p_cheques          IS NULL OR p.cheques          = ANY(p_cheques))
    AND (p_is_study         IS NULL OR p.is_study         = p_is_study)
    AND (p_is_reduced       IS NULL OR p.is_reduced       = p_is_reduced)
    AND (p_is_below_op      IS NULL OR p.is_below_op      = p_is_below_op)
    AND (p_is_vastu         IS NULL OR p.is_vastu         = p_is_vastu)
    AND (p_occupancy_status IS NULL OR p.occupancy_status = ANY(p_occupancy_status))
    AND (p_handover         IS NULL OR p.handover         = p_handover)
    AND (p_completion_year  IS NULL OR p.completion_year  = ANY(p_completion_year))
    AND (p_completion_q     IS NULL OR p.completion_q     = ANY(p_completion_q))
    AND (p_description      IS NULL OR p.description      ILIKE '%' || p_description || '%')
    AND (p_lat IS NULL OR p_lng IS NULL OR ST_DWithin(
      p.geom::geography,
      ST_MakePoint(p_lng, p_lat)::geography,
      v_radius_km * 1000
    ))
      AND (
        p_exclude_location_ids IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM locations exc
          WHERE exc.id = p.location_id
            AND (
              exc.id               = ANY(p_exclude_location_ids)
              OR exc.sub_community_id = ANY(p_exclude_location_ids)
              OR exc.cluster_id       = ANY(p_exclude_location_ids)
              OR exc.building_id      = ANY(p_exclude_location_ids)
            )
        )
      );

  -- ШАГ 8: Основной SELECT с пагинацией
  SELECT jsonb_agg(row_data) INTO v_results
  FROM (
    SELECT (
      jsonb_build_object(
        'id',                  p.id,
        'owner_id',            p.owner_id,
        'unit_id',             p.unit_id,
        'location_id',         p.location_id,
        'category_id',         p.category_id,
        'unit_type_id',        p.unit_type_id,
        'sub_type_id',         p.sub_type_id,
        'listing_type',        p.listing_type,
        'deal_type',           p.deal_type,
        'price_period',        p.price_period,
        'visibility',          p.visibility,
        'status',              p.status,
        'bedrooms',            p.bedrooms,
        'bathrooms',           p.bathrooms,
        'is_maid',             p.is_maid,
        'is_hotel_pool',       p.is_hotel_pool,
        'area_sqft',           p.area_sqft,
        'area_sqm',            p.area_sqm,
        'plot_sqft',           p.plot_sqft,
        'plot_sqm',            p.plot_sqm,
        'floor_number',        p.floor_number,
        'floor_level_id',      p.floor_level_id,
        'floors_in_unit_id',   p.floors_in_unit_id,        -- было 'floors_in_unit', p.floors_in_unit
        'layout_id',           p.layout_id,
        'view_ids',            p.view_ids,
        'position_ids',        p.position_ids,
        'amenity_ids',         p.amenity_ids,
        'furnished',           p.furnished,
        'lat',                 p.lat,
        'lng',                 p.lng,
        'price',               p.price,
        'previous_price',      p.previous_price,
        'price_currency',      p.price_currency,
        'price_changed_at',    p.price_changed_at,
        -- 'is_negotiable' УДАЛЁН (терминирован)
        'commission_included', p.commission_included,
        -- 'is_distress' УДАЛЁН (терминирован)
        'occupancy_status',    p.occupancy_status,
        'lease_until',         p.lease_until,
        'description',         p.description,
        'address_from_bayut',  p.address_from_bayut
      ) ||
      jsonb_build_object(
        'title_deed_number',   p.title_deed_number,
        'title_deed_year',     p.title_deed_year,
        'plot_number',         p.plot_number,
        'municipality_number', p.municipality_number,
        'developer_id',        p.developer_id,
        'developer_name',      p.developer_name,
        'handover',            p.handover,
        'completion_year',     p.completion_year,
        'completion_q',        p.completion_q,
        'listing_start',       p.listing_start,
        'listing_end',         p.listing_end,
        'last_actualized_at',  p.last_actualized_at,
        'published_at',        p.published_at,
        'expires_at',          p.expires_at,
        'views_count',         p.views_count,
        'unique_views_count',  p.unique_views_count,
        'contacts_count',      p.contacts_count,
        'impressions_count',   p.impressions_count,
        'comments_count',      p.comments_count,
        'created_at',          p.created_at,
        'updated_at',          p.updated_at,
        'location_name',       l.name,
        'location_level',      l.level,
        'community_name',      lc.name,
        'developer_name_ref',  d.name,
        'developer_logo_url',  d.logo_url,
        'owner_full_name',     (SELECT full_name   FROM users           WHERE id      = p.owner_id),
        'owner_agency_name',   (SELECT agency_name FROM user_identities WHERE user_id = p.owner_id LIMIT 1),
        'owner_photo_url',     (SELECT photo_url   FROM user_settings   WHERE user_id = p.owner_id LIMIT 1),
        'has_photos',          EXISTS (SELECT 1 FROM property_photos WHERE property_id = p.id),
        'owner_badge_level',   ab.badge_level,
        'is_network',          (p.owner_id = ANY(v_network_ids))
      )
    ) AS row_data
    FROM properties p
    LEFT JOIN locations l   ON l.id  = p.location_id
    LEFT JOIN locations lc  ON lc.id = l.community_id
    LEFT JOIN developers d  ON d.id  = p.developer_id
    LEFT JOIN agent_badge ab ON ab.user_id = p.owner_id
    WHERE
      p.status     = 'active'
      AND p.visibility IN ('public', 'network')
      AND p.deal_type  = p_deal_type
      AND EXISTS (
        SELECT 1 FROM locations loc
        WHERE loc.id = p.location_id
          AND loc.city_id = v_city_id
          AND (
            p_location_ids IS NULL
            OR loc.id               = ANY(p_location_ids)
            OR loc.city_id          = ANY(p_location_ids)
            OR loc.community_id     = ANY(p_location_ids)
            OR loc.sub_community_id = ANY(p_location_ids)
            OR loc.cluster_id       = ANY(p_location_ids)
            OR loc.building_id      = ANY(p_location_ids)
            OR loc.country_id       = ANY(p_location_ids)
          )
          AND (
            v_developer_location_ids IS NULL
            OR loc.id               = ANY(v_developer_location_ids)
            OR loc.community_id     = ANY(v_developer_location_ids)
            OR loc.sub_community_id = ANY(v_developer_location_ids)
            OR loc.cluster_id       = ANY(v_developer_location_ids)
            OR loc.building_id      = ANY(v_developer_location_ids)
          )
      )
      AND (p_category_id      IS NULL OR p.category_id      = p_category_id)
      AND (p_unit_type_id     IS NULL OR p.unit_type_id     = p_unit_type_id)
      AND (p_sub_type_ids     IS NULL OR p.sub_type_id      = ANY(p_sub_type_ids))
      AND (p_bedrooms         IS NULL OR p.bedrooms         = ANY(p_bedrooms))
      AND (p_bathrooms        IS NULL OR p.bathrooms        = ANY(p_bathrooms))
      AND (p_is_maid          IS NULL OR p.is_maid          = p_is_maid)
      AND (p_is_hotel_pool    IS NULL OR p.is_hotel_pool    = p_is_hotel_pool)
      AND (p_furnished        IS NULL OR p.furnished        = p_furnished)
      AND (p_floor_level_ids  IS NULL OR p.floor_level_id   = ANY(p_floor_level_ids))
      AND (p_floors_in_unit_ids IS NULL OR p.floors_in_unit_id = ANY(p_floors_in_unit_ids))
      AND (p_area_sqft_min    IS NULL OR p.area_sqft        >= p_area_sqft_min)
      AND (p_area_sqft_max    IS NULL OR p.area_sqft        <= p_area_sqft_max)
      AND (p_plot_sqft_min    IS NULL OR p.plot_sqft        >= p_plot_sqft_min)
      AND (p_plot_sqft_max    IS NULL OR p.plot_sqft        <= p_plot_sqft_max)
      AND (p_price_min        IS NULL OR p.price            >= p_price_min)
      AND (p_price_max        IS NULL OR p.price            <= p_price_max)
      AND (p_price_currency   IS NULL OR p.price_currency   = p_price_currency)
      AND (p_price_period     IS NULL OR p.price_period     = p_price_period)
      AND (p_view_ids         IS NULL OR p.view_ids         @> p_view_ids)
      AND (p_position_ids     IS NULL OR p.position_ids     @> p_position_ids)
      AND (p_amenity_ids      IS NULL OR p.amenity_ids      @> p_amenity_ids)
      AND (p_listing_type     IS NULL OR p.listing_type     = p_listing_type)
      AND (p_cheques          IS NULL OR p.cheques          = ANY(p_cheques))
      AND (p_is_study         IS NULL OR p.is_study         = p_is_study)
      AND (p_is_reduced       IS NULL OR p.is_reduced       = p_is_reduced)
      AND (p_is_below_op      IS NULL OR p.is_below_op      = p_is_below_op)
      AND (p_is_vastu         IS NULL OR p.is_vastu         = p_is_vastu)
      AND (p_occupancy_status IS NULL OR p.occupancy_status = ANY(p_occupancy_status))
      AND (p_handover         IS NULL OR p.handover         = p_handover)
      AND (p_completion_year  IS NULL OR p.completion_year  = ANY(p_completion_year))
      AND (p_completion_q     IS NULL OR p.completion_q     = ANY(p_completion_q))
      AND (p_description      IS NULL OR p.description      ILIKE '%' || p_description || '%')
      AND (p_lat IS NULL OR p_lng IS NULL OR ST_DWithin(
        p.geom::geography,
        ST_MakePoint(p_lng, p_lat)::geography,
        v_radius_km * 1000
      ))
      AND (
        p_exclude_location_ids IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM locations exc
          WHERE exc.id = p.location_id
            AND (
              exc.id               = ANY(p_exclude_location_ids)
              OR exc.sub_community_id = ANY(p_exclude_location_ids)
              OR exc.cluster_id       = ANY(p_exclude_location_ids)
              OR exc.building_id      = ANY(p_exclude_location_ids)
            )
        )
      )
    ORDER BY
      CASE WHEN p_sort_by = 'default'    THEN COALESCE(p.last_actualized_at, p.published_at) END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'price_asc'  THEN p.price        END ASC  NULLS LAST,
      CASE WHEN p_sort_by = 'price_desc' THEN p.price        END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'date_desc'  THEN COALESCE(p.last_actualized_at, p.published_at) END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'date_asc'   THEN COALESCE(p.last_actualized_at, p.published_at) END ASC  NULLS LAST
    LIMIT  p_limit
    OFFSET p_offset
  ) final_rows;

  -- ШАГ 9: Вернуть результат
  RETURN jsonb_build_object(
    'results',       COALESCE(v_results, '[]'::jsonb),
    'count_total',   v_count_total,
    'limit',         p_limit,
    'offset',        p_offset
  );

END;
$function$;
```

</details>

### `get_property`

**Возвращает:** `jsonb`

**Параметры:** `p_property_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_property(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_network_ids      uuid[];
  v_plan             text;
  v_result           jsonb;
BEGIN

  -- ================================================================
  -- ШАГ 1: Получить сеть юзера (для проверки видимости network объектов)
  -- ================================================================
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;

  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- ================================================================
  -- ШАГ 1б: Получить план юзера
  -- ================================================================
  SELECT plan INTO v_plan
  FROM user_context
  WHERE user_id = v_current_user_id;

  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- ================================================================
  -- ШАГ 2: Получить объект с проверкой доступа и всеми JOIN полями
  -- ================================================================
  SELECT (
    -- Поля properties, часть 1/2 (31 пара — держим вызов < 100 аргументов, см.
    -- миграцию 2026-06-17-fix-get-property-100-args: фикс ошибки 54023)
    jsonb_build_object(
      'id',                  p.id,
      'owner_id',            p.owner_id,
      'unit_id',             p.unit_id,
      'location_id',         p.location_id,
      'category_id',         p.category_id,
      'unit_type_id',        p.unit_type_id,
      'sub_type_id',         p.sub_type_id,
      'listing_type',        p.listing_type,
      'deal_type',           p.deal_type,
      'price_period',        p.price_period,
      'visibility',          p.visibility,
      'status',              p.status,
      'bedrooms',            p.bedrooms,
      'bathrooms',           p.bathrooms,
      'is_maid',             p.is_maid,
      'is_hotel_pool',       p.is_hotel_pool,
      'area_sqft',           p.area_sqft,
      'area_sqm',            p.area_sqm,
      'plot_sqft',           p.plot_sqft,
      'plot_sqm',            p.plot_sqm,
      'floor_number',        p.floor_number,
      'floor_level_id',      p.floor_level_id,
      'floors_in_unit',      p.floors_in_unit,
      'layout_id',           p.layout_id,
      'view_ids',            p.view_ids,
      'position_ids',        p.position_ids,
      'amenity_ids',         p.amenity_ids,
      'furnished',           p.furnished,
      'lat',                 p.lat,
      'lng',                 p.lng,
      'price',               p.price
    ) ||
    -- Поля properties, часть 2/2 (31 пара)
    jsonb_build_object(
      'previous_price',      p.previous_price,
      'price_currency',      p.price_currency,
      'price_changed_at',    p.price_changed_at,
      'is_negotiable',       p.is_negotiable,
      'commission_included', p.commission_included,
      'is_distress',         p.is_distress,
      'occupancy_status',    p.occupancy_status,
      'lease_until',         p.lease_until,
      'description',         p.description,
      'address_from_bayut',  p.address_from_bayut,
      'title_deed_number',   p.title_deed_number,
      'title_deed_year',     p.title_deed_year,
      'plot_number',         p.plot_number,
      'municipality_number', p.municipality_number,
      'developer_id',        p.developer_id,
      'developer_name',      p.developer_name,
      'handover',            p.handover,
      'completion_year',     p.completion_year,
      'completion_q',        p.completion_q,
      'listing_start',       p.listing_start,
      'listing_end',         p.listing_end,
      'last_actualized_at',  p.last_actualized_at,
      'published_at',        p.published_at,
      'expires_at',          p.expires_at,
      'views_count',         p.views_count,
      'unique_views_count',  p.unique_views_count,
      'contacts_count',      p.contacts_count,
      'impressions_count',   p.impressions_count,
      'comments_count',      p.comments_count,
      'created_at',          p.created_at,
      'updated_at',          p.updated_at
    ) ||
    jsonb_build_object(
      'is_vastu',            p.is_vastu,                                    -- мигр. 2026-06-18 (2b)
      -- Локация
      'location_name',       l.name,
      'location_level',      l.level,
      'location_full_path',  TRIM(BOTH ' > ' FROM CONCAT_WS(' > ',
        NULLIF(loc_city.name,         ''),
        NULLIF(loc_comm.name,         ''),
        NULLIF(loc_sub.name,          ''),
        NULLIF(loc_cluster.name,      ''),
        NULLIF(loc_building.name,     ''),
        CASE WHEN l.id IN (l.community_id, l.sub_community_id, l.cluster_id, l.building_id) THEN NULL ELSE l.name END
      )),

      -- Slider-адрес по public_location_id (мигр. 2026-06-18 2b)
      'public_location_path', CASE WHEN p.public_location_id IS NULL THEN NULL
        ELSE TRIM(BOTH ' > ' FROM CONCAT_WS(' > ',
          NULLIF(pl_city.name,     ''),
          NULLIF(pl_comm.name,     ''),
          NULLIF(pl_sub.name,      ''),
          NULLIF(pl_cluster.name,  ''),
          NULLIF(pl_building.name, ''),
          CASE WHEN pl.id IN (pl.community_id, pl.sub_community_id, pl.cluster_id, pl.building_id) THEN NULL ELSE pl.name END
        )) END,

      -- Project из location_developers по leaf-локации (мигр. 2026-06-18 2b)
      'project', (
        SELECT jsonb_build_object(
          'project_group_name', ld.project_group_name,
          'project_name',       ld.project_name,
          'is_building',        ld.is_building,
          'developer_name',     ld.developer_name,
          'project_status',     ld.project_status,
          'built_year',         ld.built_year,
          'completion_q',       ld.completion_q,
          'completion_year',    ld.completion_year
        )
        FROM location_developers ld
        WHERE ld.location_id = p.location_id
        LIMIT 1
      ),

      -- Девелопер
      'developer_name_ref',  d.name,
      'developer_logo_url',  d.logo_url,

      -- Бейдж владельца
      'owner_badge_level',   ab.badge_level,

      -- Флаг сети
      'is_network',          (p.owner_id = ANY(v_network_ids)),

      -- Флаг: это мой объект
      'is_owner',            (p.owner_id = v_current_user_id),

      -- Данные агента (владельца объекта)
      'agent',               jsonb_build_object(
        'id',           u.id,
        'full_name',    u.full_name,
        'tg_username',  u.tg_username,
        'whatsapp_phone', CASE
          WHEN p.owner_id = v_current_user_id    THEN u.whatsapp_phone  -- свой объект — всегда
          WHEN v_plan = 'pro'                     THEN u.whatsapp_phone  -- Pro — все объекты
          WHEN p.owner_id = ANY(v_network_ids)    THEN u.whatsapp_phone  -- Free — только сеть
          ELSE NULL                                                        -- Free — чужие скрыты
        END,
        'photo_url',    us.photo_url,
        'about',        us.about,
        'languages',    us.languages,
        'badge_level',  ab.badge_level,
        'agency_name',  ui.agency_name,
        'emirate_name', ui.emirate_name,
        'broker_license', CASE
          WHEN p.owner_id = v_current_user_id    THEN ui.broker_license  -- свой объект — всегда
          WHEN v_plan = 'pro'                     THEN ui.broker_license  -- Pro — все объекты
          WHEN p.owner_id = ANY(v_network_ids)    THEN ui.broker_license  -- Free — только сеть
          ELSE NULL                                                          -- Free — чужие скрыты
        END,
        -- активных листингов владельца (мигр. 2026-06-18 2b)
        'active_listings_count', (
          SELECT COUNT(*) FROM properties pp
          WHERE pp.owner_id = p.owner_id AND pp.status = 'active'
        )
      )
    )
  ) INTO v_result
  FROM properties p
  -- Локация
  LEFT JOIN locations l           ON l.id  = p.location_id
  LEFT JOIN locations loc_city    ON loc_city.id    = l.city_id
  LEFT JOIN locations loc_comm    ON loc_comm.id    = l.community_id
  LEFT JOIN locations loc_sub     ON loc_sub.id     = l.sub_community_id
  LEFT JOIN locations loc_cluster ON loc_cluster.id = l.cluster_id
  LEFT JOIN locations loc_building ON loc_building.id = l.building_id
  -- Предки public-локации (slider-адрес, мигр. 2026-06-18 2b)
  LEFT JOIN locations pl          ON pl.id  = p.public_location_id
  LEFT JOIN locations pl_city     ON pl_city.id     = pl.city_id
  LEFT JOIN locations pl_comm     ON pl_comm.id     = pl.community_id
  LEFT JOIN locations pl_sub      ON pl_sub.id      = pl.sub_community_id
  LEFT JOIN locations pl_cluster  ON pl_cluster.id  = pl.cluster_id
  LEFT JOIN locations pl_building ON pl_building.id = pl.building_id
  -- Девелопер
  LEFT JOIN developers d          ON d.id  = p.developer_id
  -- Данные агента
  LEFT JOIN users u               ON u.id  = p.owner_id
  LEFT JOIN user_settings us      ON us.user_id = p.owner_id
  LEFT JOIN user_identities ui    ON ui.user_id = p.owner_id
  LEFT JOIN agent_badge ab        ON ab.user_id = p.owner_id
  WHERE
    p.id = p_property_id
    -- Проверка видимости:
    AND (
      -- Свой объект — всегда доступен (любой статус)
      p.owner_id = v_current_user_id
      -- Чужой активный публичный
      OR (p.status = 'active' AND p.visibility = 'public')
      -- Чужой активный из сети
      OR (p.status = 'active' AND p.visibility = 'network'
          AND p.owner_id = ANY(v_network_ids))
    );

  -- ================================================================
  -- ШАГ 3: Если объект не найден или нет доступа
  -- ================================================================
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'property not found or access denied',
      'property_id', p_property_id
    );
  END IF;

  RETURN v_result;

END;
$function$
```

</details>

### `get_similar_properties`

**Возвращает:** `jsonb`

**Параметры:** `p_property_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`, `p_limit integer DEFAULT 10`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_similar_properties(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_network_ids     uuid[];
  v_prop            record;
  v_loc             record;
  v_results         jsonb;
  v_anchor_id       uuid;
  v_levels          text[];
  v_level           text;
BEGIN

  -- ШАГ 1: Сеть юзера
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;

  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- ШАГ 2: Данные объекта
  SELECT bedrooms, unit_type_id, deal_type, location_id
  INTO v_prop
  FROM properties
  WHERE id = p_property_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'property not found', 'results', '[]'::jsonb);
  END IF;

  -- ШАГ 3: Иерархия локации
  SELECT level, community_id, sub_community_id, cluster_id, building_id
  INTO v_loc
  FROM locations
  WHERE id = v_prop.location_id;

  -- ШАГ 4: Определяем каскад уровней
  v_levels := CASE v_loc.level
    WHEN 'checkpoint'    THEN ARRAY['building', 'cluster', 'sub_community', 'community']
    WHEN 'building'      THEN ARRAY['building', 'cluster', 'sub_community', 'community']
    WHEN 'cluster'       THEN ARRAY['cluster', 'sub_community', 'community']
    WHEN 'sub_community' THEN ARRAY['sub_community', 'community']
    ELSE                      ARRAY['community']
  END;

  -- ШАГ 5: Каскадный поиск
  FOREACH v_level IN ARRAY v_levels LOOP

    v_anchor_id := CASE v_level
      WHEN 'building'      THEN v_loc.building_id
      WHEN 'cluster'       THEN v_loc.cluster_id
      WHEN 'sub_community' THEN v_loc.sub_community_id
      WHEN 'community'     THEN v_loc.community_id
    END;

    IF v_anchor_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT jsonb_agg(row_data) INTO v_results
    FROM (
      SELECT jsonb_build_object(
        'id',                  p.id,
        'owner_id',            p.owner_id,
        'unit_id',             p.unit_id,
        'location_id',         p.location_id,
        'category_id',         p.category_id,
        'unit_type_id',        p.unit_type_id,
        'sub_type_id',         p.sub_type_id,
        'listing_type',        p.listing_type,
        'deal_type',           p.deal_type,
        'price_period',        p.price_period,
        'visibility',          p.visibility,
        'status',              p.status,
        'bedrooms',            p.bedrooms,
        'bathrooms',           p.bathrooms,
        'is_maid',             p.is_maid,
        'is_hotel_pool',       p.is_hotel_pool,
        'area_sqft',           p.area_sqft,
        'area_sqm',            p.area_sqm,
        'plot_sqft',           p.plot_sqft,
        'plot_sqm',            p.plot_sqm,
        'floor_number',        p.floor_number,
        'floor_level_id',      p.floor_level_id,
        'floors_in_unit',      p.floors_in_unit,
        'layout_id',           p.layout_id,
        'view_ids',            p.view_ids,
        'position_ids',        p.position_ids,
        'amenity_ids',         p.amenity_ids,
        'furnished',           p.furnished,
        'lat',                 p.lat,
        'lng',                 p.lng,
        'price',               p.price,
        'previous_price',      p.previous_price,
        'price_currency',      p.price_currency,
        'price_changed_at',    p.price_changed_at,
        'is_negotiable',       p.is_negotiable,
        'commission_included', p.commission_included,
        'is_distress',         p.is_distress,
        'occupancy_status',    p.occupancy_status,
        'lease_until',         p.lease_until,
        'description',         p.description,
        'address_from_bayut',  p.address_from_bayut,
        'title_deed_number',   p.title_deed_number,
        'title_deed_year',     p.title_deed_year,
        'plot_number',         p.plot_number,
        'municipality_number', p.municipality_number,
        'developer_id',        p.developer_id,
        'developer_name',      p.developer_name,
        'handover',            p.handover,
        'completion_year',     p.completion_year,
        'completion_q',        p.completion_q,
        'listing_start',       p.listing_start,
        'listing_end',         p.listing_end,
        'last_actualized_at',  p.last_actualized_at,
        'published_at',        p.published_at,
        'expires_at',          p.expires_at,
        'views_count',         p.views_count,
        'unique_views_count',  p.unique_views_count,
        'contacts_count',      p.contacts_count,
        'impressions_count',   p.impressions_count,
        'comments_count',      p.comments_count,
        'created_at',          p.created_at,
        'updated_at',          p.updated_at,
        'location_name',       l.name,
        'location_level',      l.level,
        'developer_name_ref',  d.name,
        'developer_logo_url',  d.logo_url,
        'owner_badge_level',   ab.badge_level,
        'is_network',          (p.owner_id = ANY(v_network_ids))
      ) AS row_data
      FROM properties p
      LEFT JOIN locations l    ON l.id = p.location_id
      LEFT JOIN developers d   ON d.id = p.developer_id
      LEFT JOIN agent_badge ab ON ab.user_id = p.owner_id
      WHERE
        p.id             != p_property_id
        AND p.status      = 'active'
        AND p.deal_type   = v_prop.deal_type
        AND p.unit_type_id = v_prop.unit_type_id
        AND p.bedrooms    = v_prop.bedrooms
        AND (
          p.visibility = 'public'
          OR (p.visibility = 'network' AND p.owner_id = ANY(v_network_ids))
        )
        AND EXISTS (
          SELECT 1 FROM locations loc
          WHERE loc.id = p.location_id
            AND (
              CASE v_level
                WHEN 'building'      THEN loc.building_id      = v_anchor_id
                WHEN 'cluster'       THEN loc.cluster_id       = v_anchor_id
                WHEN 'sub_community' THEN loc.sub_community_id = v_anchor_id
                WHEN 'community'     THEN loc.community_id     = v_anchor_id
              END
            )
        )
      ORDER BY p.price ASC NULLS LAST
      LIMIT p_limit
    ) sub;

    IF v_results IS NOT NULL AND jsonb_array_length(v_results) > 0 THEN
      EXIT;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   COALESCE(jsonb_array_length(COALESCE(v_results, '[]'::jsonb)), 0)
  );

END;
$function$
```

</details>

### `autocomplete_locations`

**Возвращает:** `jsonb`

**Параметры:** `p_query text`, `p_city_id uuid DEFAULT NULL::uuid`, `p_levels text[] DEFAULT NULL::text[]`, `p_limit integer DEFAULT 10`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.autocomplete_locations(p_query text, p_city_id uuid DEFAULT NULL::uuid, p_levels text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_city_id  uuid;
  v_results  jsonb;
BEGIN

  -- ================================================================
  -- ШАГ 1: Валидация
  -- ================================================================
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object(
      'results', '[]'::jsonb,
      'count',   0
    );
  END IF;

  -- ================================================================
  -- ШАГ 2: Определить city_id
  -- ================================================================
  IF p_city_id IS NOT NULL THEN
    v_city_id := p_city_id;
  ELSE
    -- Берём из профиля юзера
    SELECT e.city_id INTO v_city_id
    FROM user_identities ui
    JOIN emirates e ON e.id = ui.emirate_id
    WHERE ui.user_id = auth.uid()
    LIMIT 1;
  END IF;

  -- ================================================================
  -- ШАГ 3: Поиск локаций
  -- ================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',        l.id,
      'name',      l.name,
      'name_ar',   l.name_ar,
      'level',     l.level,
      'bayut_id',  l.bayut_id,
      'lat',       l.lat,
      'lng',       l.lng,
      'full_path', TRIM(BOTH ' > ' FROM CONCAT_WS(' > ',
        NULLIF(city.name,         ''),
        NULLIF(comm.name,         ''),
        NULLIF(sub_comm.name,     ''),
        NULLIF(cluster.name,      ''),
        NULLIF(building.name,     ''),
        CASE WHEN l.level = 'checkpoint' THEN l.name ELSE NULL END
      ))
    )
    ORDER BY
      -- Точные совпадения в начале
      CASE WHEN l.name ILIKE p_query || '%' THEN 0 ELSE 1 END ASC,
      -- Популярные локации выше
      COALESCE(l.stats_listings, 0) DESC,
      -- По уровню (community выше checkpoint)
      CASE l.level
        WHEN 'community'     THEN 1
        WHEN 'sub_community' THEN 2
        WHEN 'cluster'       THEN 3
        WHEN 'building'      THEN 4
        WHEN 'checkpoint'    THEN 5
        ELSE 6
      END ASC,
      l.name ASC
  ) INTO v_results
  FROM locations l
  -- JOIN для построения full_path
  LEFT JOIN locations city     ON city.id     = l.city_id          AND city.level     = 'city'
  LEFT JOIN locations comm     ON comm.id     = l.community_id     AND comm.level     = 'community'
  LEFT JOIN locations sub_comm ON sub_comm.id = l.sub_community_id AND sub_comm.level = 'sub_community'
  LEFT JOIN locations cluster  ON cluster.id  = l.cluster_id       AND cluster.level  = 'cluster'
  LEFT JOIN locations building ON building.id = l.building_id      AND building.level = 'building'
  WHERE
    l.is_active = true
    -- Текстовый поиск по названию
    AND (
      l.name    ILIKE '%' || p_query || '%'
      OR l.name_ar ILIKE '%' || p_query || '%'
      OR l.aliases::text ILIKE '%' || p_query || '%'
    )
    -- Фильтр по городу
    AND (v_city_id IS NULL OR l.city_id = v_city_id)
    -- Фильтр по уровням
    AND (p_levels IS NULL OR l.level = ANY(p_levels))
    -- Исключаем country уровень из результатов
    AND l.level != 'country'
  LIMIT p_limit;

  -- ================================================================
  -- ШАГ 4: Вернуть результат
  -- ================================================================
  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   COALESCE(jsonb_array_length(COALESCE(v_results, '[]'::jsonb)), 0)
  );

END;
$function$
```

</details>

### `search_locations`

**Возвращает:** `jsonb`

**Параметры:** `p_mode text`, `p_query text DEFAULT NULL::text`, `p_location_id uuid DEFAULT NULL::uuid`, `p_level_filter text DEFAULT NULL::text`, `p_limit integer DEFAULT 20`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.search_locations(p_mode text, p_query text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_level_filter text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_result jsonb;
  v_loc RECORD;
  v_breadcrumb jsonb;
  v_children jsonb;
  v_neighbors jsonb;
  v_query_lower text;
  v_matched_community_ids uuid[];
BEGIN
  -- ==================== VALIDATION ====================
  IF p_mode NOT IN ('search', 'info') THEN
    RETURN jsonb_build_object('error', 'invalid_mode', 'message', 'Mode must be search or info');
  END IF;

  -- ==================== MODE: SEARCH ====================
  IF p_mode = 'search' THEN
    IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
      RETURN jsonb_build_object('error', 'query_too_short', 'message', 'Query must be at least 2 characters');
    END IF;

    v_query_lower := lower(trim(p_query));

    -- Step 1: find communities that match with exact or starts-with
    SELECT array_agg(id) INTO v_matched_community_ids
    FROM locations
    WHERE is_active = true
      AND level = 'community'
      AND (
        lower(name) = v_query_lower
        OR lower(name) LIKE v_query_lower || '%'
      );

    -- Step 2: search with descendant exclusion
    SELECT jsonb_build_object(
      'mode', 'search',
      'query', p_query,
      'count', count(*),
      'results', COALESCE(jsonb_agg(sub.item ORDER BY sub.score DESC), '[]'::jsonb)
    ) INTO v_result
    FROM (
      SELECT
        jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'level', l.level,
          'community_name', c.name,
          'city_name', ci.name,
          'stats_listings', COALESCE(l.stats_listings, 0),
          'is_popular', COALESCE(l.is_popular, false),
          'score', (
            CASE
              WHEN lower(l.name) = v_query_lower THEN 100
              WHEN lower(l.name) LIKE v_query_lower || '%' THEN 80
              WHEN lower(l.name) LIKE '%' || v_query_lower || '%' THEN 60
              ELSE 0
            END
            + CASE WHEN EXISTS (
                SELECT 1 FROM unnest(l.aliases) a WHERE lower(a) LIKE '%' || v_query_lower || '%'
              ) THEN 50 ELSE 0 END
            + CASE WHEN COALESCE(l.is_popular, false) THEN 5 ELSE 0 END
            + CASE l.level
                WHEN 'community' THEN 5
                WHEN 'sub_community' THEN 4
                WHEN 'cluster' THEN 3
                WHEN 'building' THEN 2
                WHEN 'checkpoint' THEN 1
                ELSE 0
              END
          )
        ) AS item,
        (
          CASE
            WHEN lower(l.name) = v_query_lower THEN 100
            WHEN lower(l.name) LIKE v_query_lower || '%' THEN 80
            WHEN lower(l.name) LIKE '%' || v_query_lower || '%' THEN 60
            ELSE 0
          END
          + CASE WHEN EXISTS (
              SELECT 1 FROM unnest(l.aliases) a WHERE lower(a) LIKE '%' || v_query_lower || '%'
            ) THEN 50 ELSE 0 END
          + CASE WHEN COALESCE(l.is_popular, false) THEN 5 ELSE 0 END
          + CASE l.level
              WHEN 'community' THEN 5
              WHEN 'sub_community' THEN 4
              WHEN 'cluster' THEN 3
              WHEN 'building' THEN 2
              WHEN 'checkpoint' THEN 1
              ELSE 0
            END
        ) AS score
      FROM locations l
      LEFT JOIN locations c ON c.id = l.community_id
      LEFT JOIN locations ci ON ci.id = l.city_id
      WHERE l.is_active = true
        AND (p_level_filter IS NULL OR l.level = p_level_filter)
        AND (
          lower(l.name) LIKE '%' || v_query_lower || '%'
          OR EXISTS (
            SELECT 1 FROM unnest(l.aliases) a WHERE lower(a) LIKE '%' || v_query_lower || '%'
          )
        )
        -- Exclude descendants of matched communities
        AND (
          v_matched_community_ids IS NULL
          OR l.level = 'community'
          OR l.community_id IS NULL
          OR NOT (l.community_id = ANY(v_matched_community_ids))
        )
      ORDER BY score DESC
      LIMIT p_limit
    ) sub
    WHERE sub.score > 0;

    RETURN v_result;
  END IF;

  -- ==================== MODE: INFO ====================
  IF p_mode = 'info' THEN
    IF p_location_id IS NULL THEN
      RETURN jsonb_build_object('error', 'missing_location_id', 'message', 'location_id is required for info mode');
    END IF;

    SELECT * INTO v_loc FROM locations WHERE id = p_location_id AND is_active = true;

    IF v_loc IS NULL THEN
      RETURN jsonb_build_object('error', 'location_not_found', 'message', 'Location not found or inactive');
    END IF;

    -- Breadcrumb: ancestors from city down, excluding self
    SELECT COALESCE(jsonb_agg(bc.item ORDER BY bc.ord), '[]'::jsonb) INTO v_breadcrumb
    FROM (
      SELECT 1 AS ord, jsonb_build_object('level', 'city', 'id', a.id, 'name', a.name) AS item
      FROM locations a WHERE a.id = v_loc.city_id
      UNION ALL
      SELECT 2, jsonb_build_object('level', 'community', 'id', a.id, 'name', a.name)
      FROM locations a WHERE a.id = v_loc.community_id
      UNION ALL
      SELECT 3, jsonb_build_object('level', 'sub_community', 'id', a.id, 'name', a.name)
      FROM locations a WHERE a.id = v_loc.sub_community_id
      UNION ALL
      SELECT 4, jsonb_build_object('level', 'cluster', 'id', a.id, 'name', a.name)
      FROM locations a WHERE a.id = v_loc.cluster_id
      UNION ALL
      SELECT 5, jsonb_build_object('level', 'building', 'id', a.id, 'name', a.name)
      FROM locations a WHERE a.id = v_loc.building_id
    ) bc;

    -- Children: direct descendants
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ch.id,
        'name', ch.name,
        'level', ch.level,
        'stats_listings', COALESCE(ch.stats_listings, 0)
      ) ORDER BY ch.name
    ), '[]'::jsonb) INTO v_children
    FROM locations ch
    WHERE ch.parent_id = v_loc.id AND ch.is_active = true;

    -- Neighbors from location_neighbors
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', nb.id,
        'name', nb.name,
        'level', nb.level,
        'distance_m', n.distance_m,
        'zone', n.zone,
        'community_name', nc.name,
        'is_other_community', (nb.community_id IS DISTINCT FROM v_loc.community_id)
      ) ORDER BY n.rank
    ), '[]'::jsonb) INTO v_neighbors
    FROM location_neighbors n
    JOIN locations nb ON nb.id = n.neighbor_id
    LEFT JOIN locations nc ON nc.id = nb.community_id
    WHERE n.location_id = v_loc.id;

    RETURN jsonb_build_object(
      'mode', 'info',
      'location', jsonb_build_object(
        'id', v_loc.id,
        'name', v_loc.name,
        'level', v_loc.level,
        'lat', v_loc.lat,
        'lng', v_loc.lng,
        'is_popular', COALESCE(v_loc.is_popular, false),
        'completion_status', v_loc.completion_status,
        'developer_ids', COALESCE(to_jsonb(v_loc.developer_ids), '[]'::jsonb)
      ),
      'breadcrumb', v_breadcrumb,
      'children', v_children,
      'neighbors', v_neighbors,
      'stats', jsonb_build_object(
        'own_listings', COALESCE(v_loc.stats_listings, 0),
        'children_count', (SELECT count(*) FROM locations ch WHERE ch.parent_id = v_loc.id AND ch.is_active),
        'neighbors_count', (SELECT count(*) FROM location_neighbors WHERE location_id = v_loc.id)
      )
    );
  END IF;

  RETURN jsonb_build_object('error', 'invalid_mode', 'message', 'Mode must be search or info');
END;
$function$
```

</details>

### `search_in_scope`

**Возвращает:** `jsonb` · **Параметры:** `p_query text`, `p_within_id uuid`, `p_limit integer DEFAULT 50`

Поиск локаций строго среди ПОТОМКОВ узла `p_within_id` (шаг «Уточните адрес»). Потомок — локация,
у которой `p_within_id` встречается в любом FK-предке (`city_id/community_id/sub_community_id/
cluster_id/building_id`) и которая ≠ самому узлу. Уровень узла знать не нужно (community → все
потомки; sub_community/cluster → только ниже него). Подстрочный матч по `name`/`aliases`. Формат
ответа как `search_locations` mode=search: `{ mode:'scope', query, count, results:[{id,name,level,
community_name,city_name,stats_listings,is_popular}] }`. `LANGUAGE plpgsql STABLE` (НЕ SECURITY
DEFINER). GRANT EXECUTE → anon/authenticated/service_role. Миграция:
`applied/2026-06-18-search-in-scope.sql` (AP-2; заменил клиентский обход p_limit=50).

### `get_location_path`

**Возвращает:** `jsonb`

**Параметры:** `p_location_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`, `p_deal_type text DEFAULT NULL::text`, `p_category_id uuid DEFAULT NULL::uuid`, `p_unit_type_id uuid DEFAULT NULL::uuid`, `p_sub_type_ids uuid[] DEFAULT NULL::uuid[]`, `p_bedrooms integer[] DEFAULT NULL::integer[]`, `p_bathrooms integer[] DEFAULT NULL::integer[]`, `p_is_maid boolean DEFAULT NULL::boolean`, `p_is_hotel_pool boolean DEFAULT NULL::boolean`, `p_furnished text DEFAULT NULL::text`, `p_floor_level_id uuid DEFAULT NULL::uuid`, `p_floors_in_unit text[] DEFAULT NULL::text[]`, `p_area_sqft_min numeric DEFAULT NULL::numeric`, `p_area_sqft_max numeric DEFAULT NULL::numeric`, `p_plot_sqft_min numeric DEFAULT NULL::numeric`, `p_plot_sqft_max numeric DEFAULT NULL::numeric`, `p_price_min numeric DEFAULT NULL::numeric`, `p_price_max numeric DEFAULT NULL::numeric`, `p_price_currency text DEFAULT 'AED'::text`, `p_price_period text DEFAULT NULL::text`, `p_view_ids text[] DEFAULT NULL::text[]`, `p_position_ids text[] DEFAULT NULL::text[]`, `p_amenity_ids text[] DEFAULT NULL::text[]`, `p_listing_type text DEFAULT NULL::text`, `p_is_distress boolean DEFAULT NULL::boolean`, `p_occupancy_status text DEFAULT NULL::text`, `p_handover text DEFAULT NULL::text`, `p_completion_year integer[] DEFAULT NULL::integer[]`, `p_completion_q text[] DEFAULT NULL::text[]`, `p_description text DEFAULT NULL::text`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_location_path(p_location_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_deal_type text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_unit_type_id uuid DEFAULT NULL::uuid, p_sub_type_ids uuid[] DEFAULT NULL::uuid[], p_bedrooms integer[] DEFAULT NULL::integer[], p_bathrooms integer[] DEFAULT NULL::integer[], p_is_maid boolean DEFAULT NULL::boolean, p_is_hotel_pool boolean DEFAULT NULL::boolean, p_furnished text DEFAULT NULL::text, p_floor_level_id uuid DEFAULT NULL::uuid, p_floors_in_unit text[] DEFAULT NULL::text[], p_area_sqft_min numeric DEFAULT NULL::numeric, p_area_sqft_max numeric DEFAULT NULL::numeric, p_plot_sqft_min numeric DEFAULT NULL::numeric, p_plot_sqft_max numeric DEFAULT NULL::numeric, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_price_currency text DEFAULT 'AED'::text, p_price_period text DEFAULT NULL::text, p_view_ids text[] DEFAULT NULL::text[], p_position_ids text[] DEFAULT NULL::text[], p_amenity_ids text[] DEFAULT NULL::text[], p_listing_type text DEFAULT NULL::text, p_is_distress boolean DEFAULT NULL::boolean, p_occupancy_status text DEFAULT NULL::text, p_handover text DEFAULT NULL::text, p_completion_year integer[] DEFAULT NULL::integer[], p_completion_q text[] DEFAULT NULL::text[], p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_plan             text;
  v_network_ids      uuid[];
  v_public_limit     int;
  v_path             jsonb;
  v_result           jsonb;
  rec                RECORD;
  v_count_visible    bigint;
  v_count_total      bigint;
  v_network_count    bigint;
  v_public_visible   bigint;
  v_public_total     bigint;
BEGIN

  -- ================================================================
  -- ШАГ 1: Получить план юзера
  -- ================================================================
  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE user_id = v_current_user_id
    AND status = 'active'
    AND current_period_end > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- ================================================================
  -- ШАГ 2: Получить сеть юзера
  -- ================================================================
  SELECT array_cat(
    COALESCE(friend_ids, ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;

  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- ================================================================
  -- ШАГ 3: Лимит для Free плана
  -- ================================================================
  SELECT value::int INTO v_public_limit
  FROM ai_configs
  WHERE key = 'reciprocity_none_fixed';

  IF v_public_limit IS NULL THEN
    v_public_limit := 5;
  END IF;

  -- ================================================================
  -- ШАГ 4: Получить путь от выбранной локации до community
  -- Используем новые колонки иерархии — без рекурсии
  -- ================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',       l.id,
      'name',     l.name,
      'name_ar',  l.name_ar,
      'level',    l.level,
      'bayut_id', l.bayut_id
    )
    ORDER BY
      CASE l.level
        WHEN 'checkpoint'    THEN 1
        WHEN 'building'      THEN 2
        WHEN 'cluster'       THEN 3
        WHEN 'sub_community' THEN 4
        WHEN 'community'     THEN 5
      END ASC
  ) INTO v_path
  FROM locations src  -- исходная локация
  JOIN locations l ON (
    -- сама локация
    l.id = src.id
    -- или любой её предок до community
    OR (src.building_id      IS NOT NULL AND l.id = src.building_id)
    OR (src.cluster_id       IS NOT NULL AND l.id = src.cluster_id)
    OR (src.sub_community_id IS NOT NULL AND l.id = src.sub_community_id)
    OR (src.community_id     IS NOT NULL AND l.id = src.community_id)
  )
  WHERE src.id = p_location_id
    AND l.level IN ('checkpoint','building','cluster','sub_community','community');

  IF v_path IS NULL THEN
    RETURN jsonb_build_object(
      'error',   'location not found',
      'results', '[]'::jsonb
    );
  END IF;

  -- ================================================================
  -- ШАГ 5: Для каждого уровня считаем count_visible и count_total
  -- ================================================================
  v_result := '[]'::jsonb;

  FOR rec IN
    SELECT
      (elem->>'id')::uuid   AS loc_id,
      elem->>'name'         AS loc_name,
      elem->>'name_ar'      AS loc_name_ar,
      elem->>'level'        AS loc_level,
      (elem->>'bayut_id')::int AS loc_bayut_id
    FROM jsonb_array_elements(v_path) AS elem
  LOOP

    -- Считаем network объекты используя новые колонки иерархии
    SELECT COUNT(*) INTO v_network_count
    FROM properties p
    WHERE
      p.status      = 'active'
      AND p.visibility IN ('public', 'network')
      AND EXISTS (
        SELECT 1 FROM locations loc
        WHERE loc.id = p.location_id
          AND (
            loc.id               = rec.loc_id OR
            loc.building_id      = rec.loc_id OR
            loc.cluster_id       = rec.loc_id OR
            loc.sub_community_id = rec.loc_id OR
            loc.community_id     = rec.loc_id
          )
      )
      AND p.owner_id    = ANY(v_network_ids)
      AND (p_deal_type        IS NULL OR p.deal_type      = p_deal_type)
      AND (p_category_id      IS NULL OR p.category_id    = p_category_id)
      AND (p_unit_type_id     IS NULL OR p.unit_type_id   = p_unit_type_id)
      AND (p_sub_type_ids     IS NULL OR p.sub_type_id    = ANY(p_sub_type_ids))
      AND (p_bedrooms         IS NULL OR p.bedrooms       = ANY(p_bedrooms))
      AND (p_bathrooms        IS NULL OR p.bathrooms      = ANY(p_bathrooms))
      AND (p_is_maid          IS NULL OR p.is_maid        = p_is_maid)
      AND (p_is_hotel_pool    IS NULL OR p.is_hotel_pool  = p_is_hotel_pool)
      AND (p_furnished        IS NULL OR p.furnished      = p_furnished)
      AND (p_floor_level_id   IS NULL OR p.floor_level_id = p_floor_level_id)
      AND (p_floors_in_unit   IS NULL OR p.floors_in_unit = ANY(p_floors_in_unit))
      AND (p_area_sqft_min    IS NULL OR p.area_sqft      >= p_area_sqft_min)
      AND (p_area_sqft_max    IS NULL OR p.area_sqft      <= p_area_sqft_max)
      AND (p_plot_sqft_min    IS NULL OR p.plot_sqft      >= p_plot_sqft_min)
      AND (p_plot_sqft_max    IS NULL OR p.plot_sqft      <= p_plot_sqft_max)
      AND (p_price_min        IS NULL OR p.price          >= p_price_min)
      AND (p_price_max        IS NULL OR p.price          <= p_price_max)
      AND (p_price_currency   IS NULL OR p.price_currency = p_price_currency)
      AND (p_price_period     IS NULL OR p.price_period   = p_price_period)
      AND (p_view_ids         IS NULL OR p.view_ids       @> p_view_ids)
      AND (p_position_ids     IS NULL OR p.position_ids   @> p_position_ids)
      AND (p_amenity_ids      IS NULL OR p.amenity_ids    @> p_amenity_ids)
      AND (p_listing_type     IS NULL OR p.listing_type   = p_listing_type)
      AND (p_is_distress      IS NULL OR p.is_distress    = p_is_distress)
      AND (p_occupancy_status IS NULL OR p.occupancy_status = p_occupancy_status)
      AND (p_handover         IS NULL OR p.handover       = p_handover)
      AND (p_completion_year  IS NULL OR p.completion_year = ANY(p_completion_year))
      AND (p_completion_q     IS NULL OR p.completion_q   = ANY(p_completion_q))
      AND (p_description      IS NULL OR p.description    ILIKE '%' || p_description || '%');

    -- Считаем все public объекты
    SELECT COUNT(*) INTO v_public_total
    FROM properties p
    WHERE
      p.status      = 'active'
      AND p.visibility  = 'public'
      AND EXISTS (
        SELECT 1 FROM locations loc
        WHERE loc.id = p.location_id
          AND (
            loc.id               = rec.loc_id OR
            loc.building_id      = rec.loc_id OR
            loc.cluster_id       = rec.loc_id OR
            loc.sub_community_id = rec.loc_id OR
            loc.community_id     = rec.loc_id
          )
      )
      AND p.owner_id    != ALL(v_network_ids)
      AND (p_deal_type        IS NULL OR p.deal_type      = p_deal_type)
      AND (p_category_id      IS NULL OR p.category_id    = p_category_id)
      AND (p_unit_type_id     IS NULL OR p.unit_type_id   = p_unit_type_id)
      AND (p_sub_type_ids     IS NULL OR p.sub_type_id    = ANY(p_sub_type_ids))
      AND (p_bedrooms         IS NULL OR p.bedrooms       = ANY(p_bedrooms))
      AND (p_bathrooms        IS NULL OR p.bathrooms      = ANY(p_bathrooms))
      AND (p_is_maid          IS NULL OR p.is_maid        = p_is_maid)
      AND (p_is_hotel_pool    IS NULL OR p.is_hotel_pool  = p_is_hotel_pool)
      AND (p_furnished        IS NULL OR p.furnished      = p_furnished)
      AND (p_floor_level_id   IS NULL OR p.floor_level_id = p_floor_level_id)
      AND (p_floors_in_unit   IS NULL OR p.floors_in_unit = ANY(p_floors_in_unit))
      AND (p_area_sqft_min    IS NULL OR p.area_sqft      >= p_area_sqft_min)
      AND (p_area_sqft_max    IS NULL OR p.area_sqft      <= p_area_sqft_max)
      AND (p_plot_sqft_min    IS NULL OR p.plot_sqft      >= p_plot_sqft_min)
      AND (p_plot_sqft_max    IS NULL OR p.plot_sqft      <= p_plot_sqft_max)
      AND (p_price_min        IS NULL OR p.price          >= p_price_min)
      AND (p_price_max        IS NULL OR p.price          <= p_price_max)
      AND (p_price_currency   IS NULL OR p.price_currency = p_price_currency)
      AND (p_price_period     IS NULL OR p.price_period   = p_price_period)
      AND (p_view_ids         IS NULL OR p.view_ids       @> p_view_ids)
      AND (p_position_ids     IS NULL OR p.position_ids   @> p_position_ids)
      AND (p_amenity_ids      IS NULL OR p.amenity_ids    @> p_amenity_ids)
      AND (p_listing_type     IS NULL OR p.listing_type   = p_listing_type)
      AND (p_is_distress      IS NULL OR p.is_distress    = p_is_distress)
      AND (p_occupancy_status IS NULL OR p.occupancy_status = p_occupancy_status)
      AND (p_handover         IS NULL OR p.handover       = p_handover)
      AND (p_completion_year  IS NULL OR p.completion_year = ANY(p_completion_year))
      AND (p_completion_q     IS NULL OR p.completion_q   = ANY(p_completion_q))
      AND (p_description      IS NULL OR p.description    ILIKE '%' || p_description || '%');

    -- Применяем правила плана
    v_public_visible := CASE
      WHEN v_plan = 'free' THEN LEAST(v_public_total, v_public_limit)
      ELSE v_public_total
    END;

    v_count_visible := v_network_count + v_public_visible;
    v_count_total   := v_network_count + v_public_total;

    -- Добавляем в результат
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'id',            rec.loc_id,
        'name',          rec.loc_name,
        'name_ar',       rec.loc_name_ar,
        'level',         rec.loc_level,
        'bayut_id',      rec.loc_bayut_id,
        'count_visible', v_count_visible,
        'count_total',   v_count_total,
        'count_hidden',  GREATEST(0, v_count_total - v_count_visible)
      )
    );

  END LOOP;

  RETURN jsonb_build_object(
    'results', v_result,
    'plan',    v_plan
  );

END;
$function$
```

</details>

### `get_location_subtree`

**Возвращает:** `TABLE(id uuid)`

**Параметры:** `p_location_id uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_location_subtree(p_location_id uuid)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE
AS $function$
  WITH RECURSIVE tree AS (
    SELECT id FROM locations WHERE id = p_location_id
    UNION ALL
    SELECT l.id FROM locations l
    JOIN tree t ON l.parent_id = t.id
  )
  SELECT id FROM tree;
$function$
```

</details>

### `count_nearby_listings`

**Возвращает:** `jsonb`

**Параметры:** `p_location_ids uuid[]`, `p_neighbor_ids uuid[]`, `p_community_id uuid DEFAULT NULL::uuid`, `p_deal_type text DEFAULT 'sale'::text`, `p_city_id uuid DEFAULT NULL::uuid`, `p_category_id uuid DEFAULT NULL::uuid`, `p_unit_type_id uuid DEFAULT NULL::uuid`, `p_sub_type_ids uuid[] DEFAULT NULL::uuid[]`, `p_bedrooms integer[] DEFAULT NULL::integer[]`, `p_price_min numeric DEFAULT NULL::numeric`, `p_price_max numeric DEFAULT NULL::numeric`, `p_area_sqft_min numeric DEFAULT NULL::numeric`, `p_area_sqft_max numeric DEFAULT NULL::numeric`, `p_furnished text DEFAULT NULL::text`, `p_handover text DEFAULT NULL::text`, `p_is_distress boolean DEFAULT NULL::boolean`, `p_listing_type text DEFAULT NULL::text`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.count_nearby_listings(p_location_ids uuid[], p_neighbor_ids uuid[], p_community_id uuid DEFAULT NULL::uuid, p_deal_type text DEFAULT 'sale'::text, p_city_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_unit_type_id uuid DEFAULT NULL::uuid, p_sub_type_ids uuid[] DEFAULT NULL::uuid[], p_bedrooms integer[] DEFAULT NULL::integer[], p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_area_sqft_min numeric DEFAULT NULL::numeric, p_area_sqft_max numeric DEFAULT NULL::numeric, p_furnished text DEFAULT NULL::text, p_handover text DEFAULT NULL::text, p_is_distress boolean DEFAULT NULL::boolean, p_listing_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_city_id          uuid;
  v_count_nearby     integer := 0;
  v_count_community  integer := 0;
BEGIN

  -- ================================================================
  -- Определить city_id
  -- ================================================================
  v_city_id := p_city_id;
  IF v_city_id IS NULL AND p_location_ids IS NOT NULL AND cardinality(p_location_ids) > 0 THEN
    SELECT city_id INTO v_city_id
    FROM locations
    WHERE id = p_location_ids[1];
  END IF;

  -- ================================================================
  -- COUNT nearby
  -- Все соседние локации (все зоны, все community)
  -- ================================================================
  IF p_neighbor_ids IS NOT NULL AND cardinality(p_neighbor_ids) > 0 THEN
    SELECT COUNT(*) INTO v_count_nearby
    FROM properties p
    WHERE
      p.status     = 'active'
      AND p.visibility IN ('public', 'network')
      AND p.deal_type  = p_deal_type
      AND EXISTS (
        SELECT 1 FROM locations loc
        WHERE loc.id = p.location_id
          AND (v_city_id IS NULL OR loc.city_id = v_city_id)
          AND (
            loc.id               = ANY(p_neighbor_ids)
            OR loc.community_id     = ANY(p_neighbor_ids)
            OR loc.sub_community_id = ANY(p_neighbor_ids)
            OR loc.cluster_id       = ANY(p_neighbor_ids)
            OR loc.building_id      = ANY(p_neighbor_ids)
          )
      )
      AND (p_category_id   IS NULL OR p.category_id   = p_category_id)
      AND (p_unit_type_id  IS NULL OR p.unit_type_id  = p_unit_type_id)
      AND (p_sub_type_ids  IS NULL OR p.sub_type_id   = ANY(p_sub_type_ids))
      AND (p_bedrooms      IS NULL OR p.bedrooms      = ANY(p_bedrooms))
      AND (p_price_min     IS NULL OR p.price         >= p_price_min)
      AND (p_price_max     IS NULL OR p.price         <= p_price_max)
      AND (p_area_sqft_min IS NULL OR p.area_sqft     >= p_area_sqft_min)
      AND (p_area_sqft_max IS NULL OR p.area_sqft     <= p_area_sqft_max)
      AND (p_furnished     IS NULL OR p.furnished     = p_furnished)
      AND (p_handover      IS NULL OR p.handover      = p_handover)
      AND (p_is_distress   IS NULL OR p.is_distress   = p_is_distress)
      AND (p_listing_type  IS NULL OR p.listing_type  = p_listing_type);
  END IF;

  -- ================================================================
  -- COUNT community
  -- Весь parent community минус оригинальная локация юзера
  -- ================================================================
  IF p_community_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count_community
    FROM properties p
    WHERE
      p.status     = 'active'
      AND p.visibility IN ('public', 'network')
      AND p.deal_type  = p_deal_type
      AND EXISTS (
        SELECT 1 FROM locations loc
        WHERE loc.id = p.location_id
          AND (v_city_id IS NULL OR loc.city_id = v_city_id)
          AND loc.community_id = p_community_id
      )
      -- Исключаем оригинальную локацию юзера
      AND NOT EXISTS (
        SELECT 1 FROM locations exc
        WHERE exc.id = p.location_id
          AND (
            exc.id               = ANY(p_location_ids)
            OR exc.sub_community_id = ANY(p_location_ids)
            OR exc.cluster_id       = ANY(p_location_ids)
            OR exc.building_id      = ANY(p_location_ids)
          )
      )
      AND (p_category_id   IS NULL OR p.category_id   = p_category_id)
      AND (p_unit_type_id  IS NULL OR p.unit_type_id  = p_unit_type_id)
      AND (p_sub_type_ids  IS NULL OR p.sub_type_id   = ANY(p_sub_type_ids))
      AND (p_bedrooms      IS NULL OR p.bedrooms      = ANY(p_bedrooms))
      AND (p_price_min     IS NULL OR p.price         >= p_price_min)
      AND (p_price_max     IS NULL OR p.price         <= p_price_max)
      AND (p_area_sqft_min IS NULL OR p.area_sqft     >= p_area_sqft_min)
      AND (p_area_sqft_max IS NULL OR p.area_sqft     <= p_area_sqft_max)
      AND (p_furnished     IS NULL OR p.furnished     = p_furnished)
      AND (p_handover      IS NULL OR p.handover      = p_handover)
      AND (p_is_distress   IS NULL OR p.is_distress   = p_is_distress)
      AND (p_listing_type  IS NULL OR p.listing_type  = p_listing_type);
  END IF;

  -- ================================================================
  -- RETURN
  -- ================================================================
  RETURN jsonb_build_object(
    'count_nearby',    v_count_nearby,
    'count_community', v_count_community
  );

END;
$function$
```

</details>

### `get_community_for_location`

**Возвращает:** `uuid`

**Параметры:** `p_location_id uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_community_for_location(p_location_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  WITH RECURSIVE path AS (
    SELECT id, parent_id, level FROM locations WHERE id = p_location_id
    UNION ALL
    SELECT l.id, l.parent_id, l.level FROM locations l
    JOIN path p ON l.id = p.parent_id
  )
  SELECT id FROM path WHERE level = 'community' LIMIT 1;
$function$
```

</details>

### `is_leaf_location`

**Возвращает:** `boolean`

**Параметры:** `p_id uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.is_leaf_location(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM locations
    WHERE parent_id = p_id AND is_active = true
  );
$function$
```

</details>

### `get_filter_options`

**Возвращает:** `jsonb`

**Параметры:** `p_unit_type_id uuid DEFAULT NULL::uuid`, `p_category_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_filter_options(p_unit_type_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN

  RETURN jsonb_build_object(

    -- ================================================================
    -- Категории (Residential / Commercial)
    -- ================================================================
    'categories', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en,
          'label_ar', label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'category'
        AND is_active = true
    ),

    -- ================================================================
    -- Типы объектов (фильтруем по category если передан)
    -- ================================================================
    'unit_types', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          id,
          'parent_id',   parent_id,
          'value',       value,
          'label_en',    label_en,
          'label_ar',    label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'unit_type'
        AND is_active = true
        AND (p_category_id IS NULL OR parent_id = p_category_id)
    ),

    -- ================================================================
    -- Подтипы (фильтруем по unit_type если передан)
    -- ================================================================
    'sub_types', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          id,
          'parent_id',   parent_id,
          'value',       value,
          'label_en',    label_en,
          'label_ar',    label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'sub_type'
        AND is_active = true
        AND (p_unit_type_id IS NULL OR parent_id = p_unit_type_id)
    ),

    -- ================================================================
    -- Виды из окна
    -- ================================================================
    'views', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en,
          'label_ar', label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'view'
        AND is_active = true
    ),

    -- ================================================================
    -- Расположение
    -- ================================================================
    'positions', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en,
          'label_ar', label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'position'
        AND is_active = true
    ),

    -- ================================================================
    -- Удобства
    -- ================================================================
    'amenities', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en,
          'label_ar', label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'amenity'
        AND is_active = true
    ),

    -- ================================================================
    -- Меблировка
    -- ================================================================
    'furnished_options', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en,
          'label_ar', label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'furnished'
        AND is_active = true
    ),

    -- ================================================================
    -- Уровень этажа
    -- ================================================================
    'floor_levels', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en,
          'label_ar', label_ar
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'floor_level'
        AND is_active = true
    ),

    -- ================================================================
    -- Этажей в юните — для апартаментов
    -- ================================================================
    'floors_in_unit_apt', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'floors_in_unit_apt'
        AND is_active = true
    ),

    -- ================================================================
    -- Этажей в юните — для домов/вилл
    -- ================================================================
    'floors_in_unit_house', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',       id,
          'value',    value,
          'label_en', label_en
        ) ORDER BY order_index
      )
      FROM property_type_values
      WHERE group_name = 'floors_in_unit_house'
        AND is_active = true
    ),

    -- ================================================================
    -- Статичные опции (не из БД)
    -- ================================================================
    'deal_types', jsonb_build_array(
      jsonb_build_object('value', 'sale', 'label_en', 'Sale'),
      jsonb_build_object('value', 'rent', 'label_en', 'Rent')
    ),

    'listing_types', jsonb_build_array(
      jsonb_build_object('value', 'official', 'label_en', 'Official Listing'),
      jsonb_build_object('value', 'pocket',   'label_en', 'Pocket Listing')
    ),

    'handover_options', jsonb_build_array(
      jsonb_build_object('value', 'ready',   'label_en', 'Ready'),
      jsonb_build_object('value', 'offplan', 'label_en', 'Off Plan')
    ),

    'occupancy_options', jsonb_build_array(
      jsonb_build_object('value', 'vacant',            'label_en', 'Vacant'),
      jsonb_build_object('value', 'occupied',          'label_en', 'Occupied'),
      jsonb_build_object('value', 'vacant_on_transfer','label_en', 'Vacant on Transfer')
    ),

    'price_periods', jsonb_build_array(
      jsonb_build_object('value', 'yearly',  'label_en', 'Yearly'),
      jsonb_build_object('value', 'monthly', 'label_en', 'Monthly')
    ),

    'completion_quarters', jsonb_build_array(
      jsonb_build_object('value', 'Q1', 'label_en', 'Q1'),
      jsonb_build_object('value', 'Q2', 'label_en', 'Q2'),
      jsonb_build_object('value', 'Q3', 'label_en', 'Q3'),
      jsonb_build_object('value', 'Q4', 'label_en', 'Q4')
    ),

    'bedrooms', jsonb_build_array(
      jsonb_build_object('value', 0, 'label_en', 'Studio'),
      jsonb_build_object('value', 1, 'label_en', '1 BR'),
      jsonb_build_object('value', 2, 'label_en', '2 BR'),
      jsonb_build_object('value', 3, 'label_en', '3 BR'),
      jsonb_build_object('value', 4, 'label_en', '4 BR'),
      jsonb_build_object('value', 5, 'label_en', '5 BR'),
      jsonb_build_object('value', 6, 'label_en', '6 BR'),
      jsonb_build_object('value', 7, 'label_en', '7+ BR')
    ),

    'bathrooms', jsonb_build_array(
      jsonb_build_object('value', 1, 'label_en', '1'),
      jsonb_build_object('value', 2, 'label_en', '2'),
      jsonb_build_object('value', 3, 'label_en', '3'),
      jsonb_build_object('value', 4, 'label_en', '4'),
      jsonb_build_object('value', 5, 'label_en', '5+')
    ),

    'sort_options', jsonb_build_array(
      jsonb_build_object('value', 'default',    'label_en', 'Default'),
      jsonb_build_object('value', 'price_asc',  'label_en', 'Price: Low to High'),
      jsonb_build_object('value', 'price_desc', 'label_en', 'Price: High to Low'),
      jsonb_build_object('value', 'date_desc',  'label_en', 'Newest First'),
      jsonb_build_object('value', 'date_asc',   'label_en', 'Oldest First')
    )

  );

END;
$function$
```

</details>

### `search_developers`

**Возвращает:** `jsonb`

**Параметры:** `p_query text`, `p_city_id uuid DEFAULT NULL::uuid`, `p_limit integer DEFAULT 10`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.search_developers(p_query text, p_city_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_results  jsonb;
BEGIN

  -- ================================================================
  -- Валидация
  -- ================================================================
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object(
      'results', '[]'::jsonb,
      'count',   0
    );
  END IF;

  -- ================================================================
  -- Поиск девелоперов
  -- ================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',             id,
      'name',           name,
      'name_ar',        name_ar,
      'logo_url',       logo_url,
      'total_projects', total_projects,
      'rating',         rating,
      'slug',           slug
    )
    ORDER BY
      -- Точные совпадения в начале
      CASE WHEN name ILIKE p_query || '%' THEN 0 ELSE 1 END ASC,
      -- Затем по количеству проектов
      COALESCE(total_projects, 0) DESC,
      name ASC
  ) INTO v_results
  FROM developers
  WHERE
    is_active = true
    AND (
      name    ILIKE '%' || p_query || '%'
      OR name_ar ILIKE '%' || p_query || '%'
      OR slug    ILIKE '%' || p_query || '%'
    )
    -- Фильтр по городу если передан
    AND (p_city_id IS NULL OR city_ids @> ARRAY[p_city_id])
  LIMIT p_limit;

  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   COALESCE(jsonb_array_length(COALESCE(v_results, '[]'::jsonb)), 0)
  );

END;
$function$
```

</details>

### `get_developers_with_counts`

**Возвращает:** `TABLE(id uuid, name text, name_ar text, bayut_id integer, slug text, aliases text[], source text, logo_url text, website_url text, phone text, email text, rating numeric, review_count integer, total_projects integer, is_active boolean, is_embedded boolean, created_at timestamp with time zone, buildings_matched bigint)`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_developers_with_counts()
 RETURNS TABLE(id uuid, name text, name_ar text, bayut_id integer, slug text, aliases text[], source text, logo_url text, website_url text, phone text, email text, rating numeric, review_count integer, total_projects integer, is_active boolean, is_embedded boolean, created_at timestamp with time zone, buildings_matched bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    d.id, d.name, d.name_ar, d.bayut_id, d.slug, d.aliases, d.source,
    d.logo_url, d.website_url, d.phone, d.email,
    d.rating, d.review_count, d.total_projects,
    d.is_active, d.is_embedded, d.created_at,
    COALESCE(c.cnt, 0) AS buildings_matched
  FROM developers d
  LEFT JOIN (
    SELECT developer_id, count(*) AS cnt
    FROM bayut_building_enrichment
    WHERE developer_id IS NOT NULL
    GROUP BY developer_id
  ) c ON c.developer_id = d.id;
$function$
```

</details>

### `get_developer_projects`

**Возвращает:** `jsonb`

**Параметры:** `p_developer_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`, `p_limit integer DEFAULT 20`, `p_offset integer DEFAULT 0`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_developer_projects(p_developer_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_results jsonb;
  v_count   bigint;
BEGIN

  -- Считаем total
  SELECT COUNT(*) INTO v_count
  FROM location_developers
  WHERE developer_id = p_developer_id;

  -- Результаты
  SELECT jsonb_agg(row_data) INTO v_results
  FROM (
    SELECT jsonb_build_object(
      'id',                  ld.id,
      'developer_id',        ld.developer_id,
      'location_id',         ld.location_id,
      'location_name',       l.name,
      'location_level',      l.level,
      'project_name',        ld.project_name,
      'project_status',      ld.project_status,
      'project_scope',       ld.project_scope,
      'completion_status',   ld.completion_status,
      'completion_percentage', ld.completion_percentage,
      'built_year',          ld.built_year,
      'completion_year',     ld.completion_year,
      'completion_q',        ld.completion_q,
      'start_date',          ld.start_date,
      'completion_date',     ld.completion_date,
      'total_units',         ld.total_units,
      'total_floors',        ld.total_floors,
      'total_plots',         ld.total_plots,
      'bedrooms',            ld.bedrooms,
      'type_main',           ld.type_main,
      'type_sub',            ld.type_sub,
      'price_start',         ld.price_start,
      'area_start',          ld.area_start,
      'amenities',           ld.amenities,
      'payment_plans',       ld.payment_plans,
      'is_post_handover',    ld.is_post_handover,
      'media',               ld.media,
      'documents',           ld.documents,
      'legal',               ld.legal,
      'unit_rooms',          ld.unit_rooms,
      'unit_baths',          ld.unit_baths,
      'description',         ld.description,
      'created_at',          ld.created_at,
      'updated_at',          ld.updated_at
    ) AS row_data
    FROM location_developers ld
    LEFT JOIN locations l ON l.id = ld.location_id
    WHERE ld.developer_id = p_developer_id
    ORDER BY ld.completion_year DESC NULLS LAST, ld.project_name ASC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   v_count,
    'limit',   p_limit,
    'offset',  p_offset
  );

END;
$function$
```

</details>

### `get_agent_listings`

**Возвращает:** `jsonb`

**Параметры:** `p_agent_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`, `p_limit integer DEFAULT 20`, `p_offset integer DEFAULT 0`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_agent_listings(p_agent_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_network_ids     uuid[];
  v_results         jsonb;
  v_count           bigint;
BEGIN

  -- Сеть юзера
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;

  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- Считаем total
  SELECT COUNT(*) INTO v_count
  FROM properties p
  WHERE
    p.owner_id = p_agent_id
    AND p.status = 'active'
    AND (
      -- Свой профиль или агент из сети — public + network
      CASE
        WHEN p_agent_id = v_current_user_id       THEN p.visibility IN ('public', 'network')
        WHEN p_agent_id = ANY(v_network_ids)       THEN p.visibility IN ('public', 'network')
        ELSE                                             p.visibility = 'public'
      END
    );

  -- Результаты
  SELECT jsonb_agg(row_data) INTO v_results
  FROM (
    SELECT jsonb_build_object(
      'id',                  p.id,
      'owner_id',            p.owner_id,
      'unit_id',             p.unit_id,
      'location_id',         p.location_id,
      'category_id',         p.category_id,
      'unit_type_id',        p.unit_type_id,
      'sub_type_id',         p.sub_type_id,
      'listing_type',        p.listing_type,
      'deal_type',           p.deal_type,
      'price_period',        p.price_period,
      'visibility',          p.visibility,
      'status',              p.status,
      'bedrooms',            p.bedrooms,
      'bathrooms',           p.bathrooms,
      'is_maid',             p.is_maid,
      'is_hotel_pool',       p.is_hotel_pool,
      'area_sqft',           p.area_sqft,
      'area_sqm',            p.area_sqm,
      'plot_sqft',           p.plot_sqft,
      'plot_sqm',            p.plot_sqm,
      'floor_number',        p.floor_number,
      'floor_level_id',      p.floor_level_id,
      'floors_in_unit',      p.floors_in_unit,
      'layout_id',           p.layout_id,
      'view_ids',            p.view_ids,
      'position_ids',        p.position_ids,
      'amenity_ids',         p.amenity_ids,
      'furnished',           p.furnished,
      'lat',                 p.lat,
      'lng',                 p.lng,
      'price',               p.price,
      'previous_price',      p.previous_price,
      'price_currency',      p.price_currency,
      'price_changed_at',    p.price_changed_at,
      'is_negotiable',       p.is_negotiable,
      'commission_included', p.commission_included,
      'is_distress',         p.is_distress,
      'occupancy_status',    p.occupancy_status,
      'lease_until',         p.lease_until,
      'description',         p.description,
      'address_from_bayut',  p.address_from_bayut,
      'title_deed_number',   p.title_deed_number,
      'title_deed_year',     p.title_deed_year,
      'plot_number',         p.plot_number,
      'municipality_number', p.municipality_number,
      'developer_id',        p.developer_id,
      'developer_name',      p.developer_name,
      'handover',            p.handover,
      'completion_year',     p.completion_year,
      'completion_q',        p.completion_q,
      'listing_start',       p.listing_start,
      'listing_end',         p.listing_end,
      'last_actualized_at',  p.last_actualized_at,
      'published_at',        p.published_at,
      'expires_at',          p.expires_at,
      'views_count',         p.views_count,
      'unique_views_count',  p.unique_views_count,
      'contacts_count',      p.contacts_count,
      'impressions_count',   p.impressions_count,
      'comments_count',      p.comments_count,
      'created_at',          p.created_at,
      'updated_at',          p.updated_at,
      'location_name',       l.name,
      'location_level',      l.level,
      'developer_name_ref',  d.name,
      'developer_logo_url',  d.logo_url,
      'owner_badge_level',   ab.badge_level,
      'is_network',          (p.owner_id = ANY(v_network_ids))
    ) AS row_data
    FROM properties p
    LEFT JOIN locations l    ON l.id = p.location_id
    LEFT JOIN developers d   ON d.id = p.developer_id
    LEFT JOIN agent_badge ab ON ab.user_id = p.owner_id
    WHERE
      p.owner_id = p_agent_id
      AND p.status = 'active'
      AND (
        CASE
          WHEN p_agent_id = v_current_user_id  THEN p.visibility IN ('public', 'network')
          WHEN p_agent_id = ANY(v_network_ids)  THEN p.visibility IN ('public', 'network')
          ELSE                                       p.visibility = 'public'
        END
      )
    ORDER BY p.published_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   v_count,
    'limit',   p_limit,
    'offset',  p_offset
  );

END;
$function$
```

</details>

### `get_saved_filters`

> ⚠️ **Тело ниже может быть устаревшим.** Актуальная формула `unseen_count` (re-notify + my→0): `CASE WHEN sf.filters->>'scope'='my' THEN 0 ELSE <count filter_matches active, GREATEST(p.created_at,p.updated_at) > GREATEST(sf.created_at, COALESCE(user_filter_seen.seen_at,'epoch'))> END`. Источник истины — живой `pg_get_functiondef` + `applied/2026-06-23-get-saved-filters-my-scope-zero.sql` (+ re-notify патчи).

**Возвращает:** `jsonb`

**Параметры:** `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_saved_filters(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_results          jsonb;
BEGIN

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                sf.id,
      'auto_name',         sf.auto_name,
      'filters',           sf.filters,
      'ai_query_text',     sf.ai_query_text,
      'unseen_count',      sf.unseen_count,
      'notification_type', sf.notification_type,
      'city_id',           sf.city_id,
      'city_name',         l.name,
      'last_checked_at',   sf.last_checked_at,
      'created_at',        sf.created_at
    )
    ORDER BY sf.created_at DESC
  ) INTO v_results
  FROM saved_filters sf
  LEFT JOIN locations l ON l.id = sf.city_id
  WHERE sf.user_id   = v_current_user_id
    AND sf.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   COALESCE(jsonb_array_length(COALESCE(v_results, '[]'::jsonb)), 0)
  );

END;
$function$
```

</details>

### `save_filter`

**Возвращает:** `jsonb`

**Параметры:** `p_filters jsonb`, `p_auto_name text DEFAULT NULL::text`, `p_ai_query_text text DEFAULT NULL::text`, `p_city_id uuid DEFAULT NULL::uuid`, `p_notification_type text DEFAULT 'digest'::text`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.save_filter(p_filters jsonb, p_auto_name text DEFAULT NULL::text, p_ai_query_text text DEFAULT NULL::text, p_city_id uuid DEFAULT NULL::uuid, p_notification_type text DEFAULT 'digest'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_plan             text;
  v_city_id          uuid;
  v_filter_id        uuid;
  v_notification     text;
BEGIN

  -- ================================================================
  -- Валидация
  -- ================================================================
  IF p_filters IS NULL THEN
    RAISE EXCEPTION 'filters is required';
  END IF;

  -- ================================================================
  -- Определить city_id
  -- ================================================================
  IF p_city_id IS NOT NULL THEN
    v_city_id := p_city_id;
  ELSE
    SELECT city_id INTO v_city_id
    FROM user_context
    WHERE user_id = v_current_user_id;
  END IF;

  -- ================================================================
  -- Определить тип уведомлений по плану
  -- Free → digest, Pro → realtime (если не передан явно)
  -- ================================================================
  IF p_notification_type IS NOT NULL THEN
    v_notification := p_notification_type;
  ELSE
    SELECT plan INTO v_plan
    FROM user_context
    WHERE user_id = v_current_user_id;

    v_notification := CASE
      WHEN v_plan = 'pro' THEN 'realtime'
      ELSE 'digest'
    END;
  END IF;

  -- ================================================================
  -- Сохранить фильтр
  -- ================================================================
  INSERT INTO saved_filters (
    user_id,
    auto_name,
    filters,
    ai_query_text,
    city_id,
    notification_type,
    unseen_count,
    created_at
  )
  VALUES (
    v_current_user_id,
    p_auto_name,
    p_filters,
    p_ai_query_text,
    v_city_id,
    v_notification,
    0,
    now()
  )
  RETURNING id INTO v_filter_id;

  -- ================================================================
  -- Вернуть созданный фильтр
  -- ================================================================
  RETURN jsonb_build_object(
    'id',                v_filter_id,
    'auto_name',         p_auto_name,
    'filters',           p_filters,
    'ai_query_text',     p_ai_query_text,
    'city_id',           v_city_id,
    'notification_type', v_notification,
    'unseen_count',      0,
    'created_at',        now()
  );

END;
$function$
```

</details>

### `delete_filter`

**Возвращает:** `jsonb`

**Параметры:** `p_filter_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.delete_filter(p_filter_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_rows_affected    int;
BEGIN

  -- Soft delete — только свой фильтр
  UPDATE saved_filters
  SET deleted_at = now()
  WHERE id       = p_filter_id
    AND user_id  = v_current_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'filter not found or already deleted'
    );
  END IF;

  RETURN jsonb_build_object(
    'success',   true,
    'filter_id', p_filter_id
  );

END;
$function$
```

</details>

### `update_filter_notification`

**Возвращает:** `jsonb`

**Параметры:** `p_filter_id uuid`, `p_notification_type text`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.update_filter_notification(p_filter_id uuid, p_notification_type text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_rows_affected    int;
BEGIN

  IF p_notification_type NOT IN ('realtime', 'digest') THEN
    RAISE EXCEPTION 'notification_type must be realtime or digest';
  END IF;

  UPDATE saved_filters
  SET notification_type = p_notification_type
  WHERE id      = p_filter_id
    AND user_id = v_current_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'filter not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success',           true,
    'filter_id',         p_filter_id,
    'notification_type', p_notification_type
  );

END;
$function$
```

</details>

### `get_saved_properties`

**Возвращает:** `jsonb`

**Параметры:** `p_user_id uuid DEFAULT NULL::uuid`, `p_limit integer DEFAULT 20`, `p_offset integer DEFAULT 0`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_saved_properties(p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_network_ids     uuid[];
  v_results         jsonb;
  v_count           bigint;
BEGIN

  -- Сеть юзера
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;

  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- Считаем total
  SELECT COUNT(*) INTO v_count
  FROM saved_properties sp
  JOIN properties p ON p.id = sp.property_id
  WHERE sp.user_id = v_current_user_id;

  -- Получаем результаты
  SELECT jsonb_agg(row_data) INTO v_results
  FROM (
    SELECT jsonb_build_object(
      'id',                  p.id,
      'owner_id',            p.owner_id,
      'unit_id',             p.unit_id,
      'location_id',         p.location_id,
      'category_id',         p.category_id,
      'unit_type_id',        p.unit_type_id,
      'sub_type_id',         p.sub_type_id,
      'listing_type',        p.listing_type,
      'deal_type',           p.deal_type,
      'price_period',        p.price_period,
      'visibility',          p.visibility,
      'status',              p.status,
      'bedrooms',            p.bedrooms,
      'bathrooms',           p.bathrooms,
      'is_maid',             p.is_maid,
      'is_hotel_pool',       p.is_hotel_pool,
      'area_sqft',           p.area_sqft,
      'area_sqm',            p.area_sqm,
      'plot_sqft',           p.plot_sqft,
      'plot_sqm',            p.plot_sqm,
      'floor_number',        p.floor_number,
      'floor_level_id',      p.floor_level_id,
      'floors_in_unit',      p.floors_in_unit,
      'layout_id',           p.layout_id,
      'view_ids',            p.view_ids,
      'position_ids',        p.position_ids,
      'amenity_ids',         p.amenity_ids,
      'furnished',           p.furnished,
      'lat',                 p.lat,
      'lng',                 p.lng,
      'price',               p.price,
      'previous_price',      p.previous_price,
      'price_currency',      p.price_currency,
      'price_changed_at',    p.price_changed_at,
      'is_negotiable',       p.is_negotiable,
      'commission_included', p.commission_included,
      'is_distress',         p.is_distress,
      'occupancy_status',    p.occupancy_status,
      'lease_until',         p.lease_until,
      'description',         p.description,
      'address_from_bayut',  p.address_from_bayut,
      'title_deed_number',   p.title_deed_number,
      'title_deed_year',     p.title_deed_year,
      'plot_number',         p.plot_number,
      'municipality_number', p.municipality_number,
      'developer_id',        p.developer_id,
      'developer_name',      p.developer_name,
      'handover',            p.handover,
      'completion_year',     p.completion_year,
      'completion_q',        p.completion_q,
      'listing_start',       p.listing_start,
      'listing_end',         p.listing_end,
      'last_actualized_at',  p.last_actualized_at,
      'published_at',        p.published_at,
      'expires_at',          p.expires_at,
      'views_count',         p.views_count,
      'unique_views_count',  p.unique_views_count,
      'contacts_count',      p.contacts_count,
      'impressions_count',   p.impressions_count,
      'comments_count',      p.comments_count,
      'created_at',          p.created_at,
      'updated_at',          p.updated_at,
      'location_name',       l.name,
      'location_level',      l.level,
      'developer_name_ref',  d.name,
      'developer_logo_url',  d.logo_url,
      'owner_badge_level',   ab.badge_level,
      'is_network',          (p.owner_id = ANY(v_network_ids)),
      'saved_at',            sp.created_at
    ) AS row_data
    FROM saved_properties sp
    JOIN properties p        ON p.id = sp.property_id
    LEFT JOIN locations l    ON l.id = p.location_id
    LEFT JOIN developers d   ON d.id = p.developer_id
    LEFT JOIN agent_badge ab ON ab.user_id = p.owner_id
    WHERE sp.user_id = v_current_user_id
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'results', COALESCE(v_results, '[]'::jsonb),
    'count',   v_count,
    'limit',   p_limit,
    'offset',  p_offset
  );

END;
$function$
```

</details>

### `save_property`

**Возвращает:** `jsonb`

**Параметры:** `p_property_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.save_property(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_existing_id     uuid;
BEGIN

  -- Проверяем существует ли объект
  IF NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id) THEN
    RETURN jsonb_build_object('error', 'property not found');
  END IF;

  -- Toggle: если уже сохранён — удаляем
  SELECT id INTO v_existing_id
  FROM saved_properties
  WHERE user_id = v_current_user_id
    AND property_id = p_property_id;

  IF FOUND THEN
    DELETE FROM saved_properties
    WHERE id = v_existing_id;

    RETURN jsonb_build_object(
      'action', 'removed',
      'property_id', p_property_id
    );
  END IF;

  -- Иначе сохраняем
  INSERT INTO saved_properties (user_id, property_id)
  VALUES (v_current_user_id, p_property_id);

  RETURN jsonb_build_object(
    'action', 'saved',
    'property_id', p_property_id
  );

END;
$function$
```

</details>

### `track_view`

**Возвращает:** `jsonb`

**Параметры:** `p_property_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.track_view(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_owner_id         uuid;
  v_already_seen     boolean := false;
BEGIN

  -- ================================================================
  -- Получить владельца объекта
  -- ================================================================
  SELECT owner_id INTO v_owner_id
  FROM properties
  WHERE id = p_property_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'property not found');
  END IF;

  -- ================================================================
  -- Не считать просмотры владельца своего объекта
  -- ================================================================
  IF v_owner_id = v_current_user_id THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'owner view');
  END IF;

  -- ================================================================
  -- Проверить смотрел ли юзер этот объект сегодня
  -- ================================================================
  SELECT EXISTS (
    SELECT 1 FROM user_seen_listings
    WHERE user_id     = v_current_user_id
      AND property_id = p_property_id
      AND seen_at::date = CURRENT_DATE
  ) INTO v_already_seen;

  -- ================================================================
  -- Всегда обновляем views_count
  -- ================================================================
  UPDATE properties SET
    views_count = views_count + 1
  WHERE id = p_property_id;

  -- ================================================================
  -- unique_views_count и запись в seen — только если первый раз
  -- ================================================================
  IF NOT v_already_seen THEN
    INSERT INTO user_seen_listings (user_id, property_id, seen_at)
    VALUES (v_current_user_id, p_property_id, now())
    ON CONFLICT (user_id, property_id) DO UPDATE SET seen_at = now();

    UPDATE properties SET
      unique_views_count = unique_views_count + 1
    WHERE id = p_property_id;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'skipped',      false,
    'unique',       NOT v_already_seen
  );

END;
$function$
```

</details>

### `track_impressions`

**Возвращает:** `jsonb`

**Параметры:** `p_property_ids uuid[]`, `p_user_id uuid DEFAULT NULL::uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.track_impressions(p_property_ids uuid[], p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_updated          int;
BEGIN

  -- ================================================================
  -- Валидация
  -- ================================================================
  IF p_property_ids IS NULL OR cardinality(p_property_ids) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'property_ids is required');
  END IF;

  -- ================================================================
  -- Обновить impressions_count одним запросом
  -- Исключаем свои объекты
  -- ================================================================
  UPDATE properties
  SET impressions_count = impressions_count + 1
  WHERE id = ANY(p_property_ids)
    AND owner_id != v_current_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated
  );

END;
$function$
```

</details>

### `get_property_viewers`

**Возвращает:** `jsonb`

**Параметры:** `p_property_id uuid`, `p_user_id uuid DEFAULT NULL::uuid`, `p_limit integer DEFAULT 50`, `p_offset integer DEFAULT 0`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_property_viewers(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_user_id  uuid := COALESCE(p_user_id, auth.uid());
  v_owner_id         uuid;
  v_plan             text;
  v_results          jsonb;
  v_total            bigint;
BEGIN

  -- ================================================================
  -- Проверить что объект принадлежит текущему юзеру
  -- ================================================================
  SELECT owner_id INTO v_owner_id
  FROM properties
  WHERE id = p_property_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'property not found');
  END IF;

  IF v_owner_id != v_current_user_id THEN
    RETURN jsonb_build_object('error', 'access denied');
  END IF;

  -- ================================================================
  -- Проверить план юзера — только Pro
  -- ================================================================
  SELECT plan INTO v_plan
  FROM user_context
  WHERE user_id = v_current_user_id;

  IF v_plan != 'pro' THEN
    RETURN jsonb_build_object(
      'error',    'pro_required',
      'message',  'Upgrade to Pro to see who viewed your listing'
    );
  END IF;

  -- ================================================================
  -- Считаем total уникальных просмотревших
  -- ================================================================
  SELECT COUNT(DISTINCT user_id) INTO v_total
  FROM user_seen_listings
  WHERE property_id = p_property_id;

  -- ================================================================
  -- Получить список просмотревших
  -- ================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id',     u.id,
      'full_name',   u.full_name,
      'photo_url',   us.photo_url,
      'agency_name', ui.agency_name,
      'badge_level', ab.badge_level,
      'seen_at',     sl.last_seen,
      'views_count', sl.views_count
    )
    ORDER BY sl.last_seen DESC
  ) INTO v_results
  FROM (
    -- Агрегируем по юзеру — последний просмотр и количество
    SELECT
      user_id,
      MAX(seen_at)  AS last_seen,
      COUNT(*)      AS views_count
    FROM user_seen_listings
    WHERE property_id = p_property_id
    GROUP BY user_id
    ORDER BY MAX(seen_at) DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) sl
  JOIN users u         ON u.id  = sl.user_id
  LEFT JOIN user_settings us   ON us.user_id  = sl.user_id
  LEFT JOIN user_identities ui ON ui.user_id  = sl.user_id
  LEFT JOIN agent_badge ab     ON ab.user_id  = sl.user_id;

  RETURN jsonb_build_object(
    'results',      COALESCE(v_results, '[]'::jsonb),
    'total_viewers', v_total,
    'limit',        p_limit,
    'offset',       p_offset
  );

END;
$function$
```

</details>

### `has_permission`

**Возвращает:** `boolean`

**Параметры:** `p_user_id uuid`, `p_action text`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT role IN ('admin','superadmin')
  FROM users WHERE id = p_user_id;
$function$
```

</details>

### `get_pocket_access_limit`

**Возвращает:** `integer`

**Параметры:** `p_user_id uuid`

<details><summary>Исходник функции</summary>

```sql
CREATE OR REPLACE FUNCTION public.get_pocket_access_limit(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_badge text;
  v_ratio integer;
  v_active_listings integer;
  v_fixed integer;
BEGIN
  SELECT badge_level, reciprocity_ratio INTO v_badge, v_ratio
  FROM agent_badge WHERE user_id = p_user_id;

  IF v_badge IS NULL OR v_badge = 'none' THEN
    SELECT value::integer INTO v_fixed FROM ai_configs WHERE key = 'reciprocity_none_fixed';
    RETURN COALESCE(v_fixed, 5);
  END IF;

  IF v_badge = 'internal' THEN
    RETURN 999999;
  END IF;

  SELECT COUNT(*) INTO v_active_listings
  FROM properties
  WHERE owner_id = p_user_id
  AND status = 'active'
  AND visibility IN ('public','network');

  RETURN v_active_listings * COALESCE(v_ratio, 5);
END;
$function$
```

</details>

---

## RPC — служебные (n8n / триггеры / парсеры)

| RPC                                          | Возвращает                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activate_on_onboarding_complete`            | void                                                                                                                                                                            |
| `activate_user`                              | trigger                                                                                                                                                                         |
| `apply_subscription_gift`                    | trigger                                                                                                                                                                         |
| `bal_set_updated_at`                         | trigger                                                                                                                                                                         |
| `claim_next_job`                             | SETOF job_queue                                                                                                                                                                 |
| `copy_location_coords`                       | trigger                                                                                                                                                                         |
| `create_admin`                               | json                                                                                                                                                                            |
| `delete_admin`                               | json                                                                                                                                                                            |
| `expire_pro_subscriptions`                   | TABLE(user_id uuid, subscription_id uuid)                                                                                                                                       |
| `get_notification_template`                  | TABLE(message_text text, channel text)                                                                                                                                          |
| `get_pro_expiring_soon`                      | TABLE(user_id uuid, telegram_id bigint, whatsapp_phone text, full_name text, current_period_end timestamp with time zone, active_listings integer, saved_filters_count integer) |
| `grant_gift_subscription`                    | uuid                                                                                                                                                                            |
| `log_notification`                           | bigint                                                                                                                                                                          |
| `log_property_changes`                       | trigger                                                                                                                                                                         |
| `match_chat_embeddings`                      | TABLE(id uuid, message_role text, message_text text, metadata jsonb, similarity double precision, created_at timestamp with time zone)                                          |
| `match_embeddings`                           | TABLE(id uuid, content text, source_type text, scope text, metadata jsonb, similarity double precision)                                                                         |
| `move_location`                              | jsonb                                                                                                                                                                           |
| `notify_event_webhook`                       | trigger                                                                                                                                                                         |
| `notify_subscription_gift`                   | trigger                                                                                                                                                                         |
| `process_bayut_developers`                   | jsonb                                                                                                                                                                           |
| `process_bayut_locations`                    | jsonb                                                                                                                                                                           |
| `process_bayut_projects`                     | jsonb                                                                                                                                                                           |
| `process_developers`                         | jsonb                                                                                                                                                                           |
| `rebuild_external_neighbors`                 | TABLE(total_processed integer, total_inserted integer)                                                                                                                          |
| `rebuild_location_neighbors`                 | TABLE(total_processed integer, total_inserted integer)                                                                                                                          |
| `recalculate_badges`                         | integer                                                                                                                                                                         |
| `recompute_location_leaves`                  | integer                                                                                                                                                                         |
| `refresh_user_network`                       | trigger                                                                                                                                                                         |
| `retroactive_resync_all`                     | integer                                                                                                                                                                         |
| `retroactive_resync_unmatched`               | integer                                                                                                                                                                         |
| `search_bayut_listings`                      | jsonb                                                                                                                                                                           |
| `sync_activity_score`                        | trigger                                                                                                                                                                         |
| `sync_context_agency_members_count`          | trigger                                                                                                                                                                         |
| `sync_context_badge`                         | trigger                                                                                                                                                                         |
| `sync_context_identity`                      | trigger                                                                                                                                                                         |
| `sync_context_profile`                       | trigger                                                                                                                                                                         |
| `sync_context_score`                         | trigger                                                                                                                                                                         |
| `sync_context_subscription`                  | trigger                                                                                                                                                                         |
| `sync_geom`                                  | trigger                                                                                                                                                                         |
| `sync_listings_to_bayut_building_enrichment` | text                                                                                                                                                                            |
| `trg_fn_process_bayut_locations`             | trigger                                                                                                                                                                         |
| `trg_sync_context_agency`                    | trigger                                                                                                                                                                         |
| `trg_sync_context_comments`                  | trigger                                                                                                                                                                         |
| `trg_sync_context_events`                    | trigger                                                                                                                                                                         |
| `trg_sync_context_friends`                   | trigger                                                                                                                                                                         |
| `trg_sync_context_listings`                  | trigger                                                                                                                                                                         |
| `trg_sync_context_pdf`                       | trigger                                                                                                                                                                         |
| `trg_sync_context_referrals`                 | trigger                                                                                                                                                                         |
| `trg_sync_context_saved_filters`             | trigger                                                                                                                                                                         |
| `trg_sync_context_score`                     | trigger                                                                                                                                                                         |
| `update_location_developer_ids`              | jsonb                                                                                                                                                                           |
| `update_location_hierarchy_ids`              | void                                                                                                                                                                            |
| `update_property_stats`                      | trigger                                                                                                                                                                         |
| `update_updated_at`                          | trigger                                                                                                                                                                         |
| `upsert_location_from_bayut`                 | void                                                                                                                                                                            |
| `v5_get_enrichment_queue`                    | TABLE(leaf_location_id uuid, listing_id bigint, bayut_id bigint, url text)                                                                                                      |
| `v5_save_enrichment`                         | text                                                                                                                                                                            |

---

## Триггеры

| Таблица              | Триггер                         | Когда  | Событие                    | Функция                               |
| -------------------- | ------------------------------- | ------ | -------------------------- | ------------------------------------- |
| `agency_members`     | trg_refresh_network_members     | AFTER  | INSERT OR DELETE OR UPDATE | `refresh_user_network()`              |
| `agency_members`     | trg_sync_context_agency_members | AFTER  | INSERT OR DELETE OR UPDATE | `sync_context_agency_members_count()` |
| `agent_activity`     | trg_sync_context_score          | AFTER  | INSERT OR UPDATE           | `sync_context_score()`                |
| `agent_badge`        | trg_sync_context_badge          | AFTER  | INSERT OR UPDATE           | `sync_context_badge()`                |
| `agent_score_events` | trg_sync_activity_score         | AFTER  | INSERT                     | `sync_activity_score()`               |
| `friendships`        | trg_refresh_network_friendships | AFTER  | INSERT OR DELETE OR UPDATE | `refresh_user_network()`              |
| `friendships`        | trg_sync_context_friends        | AFTER  | INSERT OR DELETE OR UPDATE | `trg_sync_context_friends()`          |
| `locations`          | trg_locations_geom              | BEFORE | INSERT OR UPDATE           | `sync_geom()`                         |
| `pdf_generations`    | trg_sync_context_pdf            | AFTER  | INSERT                     | `trg_sync_context_pdf()`              |
| `properties`         | trg_activate_on_property        | AFTER  | INSERT                     | `activate_user()`                     |
| `properties`         | trg_properties_coords           | BEFORE | INSERT                     | `copy_location_coords()`              |
| `properties`         | trg_properties_geom             | BEFORE | INSERT OR UPDATE           | `sync_geom()`                         |
| `properties`         | trg_properties_updated_at       | BEFORE | UPDATE                     | `update_updated_at()`                 |
| `properties`         | trg_property_logs               | BEFORE | UPDATE                     | `log_property_changes()`              |
| `properties`         | trg_property_price_flags        | BEFORE | INSERT OR UPDATE           | `set_property_price_flags()`          |
| `properties`         | trg_sync_context_listings       | AFTER  | INSERT OR DELETE OR UPDATE | `trg_sync_context_listings()`         |
| `property_comments`  | trg_sync_context_comments       | AFTER  | INSERT OR DELETE OR UPDATE | `trg_sync_context_comments()`         |
| `property_events`    | trg_property_stats              | AFTER  | INSERT                     | `update_property_stats()`             |
| `referrals`          | trg_sync_context_referrals      | AFTER  | INSERT OR UPDATE           | `trg_sync_context_referrals()`        |
| `saved_filters`      | trg_activate_on_filter          | AFTER  | INSERT                     | `activate_user()`                     |
| `saved_filters`      | trg_sync_context_saved_filters  | AFTER  | INSERT OR DELETE OR UPDATE | `trg_sync_context_saved_filters()`    |
| `subscription_gifts` | trg_apply_subscription_gift     | AFTER  | INSERT                     | `apply_subscription_gift()`           |
| `subscription_gifts` | trg_notify_subscription_gift    | AFTER  | INSERT                     | `notify_subscription_gift()`          |
| `subscriptions`      | trg_sync_context_subscription   | AFTER  | INSERT OR UPDATE           | `sync_context_subscription()`         |
| `units`              | trg_units_updated_at            | BEFORE | UPDATE                     | `update_updated_at()`                 |
| `user_events`        | trg_notify_event_webhook        | AFTER  | INSERT                     | `notify_event_webhook()`              |
| `user_events`        | trg_sync_context_events         | AFTER  | INSERT                     | `trg_sync_context_events()`           |
| `user_identities`    | trg_sync_context_identity       | AFTER  | INSERT OR UPDATE           | `sync_context_identity()`             |
| `users`              | trg_sync_context_profile        | AFTER  | INSERT OR UPDATE           | `sync_context_profile()`              |
| `users`              | trg_users_updated_at            | BEFORE | UPDATE                     | `update_updated_at()`                 |

---

## RLS-политики

| Таблица                 | Политика               | Команда | Роли            | USING / CHECK                                                                                 |
| ----------------------- | ---------------------- | ------- | --------------- | --------------------------------------------------------------------------------------------- |
| `admin_audit_log`       | admins_all             | ALL     | {authenticated} | `(auth.user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                         |
| `admin_audit_log`       | service_role_all       | ALL     | {service_role}  | `true`                                                                                        |
| `admins`                | admins_select          | SELECT  | {authenticated} | `(auth.admin_role() IS NOT NULL)`                                                             |
| `admins`                | superadmin_insert      | INSERT  | {authenticated} | `(auth.admin_role() = 'superadmin'::text)`                                                    |
| `admins`                | superadmin_update      | UPDATE  | {authenticated} | `(auth.admin_role() = 'superadmin'::text)`                                                    |
| `agent_badge`           | badge_select           | SELECT  | {public}        | `true`                                                                                        |
| `agent_badge`           | service_role_all       | ALL     | {service_role}  | `true`                                                                                        |
| `agent_badge`           | users_select           | SELECT  | {authenticated} | `((user_id = auth.uid()) OR (auth.user_role() = ANY (ARRAY['admin'::text, 'moderator'::text…` |
| `agent_badge`           | users_select_own       | SELECT  | {authenticated} | `(user_id = auth.uid())`                                                                      |
| `drafts`                | drafts_insert          | INSERT  | {public}        | `(user_id = auth.uid())`                                                                      |
| `drafts`                | drafts_select          | SELECT  | {public}        | `(user_id = auth.uid())`                                                                      |
| `notification_flows`    | admins_select_flows    | SELECT  | {authenticated} | `(auth.admin_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                        |
| `notification_flows`    | admins_update_flows    | UPDATE  | {authenticated} | `(auth.admin_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                        |
| `notification_messages` | admins_all_messages    | ALL     | {authenticated} | `(auth.admin_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                        |
| `notification_messages` | admins_select_messages | SELECT  | {authenticated} | `(auth.admin_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                        |
| `properties`            | properties_insert      | INSERT  | {public}        | `(owner_id = auth.uid())`                                                                     |
| `properties`            | properties_select      | SELECT  | {public}        | `((owner_id = auth.uid()) OR (visibility = 'public'::text) OR ((visibility = 'network'::tex…` |
| `property_photos`       | photos_insert          | INSERT  | {public}        | `(EXISTS ( SELECT 1`                                                                          |
| `saved_filters`         | filters_insert         | INSERT  | {public}        | `(user_id = auth.uid())`                                                                      |
| `saved_filters`         | filters_select         | SELECT  | {public}        | `(user_id = auth.uid())`                                                                      |
| `saved_filters`         | filters_update         | UPDATE  | {public}        | `(user_id = auth.uid())`                                                                      |
| `subscriptions`         | admins_insert          | INSERT  | {authenticated} | `(auth.user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                         |
| `subscriptions`         | service_role_all       | ALL     | {service_role}  | `true`                                                                                        |
| `subscriptions`         | users_select           | SELECT  | {authenticated} | `((user_id = auth.uid()) OR (auth.user_role() = ANY (ARRAY['admin'::text, 'moderator'::text…` |
| `subscriptions`         | users_select_own       | SELECT  | {authenticated} | `(user_id = auth.uid())`                                                                      |
| `user_context`          | context_select         | SELECT  | {public}        | `(user_id = auth.uid())`                                                                      |
| `user_identities`       | admins_update          | UPDATE  | {authenticated} | `(auth.user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                         |
| `user_identities`       | users_select           | SELECT  | {authenticated} | `((user_id = auth.uid()) OR (auth.user_role() = ANY (ARRAY['admin'::text, 'moderator'::text…` |
| `user_identities`       | users_select_own       | SELECT  | {authenticated} | `(user_id = auth.uid())`                                                                      |
| `users`                 | admins_update          | UPDATE  | {authenticated} | `(auth.user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))`                         |
| `users`                 | service_role_all       | ALL     | {service_role}  | `true`                                                                                        |
| `users`                 | users_select           | SELECT  | {authenticated} | `((id = auth.uid()) OR (auth.user_role() = ANY (ARRAY['admin'::text, 'moderator'::text, 'su…` |

---

## Таблицы (MrSQM-релевантные)

### Объекты недвижимости

#### `properties`

| Колонка               | Тип                             | Ключ |
| --------------------- | ------------------------------- | ---- | ------------------------------------------------------------------ |
| `id`                  | uuid                            | PK   |
| `owner_id`            | uuid                            | FK   |
| `unit_id`             | uuid                            | FK   |
| `location_id`         | uuid                            | FK   |
| `category_id`         | uuid                            | FK   |
| `unit_type_id`        | uuid                            | FK   |
| `sub_type_id`         | uuid                            | FK   |
| `listing_type`        | text                            |      |
| `deal_type`           | text                            |      |
| `price_period`        | text                            |      |
| `visibility`          | text                            |      |
| `status`              | text                            |      |
| `bedrooms`            | integer                         |      |
| `bathrooms`           | integer                         |      |
| `is_maid`             | boolean                         |      |
| `is_study`            | boolean                         |      |
| `is_hotel_pool`       | boolean                         |      |
| `area_sqft`           | numeric                         |      |
| `area_sqm`            | numeric                         |      |
| `plot_sqft`           | numeric                         |      |
| `plot_sqm`            | numeric                         |      |
| `floor_number`        | integer                         |      |
| `floor_level_id`      | uuid                            | FK   |
| `floors_in_unit`      | text                            |      | legacy (оставлен для отката, не используется фронтом с 2026-06-21) |
| `floors_in_unit_id`   | uuid                            | FK   | → property_type_values (этажность дома G+0…G+3)                    |
| `layout_id`           | uuid                            | FK   |
| `view_ids`            | text[]                          |      |
| `position_ids`        | text[]                          |      |
| `amenity_ids`         | text[]                          |      |
| `furnished`           | text                            |      |
| `lat`                 | numeric                         |      |
| `lng`                 | numeric                         |      |
| `price`               | numeric                         |      |
| `previous_price`      | numeric                         |      |
| `original_price`      | numeric                         |      | OP/Original Value (продажа); ниже неё → is_below_op                |
| `price_currency`      | text                            |      |
| `price_changed_at`    | timestamp with time zone        |      |
| `cheques`             | integer                         |      | кол-во чеков оплаты (аренда, ОАЭ)                                  |
| `is_negotiable`       | boolean                         |      |
| `commission_included` | boolean                         |      |
| `is_below_op`         | boolean                         |      | авто: original_price задан И price < original_price (триггер)      |
| `is_reduced`          | boolean                         |      | sticky: TRUE при снижении цены, не сбрасывается (триггер)          |
| `is_distress`         | boolean                         |      |
| `occupancy_status`    | text                            |      |
| `lease_until`         | date                            |      |
| `description`         | text                            |      |
| `address_from_bayut`  | text                            |      |
| `title_deed_number`   | text                            |      |
| `title_deed_year`     | integer                         |      |
| `plot_number`         | text                            |      |
| `municipality_number` | text                            |      |
| `developer_id`        | uuid                            | FK   |
| `handover`            | text                            |      |
| `completion_year`     | integer                         |      |
| `completion_q`        | text                            |      |
| `listing_start`       | date                            |      |
| `listing_end`         | date                            |      |
| `last_actualized_at`  | timestamp with time zone        |      |
| `published_at`        | timestamp with time zone        |      |
| `expires_at`          | timestamp with time zone        |      |
| `views_count`         | integer                         |      |
| `unique_views_count`  | integer                         |      |
| `contacts_count`      | integer                         |      |
| `impressions_count`   | integer                         |      |
| `comments_count`      | integer                         |      |
| `created_at`          | timestamp with time zone        |      |
| `updated_at`          | timestamp with time zone        |      |
| `geom`                | extensions.geometry(Point,4326) |      |
| `developer_name`      | text                            |      |

_Ограничения:_ `properties_deal_type_check`; `properties_completion_q_check`; `properties_price_period_check`; `properties_status_check`; `properties_furnished_check`; `properties_occupancy_status_check`; `check_deal_type`; `properties_visibility_check`; `check_visibility`; `properties_listing_type_check`; `properties_handover_check`

#### `property_photos`

| Колонка        | Тип                      | Ключ |
| -------------- | ------------------------ | ---- |
| `id`           | uuid                     | PK   |
| `property_id`  | uuid                     | FK   |
| `photo_type`   | text                     |      |
| `order_index`  | integer                  |      |
| `full_url`     | text                     |      |
| `thumb_url`    | text                     |      |
| `file_size_kb` | integer                  |      |
| `width`        | integer                  |      |
| `height`       | integer                  |      |
| `uploaded_at`  | timestamp with time zone |      |

_Ограничения:_ `property_photos_photo_type_check`

#### `property_price_history`

| Колонка          | Тип                      | Ключ |
| ---------------- | ------------------------ | ---- |
| `id`             | uuid                     | PK   |
| `property_id`    | uuid                     | FK   |
| `price`          | numeric                  |      |
| `price_currency` | text                     |      |
| `changed_by`     | uuid                     | FK   |
| `changed_at`     | timestamp with time zone |      |

#### `property_comments`

| Колонка            | Тип                      | Ключ |
| ------------------ | ------------------------ | ---- |
| `id`               | uuid                     | PK   |
| `property_id`      | uuid                     | FK   |
| `user_id`          | uuid                     | FK   |
| `parent_id`        | uuid                     | FK   |
| `body`             | text                     |      |
| `deleted_at`       | timestamp with time zone |      |
| `deleted_by`       | text                     |      |
| `deleted_by_admin` | text                     |      |
| `created_at`       | timestamp with time zone |      |

_Ограничения:_ `property_comments_deleted_by_check`

#### `property_events`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `property_id` | uuid                     | FK   |
| `user_id`     | uuid                     | FK   |
| `event_type`  | text                     |      |
| `source`      | text                     |      |
| `created_at`  | timestamp with time zone |      |

_Ограничения:_ `property_events_event_type_check`; `property_events_source_check`

#### `property_logs`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `property_id` | uuid                     | FK   |
| `user_id`     | uuid                     | FK   |
| `action`      | text                     |      |
| `field_name`  | text                     |      |
| `old_value`   | text                     |      |
| `new_value`   | text                     |      |
| `source`      | text                     |      |
| `created_at`  | timestamp with time zone |      |

_Ограничения:_ `property_logs_source_check`

#### `property_form_a`

| Колонка           | Тип                      | Ключ |
| ----------------- | ------------------------ | ---- |
| `id`              | uuid                     | PK   |
| `property_id`     | uuid                     | FK   |
| `file_url`        | text                     |      |
| `listing_start`   | date                     |      |
| `listing_end`     | date                     |      |
| `status`          | text                     |      |
| `uploaded_by`     | uuid                     | FK   |
| `approved_by`     | text                     |      |
| `approved_at`     | timestamp with time zone |      |
| `moderation_note` | text                     |      |
| `uploaded_at`     | timestamp with time zone |      |

_Ограничения:_ `property_form_a_status_check`

#### `units`

| Колонка              | Тип                      | Ключ |
| -------------------- | ------------------------ | ---- |
| `id`                 | uuid                     | PK   |
| `location_id`        | uuid                     | FK   |
| `unit_number`        | text                     |      |
| `tech_number`        | text                     |      |
| `category_id`        | uuid                     | FK   |
| `unit_type_id`       | uuid                     | FK   |
| `sub_type_id`        | uuid                     | FK   |
| `bedrooms`           | integer                  |      |
| `bathrooms`          | integer                  |      |
| `is_maid`            | boolean                  |      |
| `is_hotel_pool`      | boolean                  |      |
| `area_sqft`          | numeric                  |      |
| `area_sqm`           | numeric                  |      |
| `plot_sqft`          | numeric                  |      |
| `plot_sqm`           | numeric                  |      |
| `floor_number`       | integer                  |      |
| `floor_level_id`     | uuid                     | FK   |
| `floors_in_unit`     | text                     |      |
| `layout_id`          | uuid                     | FK   |
| `view_ids`           | text[]                   |      |
| `position_ids`       | text[]                   |      |
| `amenity_ids`        | text[]                   |      |
| `furnished`          | text                     |      |
| `handover`           | text                     |      |
| `completion_year`    | integer                  |      |
| `completion_q`       | text                     |      |
| `description`        | text                     |      |
| `is_embedded`        | boolean                  |      |
| `created_at`         | timestamp with time zone |      |
| `last_actualised_at` | timestamp with time zone |      |
| `updated_at`         | timestamp with time zone |      |

_Ограничения:_ `units_completion_q_check`; `units_handover_check`; `units_furnished_check`

#### `unit_photos`

| Колонка        | Тип                      | Ключ |
| -------------- | ------------------------ | ---- |
| `id`           | uuid                     | PK   |
| `unit_id`      | uuid                     | FK   |
| `photo_type`   | text                     |      |
| `full_url`     | text                     |      |
| `thumb_url`    | text                     |      |
| `order_index`  | integer                  |      |
| `file_size_kb` | integer                  |      |
| `width`        | integer                  |      |
| `height`       | integer                  |      |
| `source`       | text                     |      |
| `uploaded_by`  | uuid                     | FK   |
| `uploaded_at`  | timestamp with time zone |      |

_Ограничения:_ `unit_photos_source_check`; `unit_photos_photo_type_check`

#### `unit_title_deeds`

| Колонка             | Тип                      | Ключ |
| ------------------- | ------------------------ | ---- |
| `id`                | uuid                     | PK   |
| `unit_id`           | uuid                     | FK   |
| `title_deed_number` | text                     |      |
| `title_deed_year`   | integer                  |      |
| `is_current`        | boolean                  |      |
| `registered_at`     | date                     |      |
| `created_at`        | timestamp with time zone |      |

#### `drafts`

| Колонка            | Тип                      | Ключ |
| ------------------ | ------------------------ | ---- |
| `id`               | uuid                     | PK   |
| `user_id`          | uuid                     | FK   |
| `listing_type`     | text                     |      |
| `visibility`       | text                     |      |
| `collected_fields` | jsonb                    |      |
| `missing_fields`   | text[]                   |      |
| `current_step`     | text                     |      |
| `expires_at`       | timestamp with time zone |      |
| `created_at`       | timestamp with time zone |      |
| `updated_at`       | timestamp with time zone |      |

_Ограничения:_ `drafts_visibility_check`; `drafts_listing_type_check`

#### `saved_properties`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `user_id`     | uuid                     | FK   |
| `property_id` | uuid                     | FK   |
| `created_at`  | timestamp with time zone |      |

#### `user_seen_listings`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `user_id`     | uuid                     | PK   |
| `property_id` | uuid                     | PK   |
| `filter_id`   | uuid                     | FK   |
| `seen_at`     | timestamp with time zone |      |

#### `listing_permit_rank`

| Колонка                   | Тип    | Ключ |
| ------------------------- | ------ | ---- |
| `listing_id`              | bigint | PK   |
| `permit_number`           | text   |      |
| `permit_rank_admin`       | bigint |      |
| `permit_group_size_admin` | bigint |      |

### Локации и девелоперы

#### `locations`

| Колонка                  | Тип                             | Ключ |
| ------------------------ | ------------------------------- | ---- |
| `id`                     | uuid                            | PK   |
| `parent_id`              | uuid                            | FK   |
| `bayut_id`               | integer                         |      |
| `external_id`            | text                            |      |
| `slug`                   | text                            |      |
| `level`                  | text                            |      |
| `name`                   | text                            |      |
| `name_ar`                | text                            |      |
| `aliases`                | text[]                          |      |
| `lat`                    | numeric                         |      |
| `lng`                    | numeric                         |      |
| `description`            | text                            |      |
| `is_embedded`            | boolean                         |      |
| `stats_listings`         | integer                         |      |
| `stats_avg_price`        | numeric                         |      |
| `is_active`              | boolean                         |      |
| `is_popular`             | boolean                         |      |
| `created_at`             | timestamp with time zone        |      |
| `updated_at`             | timestamp with time zone        |      |
| `geom`                   | extensions.geometry(Point,4326) |      |
| `country_id`             | uuid                            | FK   |
| `city_id`                | uuid                            | FK   |
| `community_id`           | uuid                            | FK   |
| `sub_community_id`       | uuid                            | FK   |
| `cluster_id`             | uuid                            | FK   |
| `building_id`            | uuid                            | FK   |
| `country_bayut_id`       | integer                         |      |
| `city_bayut_id`          | integer                         |      |
| `community_bayut_id`     | integer                         |      |
| `sub_community_bayut_id` | integer                         |      |
| `cluster_bayut_id`       | integer                         |      |
| `building_bayut_id`      | integer                         |      |
| `checkpoint_bayut_id`    | integer                         |      |
| `completion_status`      | text                            |      |
| `developer_ids`          | uuid[]                          |      |
| `external_neighbor_ids`  | uuid[]                          |      |
| `is_leaf`                | boolean                         |      |

_Ограничения:_ `locations_level_check`

#### `location_neighbors`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `location_id` | uuid                     | PK   |
| `neighbor_id` | uuid                     | PK   |
| `level`       | text                     |      |
| `distance_m`  | numeric                  |      |
| `zone`        | text                     |      |
| `rank`        | smallint                 |      |
| `is_manual`   | boolean                  |      |
| `created_at`  | timestamp with time zone |      |
| `updated_at`  | timestamp with time zone |      |

_Ограничения:_ `location_neighbors_check`; `location_neighbors_zone_check`

#### `location_developers`

| Колонка                 | Тип                      | Ключ |
| ----------------------- | ------------------------ | ---- |
| `id`                    | uuid                     | PK   |
| `developer_id`          | uuid                     | FK   |
| `location_id`           | uuid                     | FK   |
| `project_name`          | text                     |      |
| `project_status`        | text                     |      |
| `built_year`            | integer                  |      |
| `completion_year`       | integer                  |      |
| `completion_q`          | text                     |      |
| `total_units`           | integer                  |      |
| `total_floors`          | integer                  |      |
| `total_plots`           | integer                  |      |
| `source`                | text                     |      |
| `confidence`            | numeric                  |      |
| `created_at`            | timestamp with time zone |      |
| `updated_at`            | timestamp with time zone |      |
| `completion_status`     | text                     |      |
| `bayut_project_id`      | integer                  |      |
| `title_ar`              | text                     |      |
| `description`           | text                     |      |
| `description_ar`        | text                     |      |
| `bedrooms`              | integer[]                |      |
| `completion_percentage` | integer                  |      |
| `start_date`            | text                     |      |
| `completion_date`       | text                     |      |
| `type_main`             | text                     |      |
| `type_sub`              | text[]                   |      |
| `price_start`           | numeric                  |      |
| `area_start`            | jsonb                    |      |
| `amenities`             | jsonb                    |      |
| `amenities_ar`          | jsonb                    |      |
| `payment_plans`         | jsonb                    |      |
| `is_post_handover`      | boolean                  |      |
| `media`                 | jsonb                    |      |
| `documents`             | jsonb                    |      |
| `legal`                 | jsonb                    |      |
| `unit_rooms`            | integer[]                |      |
| `unit_baths`            | integer[]                |      |
| `project_scope`         | text                     |      |

_Ограничения:_ `location_developers_source_check`; `location_developers_completion_q_check`; `location_developers_project_status_check`

#### `location_listing_counts`

| Колонка            | Тип    | Ключ |
| ------------------ | ------ | ---- |
| `location_id`      | uuid   | PK   |
| `city_id`          | uuid   | FK   |
| `community_id`     | uuid   | FK   |
| `sub_community_id` | uuid   | FK   |
| `cluster_id`       | uuid   | FK   |
| `building_id`      | uuid   | FK   |
| `deal_type`        | text   |      |
| `listing_type`     | text   |      |
| `total_count`      | bigint |      |

#### `community_layouts`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `location_id` | uuid                     | FK   |
| `name`        | text                     |      |
| `description` | text                     |      |
| `source`      | text                     |      |
| `created_by`  | uuid                     | FK   |
| `updated_by`  | uuid                     | FK   |
| `is_active`   | boolean                  |      |
| `order_index` | integer                  |      |
| `created_at`  | timestamp with time zone |      |
| `updated_at`  | timestamp with time zone |      |

_Ограничения:_ `community_layouts_source_check`

#### `developers`

| Колонка             | Тип                      | Ключ |
| ------------------- | ------------------------ | ---- |
| `id`                | uuid                     | PK   |
| `bayut_id`          | integer                  |      |
| `name`              | text                     |      |
| `name_ar`           | text                     |      |
| `slug`              | text                     |      |
| `logo_url`          | text                     |      |
| `website_url`       | text                     |      |
| `phone`             | text                     |      |
| `email`             | text                     |      |
| `description`       | text                     |      |
| `licenses`          | jsonb                    |      |
| `rating`            | numeric                  |      |
| `review_count`      | integer                  |      |
| `total_projects`    | integer                  |      |
| `is_embedded`       | boolean                  |      |
| `is_active`         | boolean                  |      |
| `created_at`        | timestamp with time zone |      |
| `updated_at`        | timestamp with time zone |      |
| `established_since` | timestamp with time zone |      |
| `city_ids`          | uuid[]                   |      |
| `service_areas`     | jsonb                    |      |
| `service_areas_ids` | uuid[]                   |      |
| `aliases`           | text[]                   |      |
| `source`            | text                     |      |

#### `emirates`

| Колонка              | Тип                      | Ключ |
| -------------------- | ------------------------ | ---- |
| `id`                 | uuid                     | PK   |
| `code`               | text                     |      |
| `name_en`            | text                     |      |
| `name_ar`            | text                     |      |
| `regulatory_body`    | text                     |      |
| `broker_id_field`    | text                     |      |
| `csv_column_mapping` | jsonb                    |      |
| `units_csv_mapping`  | jsonb                    |      |
| `is_active`          | boolean                  |      |
| `order_index`        | integer                  |      |
| `created_at`         | timestamp with time zone |      |
| `city_id`            | uuid                     | FK   |

#### `property_type_values`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `parent_id`   | uuid                     | FK   |
| `group_name`  | text                     |      |
| `level_name`  | text                     |      |
| `value`       | text                     |      |
| `label_en`    | text                     |      |
| `label_ar`    | text                     |      |
| `order_index` | integer                  |      |
| `is_active`   | boolean                  |      |
| `created_at`  | timestamp with time zone |      |

#### `enrichment_leaf_overrides`

| Колонка            | Тип                      | Ключ |
| ------------------ | ------------------------ | ---- |
| `leaf_location_id` | uuid                     | PK   |
| `not_building`     | boolean                  |      |
| `approved`         | boolean                  |      |
| `note`             | text                     |      |
| `updated_at`       | timestamp with time zone |      |
| `updated_by`       | text                     |      |

### Пользователи и сеть

#### `users`

| Колонка                      | Тип                      | Ключ |
| ---------------------------- | ------------------------ | ---- |
| `id`                         | uuid                     | PK   |
| `telegram_id`                | bigint                   |      |
| `whatsapp_phone`             | text                     |      |
| `full_name`                  | text                     |      |
| `email`                      | text                     |      |
| `phone`                      | text                     |      |
| `tg_username`                | text                     |      |
| `role`                       | text                     |      |
| `referral_code`              | text                     |      |
| `referred_by`                | uuid                     | FK   |
| `is_active`                  | boolean                  |      |
| `channel_origin`             | text                     |      |
| `created_at`                 | timestamp with time zone |      |
| `updated_at`                 | timestamp with time zone |      |
| `whatsapp_verified`          | boolean                  |      |
| `email_verified`             | boolean                  |      |
| `email_verification_code`    | text                     |      |
| `email_verification_expires` | timestamp with time zone |      |
| `activated_at`               | timestamp with time zone |      |

_Ограничения:_ `users_role_check`; `users_channel_check`; `users_channel_origin_check`

#### `user_identities`

| Колонка                 | Тип                      | Ключ |
| ----------------------- | ------------------------ | ---- |
| `id`                    | uuid                     | PK   |
| `user_id`               | uuid                     | FK   |
| `broker_license`        | text                     |      |
| `broker_license_expiry` | date                     |      |
| `emirate_id`            | uuid                     | FK   |
| `created_at`            | timestamp with time zone |      |
| `city_id`               | uuid                     | FK   |
| `user_type`             | text                     |      |
| `emirate_name`          | text                     |      |
| `agency_id`             | uuid                     | FK   |
| `agency_name`           | text                     |      |

#### `user_settings`

| Колонка         | Тип                      | Ключ |
| --------------- | ------------------------ | ---- |
| `user_id`       | uuid                     | PK   |
| `languages`     | text[]                   |      |
| `service_areas` | text[]                   |      |
| `about`         | text                     |      |
| `updated_at`    | timestamp with time zone |      |
| `photo_url`     | text                     |      |

#### `user_context`

| Колонка                 | Тип                      | Ключ |
| ----------------------- | ------------------------ | ---- |
| `user_id`               | uuid                     | PK   |
| `badge_level`           | text                     |      |
| `score`                 | integer                  |      |
| `active_listings`       | integer                  |      |
| `recent_events`         | jsonb                    |      |
| `ai_context_text`       | text                     |      |
| `recalculated_at`       | timestamp with time zone |      |
| `full_name`             | text                     |      |
| `referral_code`         | text                     |      |
| `created_at_user`       | timestamp with time zone |      |
| `emirate_name`          | text                     |      |
| `agency_name`           | text                     |      |
| `friends_count`         | integer                  |      |
| `referrals_count`       | integer                  |      |
| `comments_count`        | integer                  |      |
| `saved_filters_count`   | integer                  |      |
| `total_listings_ever`   | integer                  |      |
| `pdf_generated_count`   | integer                  |      |
| `total_searches`        | integer                  |      |
| `last_active_at`        | timestamp with time zone |      |
| `channel_origin`        | text                     |      |
| `whatsapp_verified`     | boolean                  |      |
| `broker_license`        | text                     |      |
| `broker_license_expiry` | date                     |      |
| `city_id`               | uuid                     |      |
| `plan`                  | text                     |      |
| `subscription_status`   | text                     |      |
| `plan_expires_at`       | timestamp with time zone |      |
| `agency_members_count`  | integer                  |      |

#### `user_events`

| Колонка           | Тип                      | Ключ |
| ----------------- | ------------------------ | ---- |
| `id`              | uuid                     | PK   |
| `user_id`         | uuid                     | FK   |
| `event_type`      | text                     |      |
| `payload`         | jsonb                    |      |
| `is_notified`     | boolean                  |      |
| `ai_context_used` | boolean                  |      |
| `created_at`      | timestamp with time zone |      |

#### `user_network`

| Колонка         | Тип    | Ключ |
| --------------- | ------ | ---- |
| `user_id`       | uuid   | PK   |
| `friend_ids`    | uuid[] |      |
| `colleague_ids` | uuid[] |      |

#### `friendships`

| Колонка        | Тип                      | Ключ |
| -------------- | ------------------------ | ---- |
| `id`           | uuid                     | PK   |
| `user_id`      | uuid                     | FK   |
| `friend_id`    | uuid                     | FK   |
| `status`       | text                     |      |
| `source`       | text                     |      |
| `requested_by` | uuid                     | FK   |
| `created_at`   | timestamp with time zone |      |

_Ограничения:_ `friendships_source_check`; `friendships_check`; `friendships_status_check`

#### `sessions`

| Колонка                      | Тип                      | Ключ |
| ---------------------------- | ------------------------ | ---- |
| `id`                         | uuid                     | PK   |
| `telegram_id`                | bigint                   |      |
| `whatsapp_phone`             | text                     |      |
| `step`                       | text                     |      |
| `mode`                       | text                     |      |
| `data`                       | jsonb                    |      |
| `support_active`             | boolean                  |      |
| `chatwoot_conversation_id`   | integer                  |      |
| `onboarding_step`            | text                     |      |
| `active_draft_id`            | uuid                     | FK   |
| `updated_at`                 | timestamp with time zone |      |
| `window_expires_at`          | timestamp with time zone |      |
| `wa_template_sent_this_week` | integer                  |      |

_Ограничения:_ `sessions_channel_check`; `sessions_mode_check`

#### `agencies`

| Колонка             | Тип                      | Ключ |
| ------------------- | ------------------------ | ---- |
| `id`                | uuid                     | PK   |
| `name`              | text                     |      |
| `rera_number`       | text                     |      |
| `logo_url`          | text                     |      |
| `is_verified`       | boolean                  |      |
| `subscription_plan` | text                     |      |
| `created_at`        | timestamp with time zone |      |
| `updated_at`        | timestamp with time zone |      |

#### `agency_members`

| Колонка      | Тип                      | Ключ |
| ------------ | ------------------------ | ---- |
| `id`         | uuid                     | PK   |
| `agency_id`  | uuid                     | FK   |
| `user_id`    | uuid                     | FK   |
| `role`       | text                     |      |
| `reports_to` | uuid                     | FK   |
| `joined_at`  | timestamp with time zone |      |

_Ограничения:_ `agency_members_role_check`

#### `agency_integrations`

| Колонка        | Тип                      | Ключ |
| -------------- | ------------------------ | ---- |
| `id`           | uuid                     | PK   |
| `agency_id`    | uuid                     | FK   |
| `type`         | text                     |      |
| `api_key`      | text                     |      |
| `webhook_url`  | text                     |      |
| `config`       | jsonb                    |      |
| `status`       | text                     |      |
| `connected_at` | timestamp with time zone |      |
| `created_at`   | timestamp with time zone |      |

_Ограничения:_ `agency_integrations_type_check`; `agency_integrations_status_check`

### Подписки и платежи

#### `plans`

| Колонка         | Тип                      | Ключ |
| --------------- | ------------------------ | ---- |
| `id`            | uuid                     | PK   |
| `name`          | text                     |      |
| `price_aed`     | numeric                  |      |
| `price_usd`     | numeric                  |      |
| `for_agency`    | boolean                  |      |
| `is_active`     | boolean                  |      |
| `created_at`    | timestamp with time zone |      |
| `plan_code`     | text                     |      |
| `duration_days` | integer                  |      |
| `features`      | jsonb                    |      |
| `description`   | text                     |      |

#### `subscriptions`

| Колонка                | Тип                      | Ключ |
| ---------------------- | ------------------------ | ---- |
| `id`                   | uuid                     | PK   |
| `user_id`              | uuid                     | FK   |
| `agency_id`            | uuid                     | FK   |
| `plan`                 | text                     |      |
| `status`               | text                     |      |
| `current_period_start` | timestamp with time zone |      |
| `current_period_end`   | timestamp with time zone |      |
| `gift_reason`          | text                     |      |
| `gifted_by`            | uuid                     |      |
| `created_at`           | timestamp with time zone |      |
| `updated_at`           | timestamp with time zone |      |

_Ограничения:_ `subscriptions_plan_check`; `subscriptions_status_check`

#### `subscription_gifts`

| Колонка      | Тип                      | Ключ |
| ------------ | ------------------------ | ---- |
| `id`         | uuid                     | PK   |
| `user_id`    | uuid                     | FK   |
| `granted_by` | uuid                     | FK   |
| `months`     | integer                  |      |
| `reason`     | text                     |      |
| `source`     | text                     |      |
| `ref_id`     | uuid                     | FK   |
| `created_at` | timestamp with time zone |      |

_Ограничения:_ `subscription_gifts_source_check`

#### `user_purchases`

| Колонка              | Тип                      | Ключ |
| -------------------- | ------------------------ | ---- |
| `id`                 | uuid                     | PK   |
| `user_id`            | uuid                     | FK   |
| `plan_id`            | uuid                     | FK   |
| `amount_paid`        | numeric                  |      |
| `currency`           | text                     |      |
| `payment_method`     | text                     |      |
| `payment_id`         | text                     |      |
| `publications_added` | integer                  |      |
| `status`             | text                     |      |
| `created_at`         | timestamp with time zone |      |

_Ограничения:_ `user_purchases_status_check`

#### `transactions`

| Колонка             | Тип                      | Ключ |
| ------------------- | ------------------------ | ---- |
| `id`                | uuid                     | PK   |
| `location_bayut_id` | integer                  |      |
| `location_name`     | text                     |      |
| `amount`            | numeric                  |      |
| `category`          | text                     |      |
| `date`              | date                     |      |
| `property_type`     | text                     |      |
| `beds`              | integer                  |      |
| `builtup_area_sqft` | numeric                  |      |
| `occupancy_status`  | text                     |      |
| `status`            | text                     |      |
| `created_at`        | timestamp with time zone |      |

#### `promotions`

| Колонка           | Тип                      | Ключ |
| ----------------- | ------------------------ | ---- |
| `id`              | uuid                     | PK   |
| `title`           | text                     |      |
| `promo_text`      | text                     |      |
| `discount_type`   | text                     |      |
| `discount_value`  | numeric                  |      |
| `applies_to`      | jsonb                    |      |
| `eligible_badges` | text[]                   |      |
| `valid_from`      | timestamp with time zone |      |
| `valid_until`     | timestamp with time zone |      |
| `is_active`       | boolean                  |      |
| `created_by`      | text                     |      |
| `created_at`      | timestamp with time zone |      |

_Ограничения:_ `promotions_discount_type_check`

#### `referrals`

| Колонка         | Тип                      | Ключ |
| --------------- | ------------------------ | ---- |
| `id`            | uuid                     | PK   |
| `referrer_id`   | uuid                     | FK   |
| `referred_id`   | uuid                     | FK   |
| `friendship_id` | uuid                     | FK   |
| `status`        | text                     |      |
| `trigger_event` | text                     |      |
| `created_at`    | timestamp with time zone |      |

_Ограничения:_ `referrals_status_check`

### Фильтры, поиск, уведомления

#### `saved_filters`

| Колонка             | Тип                      | Ключ |
| ------------------- | ------------------------ | ---- |
| `id`                | uuid                     | PK   |
| `user_id`           | uuid                     | FK   |
| `auto_name`         | text                     |      |
| `filters`           | jsonb                    |      |
| `ai_query_text`     | text                     |      |
| `unseen_count`      | integer                  |      |
| `last_checked_at`   | timestamp with time zone |      |
| `deleted_at`        | timestamp with time zone |      |
| `created_at`        | timestamp with time zone |      |
| `notification_type` | text                     |      |
| `city_id`           | uuid                     | FK   |

_Ограничения:_ `saved_filters_notification_type_check`

#### `filter_matches`

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `filter_id`   | uuid                     | FK   |
| `property_id` | uuid                     | FK   |
| `match_type`  | text                     |      |
| `notified_at` | timestamp with time zone |      |

_Ограничения:_ `filter_matches_match_type_check`

#### `search_history`

| Колонка          | Тип                      | Ключ |
| ---------------- | ------------------------ | ---- |
| `id`             | uuid                     | PK   |
| `user_id`        | uuid                     | FK   |
| `query_text`     | text                     |      |
| `parsed_filters` | jsonb                    |      |
| `results_count`  | integer                  |      |
| `source`         | text                     |      |
| `created_at`     | timestamp with time zone |      |

#### `notifications_log`

| Колонка      | Тип                      | Ключ |
| ------------ | ------------------------ | ---- |
| `id`         | uuid                     | PK   |
| `user_id`    | uuid                     | FK   |
| `type`       | text                     |      |
| `content`    | text                     |      |
| `sent_via`   | text                     |      |
| `is_sent`    | boolean                  |      |
| `error_msg`  | text                     |      |
| `sent_at`    | timestamp with time zone |      |
| `created_at` | timestamp with time zone |      |

_Ограничения:_ `notifications_log_sent_via_check`

### Бейджи и активность (вне MVP)

#### `agent_badge` _(вне MVP)_

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `user_id`     | uuid                     | PK   |
| `badge_level` | text                     |      |
| `updated_at`  | timestamp with time zone |      |

_Ограничения:_ `agent_badge_badge_level_check`

#### `agent_badge_history` _(вне MVP)_

| Колонка       | Тип                      | Ключ |
| ------------- | ------------------------ | ---- |
| `id`          | uuid                     | PK   |
| `user_id`     | uuid                     | FK   |
| `badge_level` | text                     |      |
| `month`       | date                     |      |
| `changed_at`  | timestamp with time zone |      |
| `change_type` | text                     |      |

_Ограничения:_ `agent_badge_history_change_type_check`

#### `agent_activity` _(вне MVP)_

| Колонка            | Тип                      | Ключ |
| ------------------ | ------------------------ | ---- |
| `user_id`          | uuid                     | PK   |
| `score`            | integer                  |      |
| `score_prev_month` | integer                  |      |
| `score_breakdown`  | jsonb                    |      |
| `recalculated_at`  | timestamp with time zone |      |

#### `agent_community_scores` _(вне MVP)_

| Колонка                 | Тип     | Ключ |
| ----------------------- | ------- | ---- |
| `id`                    | uuid    | PK   |
| `user_id`               | uuid    | FK   |
| `location_id`           | uuid    | FK   |
| `week_start`            | date    |      |
| `listings_count`        | integer |      |
| `pocket_listings_count` | integer |      |
| `score`                 | integer |      |
| `rank`                  | integer |      |

#### `agent_score_events` _(вне MVP)_

| Колонка      | Тип                      | Ключ |
| ------------ | ------------------------ | ---- |
| `id`         | uuid                     | PK   |
| `user_id`    | uuid                     | FK   |
| `event_type` | text                     |      |
| `points`     | integer                  |      |
| `source_id`  | uuid                     |      |
| `created_at` | timestamp with time zone |      |

### AI / прочее

#### `ai_insights`

| Колонка         | Тип                      | Ключ |
| --------------- | ------------------------ | ---- |
| `id`            | uuid                     | PK   |
| `user_id`       | uuid                     | FK   |
| `insight_type`  | text                     |      |
| `payload`       | jsonb                    |      |
| `priority`      | integer                  |      |
| `scheduled_for` | timestamp with time zone |      |
| `delivered_at`  | timestamp with time zone |      |
| `read_at`       | timestamp with time zone |      |
| `created_at`    | timestamp with time zone |      |

#### `chat_history`

| Колонка          | Тип                      | Ключ |
| ---------------- | ------------------------ | ---- |
| `id`             | uuid                     | PK   |
| `telegram_id`    | bigint                   |      |
| `whatsapp_phone` | text                     |      |
| `user_id`        | uuid                     | FK   |
| `channel`        | text                     |      |
| `role`           | text                     |      |
| `content`        | text                     |      |
| `created_at`     | timestamp with time zone |      |
| `mode`           | text                     |      |

_Ограничения:_ `chat_history_role_check`; `chat_history_channel_check`

#### `knowledge_base`

| Колонка                 | Тип                      | Ключ |
| ----------------------- | ------------------------ | ---- |
| `id`                    | uuid                     | PK   |
| `scope`                 | text                     |      |
| `owner_id`              | uuid                     |      |
| `owner_type`            | text                     |      |
| `type`                  | text                     |      |
| `content_type`          | text                     |      |
| `media_type`            | text                     |      |
| `title`                 | text                     |      |
| `content`               | text                     |      |
| `file_url`              | text                     |      |
| `file_mime_type`        | text                     |      |
| `visibility`            | text                     |      |
| `is_embedded`           | boolean                  |      |
| `created_by`            | uuid                     | FK   |
| `created_at`            | timestamp with time zone |      |
| `updated_at`            | timestamp with time zone |      |
| `entity_type`           | text                     |      |
| `entity_id`             | uuid                     |      |
| `location_developer_id` | uuid                     |      |
| `source`                | text                     |      |
| `language`              | text                     |      |

_Ограничения:_ `knowledge_base_owner_type_check`; `knowledge_base_visibility_check`; `knowledge_base_media_type_check`; `knowledge_base_scope_check`; `knowledge_base_type_check`

#### `pdf_generations`

| Колонка            | Тип                      | Ключ |
| ------------------ | ------------------------ | ---- |
| `id`               | uuid                     | PK   |
| `user_id`          | uuid                     | FK   |
| `property_id`      | uuid                     | FK   |
| `file_url`         | text                     |      |
| `file_size_kb`     | integer                  |      |
| `template_version` | text                     |      |
| `status`           | text                     |      |
| `expires_at`       | timestamp with time zone |      |
| `download_count`   | integer                  |      |
| `created_at`       | timestamp with time zone |      |

_Ограничения:_ `pdf_generations_status_check`

#### `schedules`

| Колонка      | Тип                      | Ключ |
| ------------ | ------------------------ | ---- |
| `id`         | uuid                     | PK   |
| `name`       | character varying        |      |
| `params`     | jsonb                    |      |
| `cron`       | character varying        |      |
| `enabled`    | boolean                  |      |
| `last_run`   | timestamp with time zone |      |
| `next_run`   | timestamp with time zone |      |
| `created_at` | timestamp with time zone |      |
