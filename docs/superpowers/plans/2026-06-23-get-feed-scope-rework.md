# get_feed Scope Rework (эпик SC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести охват ленты (All/Friends/My) и статус-фильтр My-инвентаря на сервер внутри `get_feed`, закрыв P2-утечку сети и убрав клиентские костыли (scope-фильтр + оптимистику бейджа).

**Architecture:** `get_feed` переписывается в продакшн-форму — единый проход (`count(*) OVER()` + `row_number()`, jsonb строится только для страницы, детерминированный tiebreaker `id`) с ОДНИМ scope-aware предикатом видимости вместо двух дублированных WHERE. Фронт передаёт `p_scope`/`p_my_status`/`p_city_id`, клиентский scope-фильтр и оптимистичный бейдж удаляются; бейдж показывает чистое число бекенда и перечитывается после пометки.

**Tech Stack:** PostgreSQL (Supabase self-hosted, PL/pgSQL SECURITY DEFINER), Angular 17+ standalone + Signals, Jasmine/Karma.

## Global Constraints

- Источник истины для тела `get_feed` — **живой прод** (`pg_get_functiondef`), снимок: `.superpowers/sdd/get_feed.live.sql`. `docs/database.md` для этой функции **устарел** — не копировать оттуда.
- Все DDL-миграции — на общей прод-БД. **Применять на прод ТОЛЬКО после явного «да» создателя** (объяснить → спросить → ждать). SQL пишем в `docs/migrations/`, после применения `git mv` в `docs/migrations/applied/`. Роль `supabase_admin`. Каждая миграция в транзакции.
- Scope значения сервера: `'all' | 'friends' | 'my'`. My-status значения: `'all' | 'active' | 'archived' | 'rejected' | 'expired' | 'pending'`.
- Статусы объекта (актуальные, `draft` УБРАН): `pending_review, active, rejected, expired, archived_sold, archived_withdrawn`.
- Маппинг клиентского `FeedScope` → серверного `p_scope`: `'public'→'all'`, `'friends'→'friends'`, `'my'→'my'`, `'favourites'→'all'` (favourites — клиентский вид по `savedIds` поверх `'all'`, серверным охватом НЕ является).
- `p_my_status` отправляется в `get_feed` **только** когда `scope==='my'`, иначе `'all'` (для all/friends статус всегда `active` на сервере).
- Жёлтый бейдж непросмотра: только у All/Friends-фильтров. Для My-фильтров `get_saved_filters.unseen_count = 0`.
- UI-строки и комментарии — на русском. TypeScript strict (без `any`). NgRx/сигналы не мутировать (новые объекты).
- `npm run checkFile <путь>` на каждый изменённый `.ts`. Перед пушем: `npm run lint && npm run buildFrontend:prodWeb`.
- **Координация деплоя (важно):** P2-фикс в `get_feed` меняет видимость network → только своя сеть. Матчер (`property_matches_filter`, репо realtime) пока зеркалит СТАРЫЙ широкий предикат → пока матчер не обновлён (задача SC-8, отдельный бриф), бейджи All/Friends-фильтров будут считать чужие карманные объекты, которых нет в ленте (бейдж > лента). Прод-применение миграции Task 1 координировать с обновлением матчера. Деплой миграции + фронт (Tasks 3–6) — одним релизом (новый `'all'` без своих/чужой-сети ломает текущий клиентский My/Friends-фильтр).

---

## File Structure

**Backend (миграции, новые файлы):**

- `docs/migrations/2026-06-23-get-feed-scope-rework.sql` — DROP+CREATE `get_feed` с `p_scope`/`p_my_status`, единый проход, scope-предикат, P2-фикс.
- `docs/migrations/2026-06-23-get-saved-filters-my-scope-zero.sql` — staleness-proof патч `get_saved_filters.unseen_count`: `0` для `scope='my'`.

**Frontend (правки):**

- `src/app/mrsqm/types/database.ts` — `FeedParams += p_scope, p_my_status, p_city_id`.
- `src/app/mrsqm/services/feed-filter.service.ts` — `MyStatus` тип, `myStatus` сигнал, `setScope()`, `serverScope()`; reset `myStatus` при входе в My.
- `src/app/mrsqm/pages/feed/feed-page.component.ts` — `_buildParams` (+scope/my_status), reload-effect (+scope/myStatus), `visibleProperties`/`foundCount` (убрать серверные охваты), `_markPageShown` (убрать оптимистику, добавить refresh).
- `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts` + `.html` — Охват = Select из 3; блок My-статуса (Select из 6, только при My); убрать `savedFiltersView`/`displayUnseen`.
- `src/app/mrsqm/services/saved-filter.service.ts` — удалить оптимистику (`_localFilterSeen`/`markSeenLocally`/`clearLocalSeen`/`localSeenCount`); добавить `reloadTick`/`bumpReload`.

**Тесты:** соответствующие `*.spec.ts` (feed-filter.service, feed-page, feed-filter-panel).

**Вне этого плана:** SC-7 (селектор города) — отдельный план. SC-8 (матчер, realtime) — бриф. SC-9 (gpt-заметка). SC-10 (`count_nearby_listings`/общий предикат). Эпик LM — отдельная спека.

---

## Task 1: Миграция `get_feed` — продакшн-рефактор (scope + P2 + единый проход)

**Files:**

- Create: `docs/migrations/2026-06-23-get-feed-scope-rework.sql`
- Reference: `.superpowers/sdd/get_feed.live.sql` (живое тело — источник)

