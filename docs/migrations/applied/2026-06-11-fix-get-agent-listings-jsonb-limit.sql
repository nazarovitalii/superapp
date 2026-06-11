-- Миграция: починка get_agent_listings (лимит аргументов jsonb_build_object)
-- Дата: 2026-06-11
--
-- ПРОБЛЕМА: единственный jsonb_build_object с ~68 парами (>100 аргументов)
--   → ошибка 54023 "cannot pass more than 100 arguments to a function".
--   RPC падала при любом вызове.
-- РЕШЕНИЕ: разбить на два jsonb_build_object, объединённых через || (как в
--   get_feed). Логика выборки/фильтров/пагинации НЕ изменена.
-- Источник: pg_get_functiondef из живой БД, заменён целиком.

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
      'commission_included', p.commission_included
    ) || jsonb_build_object(
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

;
