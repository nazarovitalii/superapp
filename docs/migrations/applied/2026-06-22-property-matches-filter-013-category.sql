-- ============================================================================
-- 2026-06-22-property-matches-filter-013-category.sql
-- Применил superApp-чат (владелец БД) с явного согласия создателя 2026-06-22.
-- Канонический источник: realtime/migrations/product/013_category_text_enum_resolve.up.sql
-- Баг диагностирован superApp (category текст-enum кастился в uuid → DLQ-краш матчинга).
-- 013 = 012 + резолв category через property_type_values (diff подтверждён: 1 строка).
-- ============================================================================

-- 013 — фикс каста category: текст-enum → uuid через property_type_values (баг от superApp 2026-06-22).
-- Симптом: backfill-джоба фильтра с категорией падала в DLQ — invalid input syntax for type uuid: "residential".
-- Корень: верхнеуровневый saved_filters.filters->>'category' хранится как текст-enum (residential/commercial),
--   а не uuid (так кладёт фронт для UI-каскада Residential→типы). get_feed резолвит текст→uuid на клиенте
--   через property_type_values; предикат читает фильтр без клиента → прямой ::uuid каст крашил весь матч.
-- Фикс: резолвим так же — подзапросом в property_type_values (group_name='category').
-- Проверка значений (superApp): residential→b689995a-a408-4b2c-a042-fda35cfa082b,
--                                commercial →05de4361-d16a-4e68-bf5b-19a8e58fc110.
-- NULL-category (фильтр без категории) → подзапрос вернёт NULL → условие пропускается (как и было).
-- Кумулятивно поверх 012 (developer-резолв через location_developers).
--
-- 012 — developer-резолв предиката 1:1 с get_feed: ТОЛЬКО location_developers (источник правды).
-- Правка по ревью superApp (2026-06-22): в 007 был UNION двух путей —
--   (A) location_developers join (как лента) + (B) locations.developer_ids && sf.developer_ids (денорм-кэш).
-- Путь (B) — денормализованный кэш БЕЗ sync-триггера, рассинхронен (72 локации с записью в
-- location_developers имеют пустой developer_ids) → делал предикат НАДМНОЖЕСТВОМ ленты (бейдж ≠ get_feed).
-- Убираем (B), оставляем (A) → матчер строго 1:1 с лентой. У superApp get_feed уже на location_developers.
--
-- Предикат матчинга: точная копия WHERE-логики get_feed из superApp.
-- SECURITY DEFINER: обходит RLS на saved_filters/properties — матчер работает как системный процесс.
-- Инварианты: listingType='all'→NULL (пропуск); пустые массивы→cardinality 0 (пропуск);
-- developerIds резолвится через location_developers (join-таблица — источник правды, НЕ locations.developer_ids).
CREATE OR REPLACE FUNCTION public.property_matches_filter(
  p_property_id uuid,
  p_filter_id   uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH sf AS (
    SELECT
      sf.city_id,
      (sf.filters->>'dealType')                               AS deal_type,
      -- category в filters — текст-enum (residential/commercial), резолвим в uuid как get_feed (013):
      (SELECT ptv.id FROM property_type_values ptv
         WHERE ptv.group_name = 'category'
           AND ptv.value = sf.filters->>'category')            AS category_id,
      (sf.filters->>'handover')                               AS handover,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'locations','[]'::jsonb))
      )::uuid[]                                               AS location_ids,
      NULLIF((sf.filters->'filters'->>'listingType'),'all')   AS listing_type,
      (sf.filters->'filters'->>'furnished')                   AS furnished,
      (sf.filters->'filters'->>'unitTypeId')::uuid            AS unit_type_id,
      (sf.filters->'filters'->>'pricePeriod')                 AS price_period,
      (sf.filters->'filters'->>'priceMin')::numeric           AS price_min,
      (sf.filters->'filters'->>'priceMax')::numeric           AS price_max,
      (sf.filters->'filters'->>'areaMin')::numeric            AS area_min,
      (sf.filters->'filters'->>'areaMax')::numeric            AS area_max,
      (sf.filters->'filters'->>'plotMin')::numeric            AS plot_min,
      (sf.filters->'filters'->>'plotMax')::numeric            AS plot_max,
      (sf.filters->'filters'->>'isStudy')::boolean            AS is_study,
      (sf.filters->'filters'->>'isVastu')::boolean            AS is_vastu,
      (sf.filters->'filters'->>'isBelowOp')::boolean          AS is_below_op,
      (sf.filters->'filters'->>'isReduced')::boolean          AS is_reduced,
      (sf.filters->'filters'->>'isMaid')::boolean             AS is_maid,
      (sf.filters->'filters'->>'isHotelPool')::boolean        AS is_hotel_pool,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'bedrooms','[]'::jsonb))
      )::integer[]                                            AS bedrooms,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'bathrooms','[]'::jsonb))
      )::integer[]                                            AS bathrooms,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'subTypeIds','[]'::jsonb))
      )::uuid[]                                               AS sub_type_ids,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'developerIds','[]'::jsonb))
      )::uuid[]                                               AS developer_ids,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'floorLevelIds','[]'::jsonb))
      )::uuid[]                                               AS floor_level_ids,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'floorsInUnitIds','[]'::jsonb))
      )::uuid[]                                               AS floors_in_unit_ids,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'completionYears','[]'::jsonb))
      )::integer[]                                            AS completion_years,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'completionQ','[]'::jsonb))
      )                                                       AS completion_q,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'occupancyStatus','[]'::jsonb))
      )                                                       AS occupancy_status,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'cheques','[]'::jsonb))
      )::integer[]                                            AS cheques,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'viewIds','[]'::jsonb))
      )                                                       AS view_ids,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'positionIds','[]'::jsonb))
      )                                                       AS position_ids,
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(sf.filters->'filters'->'amenityIds','[]'::jsonb))
      )                                                       AS amenity_ids
    FROM saved_filters sf
    WHERE sf.id = p_filter_id
      AND sf.deleted_at IS NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM properties p
    JOIN locations loc ON loc.id = p.location_id
    CROSS JOIN sf
    LEFT JOIN LATERAL (
      -- Только location_developers (источник правды). Денорм-путь locations.developer_ids убран (012).
      SELECT array_agg(DISTINCT ld.location_id) AS dev_location_ids
      FROM location_developers ld
      WHERE cardinality(sf.developer_ids) > 0
        AND ld.developer_id = ANY(sf.developer_ids)
    ) dev ON true
    WHERE p.id = p_property_id
      AND p.status    = 'active'
      AND p.deal_type = sf.deal_type
      AND loc.city_id = sf.city_id
      AND (
        cardinality(sf.location_ids) = 0
        OR loc.id               = ANY(sf.location_ids)
        OR loc.city_id          = ANY(sf.location_ids)
        OR loc.community_id     = ANY(sf.location_ids)
        OR loc.sub_community_id = ANY(sf.location_ids)
        OR loc.cluster_id       = ANY(sf.location_ids)
        OR loc.building_id      = ANY(sf.location_ids)
        OR loc.country_id       = ANY(sf.location_ids)
      )
      AND (
        cardinality(sf.developer_ids) = 0
        OR dev.dev_location_ids IS NULL
        OR loc.id               = ANY(dev.dev_location_ids)
        OR loc.community_id     = ANY(dev.dev_location_ids)
        OR loc.sub_community_id = ANY(dev.dev_location_ids)
        OR loc.cluster_id       = ANY(dev.dev_location_ids)
        OR loc.building_id      = ANY(dev.dev_location_ids)
      )
      AND (sf.category_id  IS NULL OR p.category_id  = sf.category_id)
      AND (sf.unit_type_id IS NULL OR p.unit_type_id = sf.unit_type_id)
      AND (cardinality(sf.sub_type_ids)     = 0 OR p.sub_type_id      = ANY(sf.sub_type_ids))
      AND (cardinality(sf.bedrooms)         = 0 OR p.bedrooms         = ANY(sf.bedrooms))
      AND (cardinality(sf.bathrooms)        = 0 OR p.bathrooms        = ANY(sf.bathrooms))
      AND (sf.is_maid       IS NULL OR p.is_maid       = sf.is_maid)
      AND (sf.is_hotel_pool IS NULL OR p.is_hotel_pool = sf.is_hotel_pool)
      AND (sf.furnished     IS NULL OR p.furnished     = sf.furnished)
      AND (cardinality(sf.floor_level_ids)    = 0 OR p.floor_level_id    = ANY(sf.floor_level_ids))
      AND (cardinality(sf.floors_in_unit_ids) = 0 OR p.floors_in_unit_id = ANY(sf.floors_in_unit_ids))
      AND (sf.area_min IS NULL OR p.area_sqft >= sf.area_min)
      AND (sf.area_max IS NULL OR p.area_sqft <= sf.area_max)
      AND (sf.plot_min IS NULL OR p.plot_sqft >= sf.plot_min)
      AND (sf.plot_max IS NULL OR p.plot_sqft <= sf.plot_max)
      AND (sf.price_min IS NULL OR p.price >= sf.price_min)
      AND (sf.price_max IS NULL OR p.price <= sf.price_max)
      AND (sf.price_period IS NULL OR p.price_period = sf.price_period)
      AND (cardinality(sf.view_ids)      = 0 OR p.view_ids      @> sf.view_ids)
      AND (cardinality(sf.position_ids)  = 0 OR p.position_ids  @> sf.position_ids)
      AND (cardinality(sf.amenity_ids)   = 0 OR p.amenity_ids   @> sf.amenity_ids)
      AND (sf.listing_type IS NULL OR p.listing_type = sf.listing_type)
      AND (cardinality(sf.cheques)          = 0 OR p.cheques          = ANY(sf.cheques))
      AND (sf.is_study    IS NULL OR p.is_study    = sf.is_study)
      AND (sf.is_reduced  IS NULL OR p.is_reduced  = sf.is_reduced)
      AND (sf.is_below_op IS NULL OR p.is_below_op = sf.is_below_op)
      AND (sf.is_vastu    IS NULL OR p.is_vastu    = sf.is_vastu)
      AND (cardinality(sf.occupancy_status) = 0 OR p.occupancy_status = ANY(sf.occupancy_status))
      AND (sf.handover IS NULL OR p.handover = sf.handover)
      AND (cardinality(sf.completion_years) = 0 OR p.completion_year = ANY(sf.completion_years))
      AND (cardinality(sf.completion_q)     = 0 OR p.completion_q    = ANY(sf.completion_q))
  );
$$;

GRANT EXECUTE ON FUNCTION public.property_matches_filter(uuid, uuid) TO authenticated, service_role;