**Interfaces:**

- Produces: `get_feed(..., p_scope text DEFAULT 'all', p_my_status text DEFAULT 'all')` → `{results, count_total, limit, offset}` (контракт ответа не меняется).
- Consumes: таблицы `properties`, `locations`, `developers`, `agent_badge`, `user_context`, `user_network`, `ai_configs`, `user_seen_listings` (как в живом теле).

**Это read-only RPC (не op-log/state). Риск — неверная выдача/утечка и расхождение с матчером, НЕ порча данных. Проверять предикат особенно тщательно.**

- [ ] **Step 1: Создать файл миграции с полным DROP+CREATE**

Создать `docs/migrations/2026-06-23-get-feed-scope-rework.sql` со следующим содержимым целиком:

```sql
-- ============================================================================
-- get_feed: продакшн-рефактор — серверный охват (scope) + статус My + P2-фикс.
--
-- ЧТО МЕНЯЕТСЯ против живого тела (.superpowers/sdd/get_feed.live.sql):
--   1) +2 параметра в конце: p_scope ('all'|'friends'|'my'), p_my_status
--      ('all'|'active'|'archived'|'rejected'|'expired'|'pending').
--   2) Единый проход: дублированные COUNT-WHERE и SELECT-WHERE слиты в ОДИН
--      предикат (CTE base с count(*) OVER() и row_number()); jsonb строится
--      только для строк страницы; детерминированный tiebreaker p.id.
--   3) Предикат видимости заменён на scope-aware:
--      all     = active, не свои, public OR (network И owner ∈ моя сеть)   [P2-фикс]
--      friends = active, не свои, network И owner ∈ моя сеть
--      my      = свои, статус по p_my_status
--   Контракт ответа {results,count_total,limit,offset} не меняется.
--
-- backward-compat: p_scope DEFAULT 'all'. Старый вызов без p_scope = охват all
--   (теперь БЕЗ своих и БЕЗ чужой сети — это намеренно, см. план Global Constraints).
-- Применять под supabase_admin, в транзакции. Read-only функция (нет записи данных).
-- ОТКАТ: восстановить тело из .superpowers/sdd/get_feed.live.sql (DROP+CREATE старой сигнатуры).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_feed(text, uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, integer[], integer[], boolean, boolean, text, uuid[], uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, text, text[], text[], text[], text, text[], text, integer[], text[], text, numeric, numeric, uuid[], text, integer, integer, integer[], boolean, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.get_feed(
  p_deal_type text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_city_id uuid DEFAULT NULL::uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_unit_type_id uuid DEFAULT NULL::uuid,
  p_sub_type_ids uuid[] DEFAULT NULL::uuid[],
  p_location_ids uuid[] DEFAULT NULL::uuid[],
  p_developer_ids uuid[] DEFAULT NULL::uuid[],
  p_developer_name text DEFAULT NULL::text,
  p_bedrooms integer[] DEFAULT NULL::integer[],
  p_bathrooms integer[] DEFAULT NULL::integer[],
  p_is_maid boolean DEFAULT NULL::boolean,
  p_is_hotel_pool boolean DEFAULT NULL::boolean,
  p_furnished text DEFAULT NULL::text,
  p_floor_level_ids uuid[] DEFAULT NULL::uuid[],
  p_floors_in_unit_ids uuid[] DEFAULT NULL::uuid[],
  p_area_sqft_min numeric DEFAULT NULL::numeric,
  p_area_sqft_max numeric DEFAULT NULL::numeric,
  p_plot_sqft_min numeric DEFAULT NULL::numeric,
  p_plot_sqft_max numeric DEFAULT NULL::numeric,
  p_price_min numeric DEFAULT NULL::numeric,
  p_price_max numeric DEFAULT NULL::numeric,
  p_price_currency text DEFAULT 'AED'::text,
  p_price_period text DEFAULT NULL::text,
  p_view_ids text[] DEFAULT NULL::text[],
  p_position_ids text[] DEFAULT NULL::text[],
  p_amenity_ids text[] DEFAULT NULL::text[],
  p_listing_type text DEFAULT NULL::text,
  p_occupancy_status text[] DEFAULT NULL::text[],
  p_handover text DEFAULT NULL::text,
  p_completion_year integer[] DEFAULT NULL::integer[],
  p_completion_q text[] DEFAULT NULL::text[],
  p_description text DEFAULT NULL::text,
  p_lat numeric DEFAULT NULL::numeric,
  p_lng numeric DEFAULT NULL::numeric,
  p_exclude_location_ids uuid[] DEFAULT NULL::uuid[],
  p_sort_by text DEFAULT 'default'::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_cheques integer[] DEFAULT NULL::integer[],
  p_is_study boolean DEFAULT NULL::boolean,
  p_is_reduced boolean DEFAULT NULL::boolean,
  p_is_below_op boolean DEFAULT NULL::boolean,
  p_is_vastu boolean DEFAULT NULL::boolean,
  p_scope text DEFAULT 'all'::text,
  p_my_status text DEFAULT 'all'::text
)
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
  v_result                 jsonb;
BEGIN

  -- ШАГ 1: Валидация
  IF p_deal_type IS NULL THEN
    RAISE EXCEPTION 'deal_type is required';
  END IF;
  IF p_deal_type NOT IN ('sale', 'rent') THEN
    RAISE EXCEPTION 'deal_type must be sale or rent';
  END IF;
  IF p_scope NOT IN ('all', 'friends', 'my') THEN
    RAISE EXCEPTION 'scope must be all, friends or my';
  END IF;
  IF p_my_status NOT IN ('all','active','archived','rejected','expired','pending') THEN
    RAISE EXCEPTION 'my_status invalid';
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

  -- ШАГ 6: Единый проход — base (предикат + window-счётчик + порядок) → страница → jsonb.
  --   base материализуется один раз (MATERIALIZED): из неё берём и count, и страницу.
  --   count_total = max(total_count) по ВСЕЙ base → верен даже на пустой странице.
  WITH base AS MATERIALIZED (
    SELECT
      p.id,
      count(*) OVER() AS total_count,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort_by = 'default'    THEN COALESCE(p.last_actualized_at, p.published_at) END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'price_asc'  THEN p.price END ASC  NULLS LAST,
          CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'date_desc'  THEN COALESCE(p.last_actualized_at, p.published_at) END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'date_asc'   THEN COALESCE(p.last_actualized_at, p.published_at) END ASC  NULLS LAST,
          p.id  -- детерминированный tiebreaker (стабильная пагинация)
      ) AS rn
    FROM properties p
    WHERE
      p.deal_type = p_deal_type
      -- ── ОХВАТ (scope) — единственный предикат видимости ──────────────────
      AND (
        ( p_scope = 'all'
          AND p.status = 'active'
          AND p.owner_id IS DISTINCT FROM v_current_user_id
          AND ( p.visibility = 'public'
                OR (p.visibility = 'network' AND p.owner_id = ANY(v_network_ids)) ) )
        OR
        ( p_scope = 'friends'
          AND p.status = 'active'
          AND p.owner_id IS DISTINCT FROM v_current_user_id
          AND p.visibility = 'network'
          AND p.owner_id = ANY(v_network_ids) )
        OR
        ( p_scope = 'my'
          AND p.owner_id = v_current_user_id
          AND (
            p_my_status = 'all'
            OR (p_my_status = 'active'   AND p.status = 'active')
            OR (p_my_status = 'archived' AND p.status IN ('archived_sold','archived_withdrawn'))
            OR (p_my_status = 'rejected' AND p.status = 'rejected')
            OR (p_my_status = 'expired'  AND p.status = 'expired')
            OR (p_my_status = 'pending'  AND p.status = 'pending_review')
          ) )
      )
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
  )
  SELECT jsonb_build_object(
    'results', COALESCE(
      jsonb_agg(
        (
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
            'floors_in_unit_id',   p.floors_in_unit_id,
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
            'commission_included', p.commission_included,
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
            'is_unseen', (p.owner_id IS DISTINCT FROM v_current_user_id AND GREATEST(p.created_at, p.updated_at) > COALESCE((SELECT usl.shown_at FROM public.user_seen_listings usl WHERE usl.property_id = p.id AND usl.user_id = v_current_user_id), 'epoch'::timestamptz)),
            'developer_name_ref',  d.name,
            'developer_logo_url',  d.logo_url,
            'owner_full_name',     (SELECT full_name   FROM users           WHERE id      = p.owner_id),
            'owner_agency_name',   (SELECT agency_name FROM user_identities WHERE user_id = p.owner_id LIMIT 1),
            'owner_photo_url',     (SELECT photo_url   FROM user_settings   WHERE user_id = p.owner_id LIMIT 1),
            'has_photos',          EXISTS (SELECT 1 FROM property_photos WHERE property_id = p.id),
            'owner_badge_level',   ab.badge_level,
            'is_network',          (p.owner_id = ANY(v_network_ids))
          )
        )
        ORDER BY b.rn
      ),
      '[]'::jsonb
    ),
    'count_total', COALESCE((SELECT max(total_count) FROM base), 0),
    'limit',       p_limit,
    'offset',      p_offset
  )
  INTO v_result
  FROM base b
  JOIN properties p        ON p.id  = b.id
  LEFT JOIN locations l    ON l.id  = p.location_id
  LEFT JOIN locations lc   ON lc.id = l.community_id
  LEFT JOIN developers d   ON d.id  = p.developer_id
  LEFT JOIN agent_badge ab ON ab.user_id = p.owner_id
  WHERE b.rn > p_offset AND b.rn <= p_offset + p_limit;

  RETURN v_result;

END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_feed(text, uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, integer[], integer[], boolean, boolean, text, uuid[], uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, text, text[], text[], text[], text, text[], text, integer[], text[], text, numeric, numeric, uuid[], text, integer, integer, integer[], boolean, boolean, boolean, boolean, text, text) TO anon, authenticated, service_role;
```

