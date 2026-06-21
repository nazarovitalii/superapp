-- ============================================================================
-- ⚠️ ЧЕРНОВИК — НЕ ПРИМЕНЯТЬ без явного «применяй» от создателя.
--
-- Миграция: get_feed — Фильтры ленты v2 (новые поля + фикс этажности).
--
-- ВАЖНО: это НЕ staleness-proof body-патч (как get_property). Здесь МЕНЯЕТСЯ
--   СИГНАТУРА функции, а PostgreSQL не умеет менять сигнатуру через
--   CREATE OR REPLACE → нужен полный DROP FUNCTION + CREATE с переписыванием тела.
--
-- ДЕЛЬТА СИГНАТУРЫ относительно текущей (docs/database.md):
--   • УБРАТЬ   p_is_distress boolean
--   • ЗАМЕНИТЬ p_floor_level_id uuid       → p_floor_level_ids uuid[]
--   • ЗАМЕНИТЬ p_floors_in_unit text[]     → p_floors_in_unit_ids uuid[]   (фикс: фильтр
--             шёл по мёртвой text-колонке p.floors_in_unit; живая — uuid floors_in_unit_id)
--   • ДОБАВИТЬ p_cheques int[], p_is_study, p_is_reduced, p_is_below_op, p_is_vastu (в конец)
--
-- ДЕЛЬТА ТЕЛА:
--   • floor_level / floors_in_unit условия — на массивы и на uuid-колонку
--   • убрать условие p_is_distress; добавить 5 новых условий (в COUNT и в SELECT)
--   • jsonb-вывод: убрать is_distress, is_negotiable; floors_in_unit → floors_in_unit_id
--
-- НЕ ТРОГАЕМ: колонки is_distress / is_negotiable в properties (DROP — позже, отдельно).
-- РИСК: get_location_path / count_nearby_listings делят похожий контракт — НЕ меняются здесь
--   (продолжают работать со своей сигнатурой). Согласовать при ревью.
-- ПРИМЕНЯТЬ под ролью supabase_admin. ОТКАТ: вернуть прежнюю сигнатуру+тело из database.md.
-- ============================================================================

-- ── 1) Снять старую функцию (точная сигнатура из database.md) ───────────────
DROP FUNCTION IF EXISTS public.get_feed(
  text, uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, integer[], integer[],
  boolean, boolean, text, uuid, text[], numeric, numeric, numeric, numeric, numeric,
  numeric, text, text, text[], text[], text[], text, boolean, text, text, integer[],
  text[], text, numeric, numeric, uuid[], text, integer, integer
);

-- ── 2) Создать новую (изменённые типы p_floor_level_ids/p_floors_in_unit_ids,
--       без p_is_distress, +5 новых параметров в конце) ──────────────────────
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
  p_floor_level_ids uuid[] DEFAULT NULL::uuid[],          -- было p_floor_level_id uuid
  p_floors_in_unit_ids uuid[] DEFAULT NULL::uuid[],       -- было p_floors_in_unit text[]
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
  -- p_is_distress УДАЛЁН
  p_occupancy_status text DEFAULT NULL::text,
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
  -- ── новые параметры v2 ──
  p_cheques integer[] DEFAULT NULL::integer[],
  p_is_study boolean DEFAULT NULL::boolean,
  p_is_reduced boolean DEFAULT NULL::boolean,
  p_is_below_op boolean DEFAULT NULL::boolean,
  p_is_vastu boolean DEFAULT NULL::boolean
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
    AND (p_occupancy_status IS NULL OR p.occupancy_status = p_occupancy_status)
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
      AND (p_occupancy_status IS NULL OR p.occupancy_status = p_occupancy_status)
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

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения, под обычной ролью с JWT/auth.uid):
--   • этажность по uuid:    get_feed('rent', p_floors_in_unit_ids => ARRAY['<uuid>']::uuid[]) → объекты с этим floors_in_unit_id
--   • чеки:                 get_feed('rent', p_cheques => ARRAY[2]) → объекты с cheques=2
--   • кабинет:              get_feed('sale', p_is_study => true)
--   • снижение цены:        get_feed('sale', p_is_reduced => true)
--   • p_is_distress больше НЕ принимается (ошибка «function does not exist» при передаче)
-- ОТКАТ: DROP новой сигнатуры + восстановить прежнюю из docs/database.md.
-- ============================================================================
