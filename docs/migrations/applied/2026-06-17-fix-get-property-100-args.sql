-- ============================================================================
-- Миграция: фикс get_property — ошибка 54023 «cannot pass more than 100 arguments»
--
-- ПРИЧИНА (API-10): после оверхола карточки (2026-06-15/16) первый
--   jsonb_build_object(...) в get_property собирает 62 пары ключ/значение
--   = 124 аргумента в ОДНОМ вызове. Postgres жёстко ограничивает вызов функции
--   100 аргументами → RPC падает с 500 (код 54023). Карточка на проде молча
--   жила на фолбэке из ленты. Воспроизведено через PostgREST 2026-06-17.
--
-- РЕШЕНИЕ: разбить первый jsonb_build_object (поля properties) на ДВА вызова
--   по 31 паре (62 арг каждый), склеить оператором `||`. Тот же приём уже
--   применён в get_feed (миграция 2026-06-17-get-feed-agent-and-has-photos).
--   Вывод функции БАЙТ-В-БАЙТ идентичен — правка чисто структурная, семантика
--   (поля, JOIN, проверка видимости, agent{}, обработка not-found) НЕ изменена.
--
-- ИЗМЕНЕНИЯ ДАННЫХ: нет. Только CREATE OR REPLACE FUNCTION. ОБРАТИМО:
--   повторный CREATE OR REPLACE прежней версией.
-- Применять под ролью supabase_admin (не postgres — иначе must be owner).
-- ============================================================================

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
    -- Поля properties, часть 1/2 (31 пара — держим вызов < 100 аргументов)
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
      -- Локация
      'location_name',       l.name,
      'location_level',      l.level,
      'location_full_path',  TRIM(BOTH ' > ' FROM CONCAT_WS(' > ',
        NULLIF(loc_city.name,         ''),
        NULLIF(loc_comm.name,         ''),
        NULLIF(loc_sub.name,          ''),
        NULLIF(loc_cluster.name,      ''),
        NULLIF(loc_building.name,     ''),
        CASE WHEN l.level = 'checkpoint' THEN l.name ELSE NULL END
      )),

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
        END
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
$function$;