- [ ] **Step 2: Прогнать checkFile/линт не требуется (SQL); проверить файл на парность скобок и наличие обоих новых параметров глазами**

Прочитать файл целиком. Убедиться: сигнатура заканчивается на `p_scope text DEFAULT 'all'::text, p_my_status text DEFAULT 'all'::text`; в `WHERE` ровно ОДИН scope-блок; `is_unseen` использует `v_current_user_id`; есть `GRANT` с 46-арговой сигнатурой.

- [ ] **Step 3: ГЕЙТ — запросить у создателя разрешение применить на прод**

Объяснить: «Это DDL на общей прод-БД (DROP+CREATE get_feed). Меняет видимость network (P2). Применить?». Дождаться явного «да». НЕ применять без ответа.

- [ ] **Step 4: После «да» — применить на прод в ROLLBACK-смоук, затем реально**

Сначала smoke в `BEGIN … ROLLBACK` (через apply-migration.sh / psql под supabase_admin), проверяя ВСЕ инварианты на тестовом юзере (nazarovitalii uuid + test2):

```sql
BEGIN;
-- применить тело миграции здесь (вставить весь файл) --

-- A) сигнатура: оба новых параметра присутствуют
SELECT position('p_scope text' in pg_get_functiondef('public.get_feed'::regproc)) > 0 AS has_scope,
       position('p_my_status text' in pg_get_functiondef('public.get_feed'::regproc)) > 0 AS has_my_status;

-- B) единый предикат: 'visibility IN' больше НЕ должно встречаться (старый дубль убран)
SELECT (length(pg_get_functiondef('public.get_feed'::regproc))
       - length(replace(pg_get_functiondef('public.get_feed'::regproc), 'visibility IN', ''))) AS old_predicate_occurrences;  -- ожидаем 0

-- C) scope='my' для nazarovitalii возвращает только его объекты
SELECT jsonb_array_length(get_feed('sale', p_user_id := '<NAZAROV_UUID>', p_scope := 'my') -> 'results') AS my_count,
       (SELECT count(*) FROM properties WHERE owner_id = '<NAZAROV_UUID>' AND deal_type='sale' AND status='active') AS my_active_expected;

-- D) scope='all' для nazarovitalii НЕ содержит его own объектов
SELECT bool_and((r ->> 'owner_id') <> '<NAZAROV_UUID>') AS all_excludes_own
FROM jsonb_array_elements(get_feed('sale', p_user_id := '<NAZAROV_UUID>', p_scope := 'all', p_limit := 100) -> 'results') r;

-- E) count_total согласован с числом отданных при больших p_limit (один охват)
SELECT (get_feed('sale', p_user_id := '<NAZAROV_UUID>', p_scope := 'all', p_limit := 1000) -> 'count_total')::int AS count_total,
       jsonb_array_length(get_feed('sale', p_user_id := '<NAZAROV_UUID>', p_scope := 'all', p_limit := 1000) -> 'results') AS returned;

-- F) my + p_my_status='archived' отдаёт только archived_* статусы
SELECT bool_and((r ->> 'status') IN ('archived_sold','archived_withdrawn')) AS archived_only
FROM jsonb_array_elements(get_feed('sale', p_user_id := '<NAZAROV_UUID>', p_scope := 'my', p_my_status := 'archived', p_limit := 100) -> 'results') r;

-- G) невалидный scope → исключение
DO $$ BEGIN PERFORM get_feed('sale', p_scope := 'bogus'); RAISE EXCEPTION 'should have failed'; EXCEPTION WHEN others THEN NULL; END $$;
ROLLBACK;
```

