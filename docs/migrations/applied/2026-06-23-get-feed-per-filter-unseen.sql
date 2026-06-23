-- get_feed: per-filter is_unseen (Request 4, путь A)
-- ЗАЧЕМ: подсветка непросмотра в ленте должна совпадать с бейджем сохранённого фильтра.
--   Бейдж (get_saved_filters.unseen_count) считается по filter_matches + user_filter_seen
--   (re-notify). А is_unseen в ленте считался ГЛОБАЛЬНО (user_seen_listings.shown_at) →
--   объект «новый по фильтру», но глобально показанный, не подсвечивался. Рассинхрон.
-- ЧТО: добавлен аргумент p_filter_id (47-й). Когда передан — is_unseen считается по той
--   же формуле, что и бейдж (тот же источник). Когда NULL — прежнее глобальное поведение.
-- СИГНАТУРА МЕНЯЕТСЯ (46→47) → DROP + CREATE, строго транзакционно (apply-migration.sh).
-- Тело взято из живой БД (pg_get_functiondef) + 2 точечные правки (детерминированно).
-- Обратимо: DROP новой 47-арг + CREATE прежней 46-арг (см. applied-архив прошлой миграции).

DROP FUNCTION IF EXISTS public.get_feed(p_deal_type text, p_user_id uuid, p_city_id uuid, p_category_id uuid, p_unit_type_id uuid, p_sub_type_ids uuid[], p_location_ids uuid[], p_developer_ids uuid[], p_developer_name text, p_bedrooms integer[], p_bathrooms integer[], p_is_maid boolean, p_is_hotel_pool boolean, p_furnished text, p_floor_level_ids uuid[], p_floors_in_unit_ids uuid[], p_area_sqft_min numeric, p_area_sqft_max numeric, p_plot_sqft_min numeric, p_plot_sqft_max numeric, p_price_min numeric, p_price_max numeric, p_price_currency text, p_price_period text, p_view_ids text[], p_position_ids text[], p_amenity_ids text[], p_listing_type text, p_occupancy_status text[], p_handover text, p_completion_year integer[], p_completion_q text[], p_description text, p_lat numeric, p_lng numeric, p_exclude_location_ids uuid[], p_sort_by text, p_limit integer, p_offset integer, p_cheques integer[], p_is_study boolean, p_is_reduced boolean, p_is_below_op boolean, p_is_vastu boolean, p_scope text, p_my_status text);

CREATE OR REPLACE FUNCTION public.get_feed(p_deal_type text, p_user_id uuid DEFAULT NULL::uuid, p_city_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_unit_type_id uuid DEFAULT NULL::uuid, p_sub_type_ids uuid[] DEFAULT NULL::uuid[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_developer_ids uuid[] DEFAULT NULL::uuid[], p_developer_name text DEFAULT NULL::text, p_bedrooms integer[] DEFAULT NULL::integer[], p_bathrooms integer[] DEFAULT NULL::integer[], p_is_maid boolean DEFAULT NULL::boolean, p_is_hotel_pool boolean DEFAULT NULL::boolean, p_furnished text DEFAULT NULL::text, p_floor_level_ids uuid[] DEFAULT NULL::uuid[], p_floors_in_unit_ids uuid[] DEFAULT NULL::uuid[], p_area_sqft_min numeric DEFAULT NULL::numeric, p_area_sqft_max numeric DEFAULT NULL::numeric, p_plot_sqft_min numeric DEFAULT NULL::numeric, p_plot_sqft_max numeric DEFAULT NULL::numeric, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_price_currency text DEFAULT 'AED'::text, p_price_period text DEFAULT NULL::text, p_view_ids text[] DEFAULT NULL::text[], p_position_ids text[] DEFAULT NULL::text[], p_amenity_ids text[] DEFAULT NULL::text[], p_listing_type text DEFAULT NULL::text, p_occupancy_status text[] DEFAULT NULL::text[], p_handover text DEFAULT NULL::text, p_completion_year integer[] DEFAULT NULL::integer[], p_completion_q text[] DEFAULT NULL::text[], p_description text DEFAULT NULL::text, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_exclude_location_ids uuid[] DEFAULT NULL::uuid[], p_sort_by text DEFAULT 'default'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_cheques integer[] DEFAULT NULL::integer[], p_is_study boolean DEFAULT NULL::boolean, p_is_reduced boolean DEFAULT NULL::boolean, p_is_below_op boolean DEFAULT NULL::boolean, p_is_vastu boolean DEFAULT NULL::boolean, p_scope text DEFAULT 'all'::text, p_my_status text DEFAULT 'all'::text, p_filter_id uuid DEFAULT NULL::uuid)
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
            'public_location_name', COALESCE(pl.name, l.name),
            'public_community_name', COALESCE(plc.name, lc.name),
            'is_unseen', CASE WHEN p_filter_id IS NOT NULL THEN EXISTS (SELECT 1 FROM public.filter_matches fm JOIN public.saved_filters sf ON sf.id = fm.filter_id WHERE fm.filter_id = p_filter_id AND fm.property_id = p.id AND sf.user_id = v_current_user_id AND GREATEST(p.created_at, p.updated_at) > GREATEST(sf.created_at, COALESCE((SELECT ufs.seen_at FROM public.user_filter_seen ufs WHERE ufs.user_id = sf.user_id AND ufs.filter_id = sf.id AND ufs.property_id = p.id), 'epoch'::timestamptz))) ELSE (p.owner_id IS DISTINCT FROM v_current_user_id AND GREATEST(p.created_at, p.updated_at) > COALESCE((SELECT usl.shown_at FROM public.user_seen_listings usl WHERE usl.property_id = p.id AND usl.user_id = v_current_user_id), 'epoch'::timestamptz)) END,
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
  LEFT JOIN locations pl  ON pl.id  = p.public_location_id
  LEFT JOIN locations plc ON plc.id = pl.community_id
  WHERE b.rn > p_offset AND b.rn <= p_offset + p_limit;

  RETURN v_result;

END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_feed(p_deal_type text, p_user_id uuid, p_city_id uuid, p_category_id uuid, p_unit_type_id uuid, p_sub_type_ids uuid[], p_location_ids uuid[], p_developer_ids uuid[], p_developer_name text, p_bedrooms integer[], p_bathrooms integer[], p_is_maid boolean, p_is_hotel_pool boolean, p_furnished text, p_floor_level_ids uuid[], p_floors_in_unit_ids uuid[], p_area_sqft_min numeric, p_area_sqft_max numeric, p_plot_sqft_min numeric, p_plot_sqft_max numeric, p_price_min numeric, p_price_max numeric, p_price_currency text, p_price_period text, p_view_ids text[], p_position_ids text[], p_amenity_ids text[], p_listing_type text, p_occupancy_status text[], p_handover text, p_completion_year integer[], p_completion_q text[], p_description text, p_lat numeric, p_lng numeric, p_exclude_location_ids uuid[], p_sort_by text, p_limit integer, p_offset integer, p_cheques integer[], p_is_study boolean, p_is_reduced boolean, p_is_below_op boolean, p_is_vastu boolean, p_scope text, p_my_status text, p_filter_id uuid) TO anon, authenticated, service_role;