Ожидаемо: has_scope=t, has_my_status=t; old_predicate_occurrences=0; my_count=my_active_expected; all_excludes_own=t; count_total=returned; archived_only=t (или 0 строк → NULL, допустимо если нет архивных). После зелёного smoke применить реально (без ROLLBACK), затем `git mv` файла в `applied/`.

- [ ] **Step 5: Записать прод-тест в `docs/tests.md` (T-SC1) и commit**

Дописать запись T-SC1 (что проверяли, ожидали, получили — пункты A–G). Commit:

```bash
git add docs/migrations/applied/2026-06-23-get-feed-scope-rework.sql docs/tests.md
git commit -m "migrate(feed): get_feed p_scope + p_my_status + P2-фикс (единый проход)"
```

---

## Task 2: Миграция `get_saved_filters` — `unseen_count=0` для My-фильтров

**Files:**

- Create: `docs/migrations/2026-06-23-get-saved-filters-my-scope-zero.sql`
- Reference: `docs/migrations/applied/2026-06-23-get-saved-filters-renotify.sql` (текущая формула unseen_count)

**Interfaces:**

- Consumes: живое тело `get_saved_filters` (формула re-notify по `GREATEST(p.created_at,p.updated_at)`); scope фильтра читается из `sf.filters->>'scope'`.
- Produces: `get_saved_filters` где `unseen_count = 0`, если `sf.filters->>'scope' = 'my'`.

**Staleness-proof патч (как session 5): заменяем ТОЛЬКО значение ключа `'unseen_count'` между якорями `'unseen_count',` и `'notification_type'`. Источник правды — живое тело, не database.md.**

- [ ] **Step 1: Создать файл миграции**

Создать `docs/migrations/2026-06-23-get-saved-filters-my-scope-zero.sql`:

```sql
-- My-фильтры не получают матчей → бейдж всегда 0. Оборачиваем текущую формулу
-- unseen_count в CASE по sf.filters->>'scope'. Staleness-proof: заменяем только
-- значение ключа 'unseen_count' (между 'unseen_count', и 'notification_type').
-- Базируется на формуле re-notify (GREATEST(p.created_at,p.updated_at)) — guard ниже
-- проверяет, что она присутствует, иначе прерывает (тело иное — не патчим вслепую).
-- Применять под supabase_admin, в транзакции. ОТКАТ: применить 2026-06-23-get-saved-filters-renotify.sql.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  -- значение unseen_count = 0 для scope='my', иначе re-notify формула (verbatim из renotify-миграции)
  v_expr text :=
    'CASE WHEN sf.filters->>''scope'' = ''my'' THEN 0 ELSE '
 || '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
 || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
 || 'WHERE fm.filter_id = sf.id '
 || 'AND GREATEST(p.created_at, p.updated_at) > GREATEST(sf.created_at, '
 || 'COALESCE((SELECT ufs.seen_at FROM user_filter_seen ufs '
 || 'WHERE ufs.user_id = sf.user_id AND ufs.filter_id = sf.id AND ufs.property_id = fm.property_id), '
 || '''epoch''::timestamptz))) END';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- идемпотентность: уже обёрнуто в CASE по scope
  IF position('sf.filters->>''scope''' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters my-scope-zero: уже применено — пропускаю';
    RETURN;
  END IF;

  -- guard базы: ожидаем формулу re-notify (иначе якорь/база иные — прерываем)
  IF position('GREATEST(p.created_at, p.updated_at)' in v_def) = 0 THEN
    RAISE EXCEPTION 'get_saved_filters: базовая re-notify формула не найдена — патч прерван';
  END IF;

  -- guard единственности якоря конца выражения
  IF (length(v_def) - length(replace(v_def, '''notification_type''', '')))
       / length('''notification_type''') <> 1 THEN
    RAISE EXCEPTION 'get_saved_filters: ''notification_type'' встречается не один раз — якорь неоднозначен';
  END IF;

  v_new := regexp_replace(
    v_def,
    E'(''unseen_count''[[:space:]]*,[[:space:]]*).*?([[:space:]]*,[[:space:]]*''notification_type'')',
    E'\\1' || v_expr || E'\\2'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_saved_filters: якорь unseen_count..notification_type не найден — тело изменилось';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_saved_filters.unseen_count: my-scope → 0 применён';
END
$migrate$;
```

- [ ] **Step 2: ГЕЙТ — запросить разрешение и применить на прод (ROLLBACK-смоук)**

Объяснить создателю и дождаться «да». Затем smoke:

```sql
BEGIN;
-- применить тело миграции --
-- проверка: определение содержит CASE по scope
SELECT position('sf.filters->>''scope''' in pg_get_functiondef('public.get_saved_filters'::regproc)) > 0 AS has_scope_case;  -- ожидаем t
-- для My-фильтра (если есть) unseen_count=0; найти My-фильтр и сверить
SELECT (r ->> 'unseen_count')::int AS my_unseen
FROM jsonb_array_elements(get_saved_filters('<NAZAROV_UUID>') -> 'results') r
WHERE (r -> 'filters' ->> 'scope') = 'my';  -- ожидаем 0 для всех таких строк
ROLLBACK;
```

После зелёного — применить реально, `git mv` в `applied/`.

- [ ] **Step 3: Записать T-SC2 в docs/tests.md и commit**

```bash
git add docs/migrations/applied/2026-06-23-get-saved-filters-my-scope-zero.sql docs/tests.md
git commit -m "migrate(filters): get_saved_filters unseen_count=0 для scope=my"
```

---

## Task 3: Типы + `FeedFilterService` — `MyStatus`, `myStatus`, `setScope`, `serverScope`

**Files:**

- Modify: `src/app/mrsqm/types/database.ts` (интерфейс `FeedParams`)
- Modify: `src/app/mrsqm/services/feed-filter.service.ts`
- Test: `src/app/mrsqm/services/feed-filter.service.spec.ts`

**Interfaces:**

- Produces:
  - `type MyStatus = 'all' | 'active' | 'archived' | 'rejected' | 'expired' | 'pending'`
  - `FeedFilterService.myStatus: WritableSignal<MyStatus>`
  - `FeedFilterService.setScope(scope: FeedScope): void` — ставит scope; при `'my'` сбрасывает `myStatus` в `'all'`.
  - `FeedFilterService.serverScope(): 'all' | 'friends' | 'my'` — маппинг текущего scope (`'public'/'favourites'→'all'`).
  - `FeedParams += { p_scope?: 'all'|'friends'|'my'; p_my_status?: MyStatus; p_city_id?: string | null }`

- [ ] **Step 1: Найти `FeedParams` и добавить поля**

Прочитать `src/app/mrsqm/types/database.ts`, найти интерфейс `FeedParams`. Добавить в него (рядом с прочими `p_*`):

```typescript
  p_scope?: 'all' | 'friends' | 'my';
  p_my_status?: 'all' | 'active' | 'archived' | 'rejected' | 'expired' | 'pending';
  p_city_id?: string | null;
```

- [ ] **Step 2: Написать падающий тест на `setScope` и `serverScope`**

В `src/app/mrsqm/services/feed-filter.service.spec.ts` добавить:

```typescript
describe('scope + myStatus (SC)', () => {
  it('setScope("my") сбрасывает myStatus в "all"', () => {
    const svc = TestBed.inject(FeedFilterService);
    svc.myStatus.set('archived');
    svc.setScope('my');
    expect(svc.scope()).toBe('my');
    expect(svc.myStatus()).toBe('all');
  });

  it('serverScope маппит public/favourites → all', () => {
    const svc = TestBed.inject(FeedFilterService);
    svc.setScope('public');
    expect(svc.serverScope()).toBe('all');
    svc.setScope('favourites');
    expect(svc.serverScope()).toBe('all');
    svc.setScope('friends');
    expect(svc.serverScope()).toBe('friends');
    svc.setScope('my');
    expect(svc.serverScope()).toBe('my');
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/feed-filter.service.spec.ts`
Expected: FAIL — `setScope`/`serverScope`/`myStatus` не существуют.

- [ ] **Step 4: Реализовать в `feed-filter.service.ts`**

Добавить тип рядом с `FeedScope` (после строки 14):

```typescript
// Статус-фильтр My-инвентаря (виден только при scope='my'); маппится в p_my_status get_feed.
export type MyStatus = 'all' | 'active' | 'archived' | 'rejected' | 'expired' | 'pending';
```

Добавить сигнал рядом с `scope` (после строки 119):

```typescript
  // Статус My-инвентаря: дефолт All listings; сбрасывается при входе в My.
  readonly myStatus = signal<MyStatus>('all');
```

Добавить методы (рядом с `set`, после строки 244):

```typescript
  // Единая точка смены охвата: при входе в My сбрасываем статус в All listings.
  setScope(scope: FeedScope): void {
    this.scope.set(scope);
    if (scope === 'my') this.myStatus.set('all');
  }

  // Серверный охват для get_feed: public и favourites грузятся как 'all'
  // (favourites — клиентский вид по закладкам поверх 'all').
  serverScope(): 'all' | 'friends' | 'my' {
    const s = this.scope();
    return s === 'friends' || s === 'my' ? s : 'all';
  }
```

В `resetAll()` (строки 300–307) сбросить статус — добавить строку `this.myStatus.set('all');` после `this.scope.set('public');`.

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/services/feed-filter.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/types/database.ts src/app/mrsqm/services/feed-filter.service.ts src/app/mrsqm/services/feed-filter.service.spec.ts
git add src/app/mrsqm/types/database.ts src/app/mrsqm/services/feed-filter.service.ts src/app/mrsqm/services/feed-filter.service.spec.ts
git commit -m "feat(feed): MyStatus + setScope/serverScope в FeedFilterService"
```

---

## Task 4: `feed-page` — серверный охват в параметрах, снос клиентского scope-фильтра и оптимистики

**Files:**

- Modify: `src/app/mrsqm/pages/feed/feed-page.component.ts`
- Test: `src/app/mrsqm/pages/feed/feed-page.component.spec.ts`

**Interfaces:**

- Consumes: `FeedFilterService.serverScope()`, `.myStatus()`, `SavedFilterService.bumpReload()` (создаётся в Task 6 — на момент Task 4 ещё нет; см. Step 5).
- Produces: `_buildParams` отдаёт `p_scope`/`p_my_status`; reload при смене scope/myStatus; `visibleProperties` без серверных охватов.

- [ ] **Step 1: Написать падающий тест на параметры и фильтрацию**

В `feed-page.component.spec.ts` добавить (адаптировать под существующий setup компонента/спаев — у спая `SavedFilterService` должны быть методы `list`, `bumpReload`):

```typescript
it('_buildParams включает p_scope из serverScope и p_my_status', async () => {
  component.filter.setScope('friends');
  const params = await (component as any)._buildParams();
  expect(params.p_scope).toBe('friends');
  expect(params.p_my_status).toBe('all');
});

it('visibleProperties не фильтрует по охвату для серверных scope (friends)', () => {
  component.filter.setScope('friends');
  const a = { id: '1', owner_id: 'x', is_network: false } as any;
  component.properties.set([a]);
  // сервер уже отдал нужный охват → клиент не режет по is_network
  expect(component.visibleProperties().length).toBe(1);
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: FAIL (p_scope отсутствует; visibleProperties режет по is_network).

- [ ] **Step 3: Добавить `p_scope`/`p_my_status` в `_buildParams`**

В `_buildParams` (после `p_offset: this.offset(),`, строка 530) добавить:

```typescript
      p_scope: this.filter.serverScope(),
      p_my_status: this.filter.serverScope() === 'my' ? this.filter.myStatus() : 'all',
```

- [ ] **Step 4: Включить scope/myStatus в reload-effect; упростить `visibleProperties`/`foundCount`**

В reload-`effect` конструктора (строки 407–418) добавить зависимости перед `this.offset.set(0)`:

```typescript
this.filter.serverScope(); // охват теперь серверный → перезагрузка
this.filter.myStatus();
```

Заменить `visibleProperties` (строки 122–153) на (сервер уже отдал охват; на клиенте остаётся только Favourites-вид по закладкам и фильтр по агенту):

```typescript
  // Сервер отдаёт нужный охват (p_scope). На клиенте остаётся только вид
  // Favourites (закладки поверх загрузки 'all') и интерим-фильтр по агенту (ФИО).
  readonly visibleProperties = computed<PropertyFeedItem[]>(() => {
    let scoped = this.properties();
    if (this.filter.scope() === 'favourites') {
      scoped = scoped.filter((p) => this.savedIds().has(p.id));
    }
    const agent = this.filter.agentQuery().trim().toLowerCase();
    if (agent) {
      scoped = scoped.filter((p) =>
        (p.owner_full_name ?? '').toLowerCase().includes(agent),
      );
    }
    return scoped;
  });
```

Заменить `foundCount` (строки 158–162) на:

```typescript
  // Серверные охваты (public/friends/my) — серверный count_total; Favourites — клиентский.
  readonly foundCount = computed(() =>
    this.filter.scope() === 'favourites'
      ? this.visibleProperties().length
      : this.countTotal(),
  );
```

В `setScope` (строки 182–184) перейти на сервисный метод:

```typescript
  setScope(scope: FeedScope): void {
    this.filter.setScope(scope);
  }
```

- [ ] **Step 5: Убрать оптимистику из `_markPageShown`, добавить refresh бейджа**

Заменить блок Bug B в `_markPageShown` (строки 586–596) на (без `markSeenLocally`; после серверной пометки — перечитать бейджи через `bumpReload`, метод из Task 6):

```typescript
// Если открыт сохранённый фильтр — помечаем показанные ЧУЖИЕ объекты просмотренными
// на сервере; затем перечитываем бейджи (число берём только с бекенда, без оптимистики).
const fid = this.filter.loadedFilterId();
if (fid) {
  const myId = this._auth.currentUser()?.id ?? null;
  const matchIds = items.filter((it) => it.owner_id !== myId).map((it) => it.id);
  if (matchIds.length) {
    void this._seen
      .markFilterSeen(fid, matchIds)
      .then(() => this._savedFilters.bumpReload());
  }
}
```

- [ ] **Step 6: Запустить тесты feed-page**

Run: `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts`
Expected: PASS. (Если ломаются существующие тесты на спай `SavedFilterService` — добавить `bumpReload: jasmine.createSpy()` в спай; `markSeenLocally` больше не вызывается.)

- [ ] **Step 7: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/feed/feed-page.component.ts src/app/mrsqm/pages/feed/feed-page.component.spec.ts
git add src/app/mrsqm/pages/feed/feed-page.component.ts src/app/mrsqm/pages/feed/feed-page.component.spec.ts
git commit -m "feat(feed): серверный p_scope/p_my_status, снос клиентского охвата и оптимистики"
```

---

## Task 5: `feed-filter-panel` — Охват = Select из 3, блок My-статуса (6), снос `savedFiltersView`

**Files:**

- Modify: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts`
- Modify: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.html`
- Test: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`

**Interfaces:**

- Consumes: `FeedFilterService.setScope`, `.myStatus`, `MyStatus`.
- Produces: `scopeChoices` (3), `myStatusChoices` (6), `setLiveScope` через `setScope`, `setMyStatus`.

- [ ] **Step 1: Написать падающий тест на 3 охвата и сброс статуса**

В `feed-filter-panel.component.spec.ts` добавить:

```typescript
it('scopeChoices содержит ровно All/Friends/My (без Favourites)', () => {
  expect(component.scopeChoices.map((c) => c.value)).toEqual(['public', 'friends', 'my']);
});

it('setLiveScope("my") выставляет myStatus=all', () => {
  component.setLiveScope('my');
  expect(component._filterService.scope()).toBe('my');
  expect(component._filterService.myStatus()).toBe('all');
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`
Expected: FAIL (нет `scopeChoices`).

- [ ] **Step 3: Заменить badge-крутилку и `setLiveScope`; добавить choices/handlers в `.ts`**

Удалить `savedFiltersView` computed (строки 79–85). В шаблоне (Step 4) бейдж будет читать `f.unseen_count` напрямую.

Импортировать `MyStatus` (строка 18–24, добавить в список из `feed-filter.service`).

Заменить `setLiveScope` (строки 538–541) на:

```typescript
  // Охват: Select из 3 (All/Friends/My). My/Public/Friends — серверные; favourites
  // выбирается только вкладкой тулбара, в панели его нет.
  readonly scopeChoices: ReadonlyArray<{ value: FeedScope; label: string }> = [
    { value: 'public', label: 'All Inventory' },
    { value: 'friends', label: 'Friends Inventory' },
    { value: 'my', label: 'My Inventory' },
  ];

  setLiveScope(value: FeedScope): void {
    this._filterService.setScope(value);
  }

  // Статус My-инвентаря (виден только при scope='my'); дефолт All listings.
  readonly myStatusChoices: ReadonlyArray<{ value: MyStatus; label: string }> = [
    { value: 'all', label: 'All listings' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'expired', label: 'Expired' },
    { value: 'pending', label: 'Pending' },
  ];

  setMyStatus(value: MyStatus): void {
    this._filterService.myStatus.set(value);
  }
```

- [ ] **Step 4: Обновить `.html` — Охват из 3, блок статуса, бейдж по `unseen_count`**

Прочитать `feed-filter-panel.component.html`. Найти:

1. Текущий контрол охвата (использует `setLiveScope`/scope) — заменить на рендер по `scopeChoices` (кнопки/радио в существующем стиле панели; повторить разметку соседнего Select-блока, напр. сегмента, чтобы стиль совпал). Активная = `_filterService.scope() === c.value`.
2. **Сразу ПОД блоком охвата** добавить блок статуса, обёрнутый в `@if (_filterService.scope() === 'my') { … }`, рендер по `myStatusChoices`, активная = `_filterService.myStatus() === c.value`, клик → `setMyStatus(c.value)`. Заголовок блока «Статус».
3. Бейдж сохранённого фильтра: заменить `savedFiltersView()` → `savedFilters()` и `f.displayUnseen` → `f.unseen_count` (показывать `@if (f.unseen_count > 0)`).

Пример блока статуса (вставить под охватом; класс-обёртки взять как у соседних секций панели):

```html
@if (_filterService.scope() === 'my') {
<div class="filter-section">
  <div class="section-title">Статус</div>
  <div class="chip-row">
    @for (c of myStatusChoices; track c.value) {
    <button
      type="button"
      class="chip"
      [class.active]="_filterService.myStatus() === c.value"
      (click)="setMyStatus(c.value)"
    >
      {{ c.label }}
    </button>
    }
  </div>
</div>
}
```

- [ ] **Step 5: Запустить тесты панели**

Run: `npm run test:file src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`
Expected: PASS. (Если падают тесты, дёргавшие `savedFiltersView`/`displayUnseen` или `localSeenCount` — обновить их на `savedFilters`/`unseen_count`; убрать обращения к удалённым методам спая.)

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts
git add src/app/mrsqm/components/feed-filter-panel/
git commit -m "feat(feed): Охват=Select(3) + блок статуса My(6), бейдж без оптимистики"
```

---

## Task 6: `saved-filter.service` — удалить оптимистику, добавить `reloadTick`/`bumpReload`

**Files:**

- Modify: `src/app/mrsqm/services/saved-filter.service.ts`
- Modify: `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts` (перевести загрузку на effect по `reloadTick`; убрать `clearLocalSeen`)
- Test: `src/app/mrsqm/services/saved-filter.service.spec.ts`

**Interfaces:**

- Produces: `SavedFilterService.reloadTick: Signal<number>`, `bumpReload(): void`.
- Removes: `_localFilterSeen`, `markSeenLocally`, `clearLocalSeen`, `localSeenCount`.

**Делается ПОСЛЕ Tasks 4 и 5 — они убрали последних потребителей удаляемых методов.**

- [ ] **Step 1: Написать тест на `bumpReload`**

В `saved-filter.service.spec.ts` добавить (и убрать любые тесты на `markSeenLocally`/`localSeenCount`, если есть):

```typescript
it('bumpReload инкрементит reloadTick', () => {
  const svc = TestBed.inject(SavedFilterService);
  const before = svc.reloadTick();
  svc.bumpReload();
  expect(svc.reloadTick()).toBe(before + 1);
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/services/saved-filter.service.spec.ts`
Expected: FAIL (нет `reloadTick`/`bumpReload`).

- [ ] **Step 3: Удалить оптимистику, добавить reloadTick**

В `saved-filter.service.ts` удалить строки 49–73 (`_localFilterSeen`, `localSeenCount`, `markSeenLocally`, `clearLocalSeen` со всеми комментариями). Вместо них добавить:

```typescript
  // Тик перезагрузки списка фильтров: бампается после серверной пометки seen
  // (feed-page), панель перечитывает get_saved_filters → бейдж = чистое число бекенда.
  readonly reloadTick = signal(0);

  bumpReload(): void {
    this.reloadTick.update((t) => t + 1);
  }
```

(Убедиться, что `signal` импортирован — строка 1 уже импортирует из `@angular/core`.)

- [ ] **Step 4: Перевести панель на effect по reloadTick**

В `feed-filter-panel.component.ts`:

- В `_loadSavedFilters` (строки 252–260) удалить строку `this._savedSvc.clearLocalSeen();`.
- В конструкторе (строки 239–242) заменить `void this._loadSavedFilters();` на effect:

```typescript
  constructor() {
    void this._loadOptions();
    effect(() => {
      this._savedSvc.reloadTick(); // зависимость: перезагрузка по сигналу
      void this._loadSavedFilters();
    });
  }
```

(Добавить `effect` в импорт из `@angular/core` — строки 1–12.)

- [ ] **Step 5: Запустить тесты сервиса и панели**

Run: `npm run test:file src/app/mrsqm/services/saved-filter.service.spec.ts`
Run: `npm run test:file src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.spec.ts`
Expected: PASS оба. (Спай `SavedFilterService` в тестах панели/страницы: добавить `reloadTick: () => 0`, `bumpReload: jasmine.createSpy()`; удалить из спая `localSeenCount`/`clearLocalSeen`/`markSeenLocally`.)

- [ ] **Step 6: Полный гейт сборки + commit**

```bash
npm run checkFile src/app/mrsqm/services/saved-filter.service.ts src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts
npm run lint
npm run buildFrontend:prodWeb
git add src/app/mrsqm/services/saved-filter.service.ts src/app/mrsqm/services/saved-filter.service.spec.ts src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts
git commit -m "refactor(feed): бейдж без оптимистики — reloadTick + перечитка с бекенда"
```

---

## Self-Review

**1. Spec coverage (SC-1…SC-6):**

- SC-1 (продакшн-рефактор + P2 + единый проход) → Task 1 ✓
- SC-2 (статус-фильтр My в get_feed) → Task 1 (`p_my_status`) ✓
- SC-3 (feed-page p_scope, снос клиентского scope) → Task 4 ✓
- SC-4 (Охват = Select 3) → Task 5 ✓
- SC-5 (блок статуса 6, дефолт All listings) → Task 3 (`myStatus`+reset) + Task 5 (UI) ✓
- SC-6 (снос оптимистики, бейдж с бекенда + перечитка; my→0) → Task 2 (read-side `0`) + Task 4 (refresh) + Task 5/6 (снос) ✓
- SC-7 (город) — НЕ в этом плане (отдельный). SC-8/9/10 — задачи/брифы. ✓ (зафиксировано в Global Constraints / File Structure)

**2. Placeholder scan:** код полный в каждом шаге; `<NAZAROV_UUID>` в smoke — реальный uuid подставит исполнитель из БД (это значение прод-данных, не плейсхолдер кода). ✓

**3. Type consistency:** `MyStatus` (Task 3) — те же 6 значений в `myStatusChoices` (Task 5) и в `p_my_status` валидации SQL (Task 1). `serverScope()→'all'|'friends'|'my'` совпадает с `p_scope` валидацией SQL. `bumpReload`/`reloadTick` (Task 6) потребляются в Task 4 (feed-page) и Task 6 (панель). ✓

---

## Execution Handoff

План сохранён в `docs/superpowers/plans/2026-06-23-get-feed-scope-rework.md`. Дальше — Subagent-Driven (как договорились): свежий субагент на задачу, ревью между задачами, прод-миграции — под гейтом «да» создателя.
