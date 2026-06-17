-- ============================================================================
-- Слой 2b (M-2b): get_property — обогащение для карточки
-- ----------------------------------------------------------------------------
-- ЧТО: CREATE OR REPLACE get_property — добавлено 4 вещи, остальное БЕЗ изменений:
--   1) agent.active_listings_count — кол-во активных объектов владельца (скаляр-подзапрос)
--   2) public_location_path — путь по бегунку приватности (public_location_id), как
--      location_full_path, но по предкам public-локации (доп. JOIN'ы pl_*)
--   3) is_vastu — флаг Vastu (карточка: «Bedrooms: N + maid + vastu»)
--   4) project — объект из location_developers по location_id (leaf), один ряд или NULL:
--      сырые поля (project_group_name, project_name, is_building, developer_name,
--      project_status, built_year, completion_q, completion_year). Маппинг
--      Off-Plan/Ready и Building/Cluster/Project — на клиенте. developer_name уже
--      денормализован в location_developers — JOIN developers НЕ нужен.
-- ЗАЧЕМ: блоки карточки Agent(active listings)/Location(slider)/Tech(+vastu)/Project.
-- ОБРАТИМО: да (повторный CREATE OR REPLACE предыдущей версией).
-- БЕЗОПАСНО: контракт прежних полей байт-в-байт сохранён, только добавлены поля.
--   Лимит 100 арг соблюдён (объекты по ≤31 паре + ||). Функция заменяется ЦЕЛИКОМ.
--   ⚠️ Перед применением СВЕРИТЬ с живой функцией (pg_get_functiondef) — тело ниже
--      взято из docs/database.md (после фикса 100-арг). Если прод разошёлся —
--      добавить только 4 пункта выше, не накатывать остальное.
--   project: скаляр-подзапрос с LIMIT 1 — защита от дублей; NULL когда строки нет
--      (по др. районам location_developers пока пусто — блок Project не покажется, это норма).
-- РОЛЬ: применять под supabase_admin (не postgres).
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

  -- ШАГ 1: сеть юзера
  SELECT array_cat(
    COALESCE(friend_ids,    ARRAY[]::uuid[]),
    COALESCE(colleague_ids, ARRAY[]::uuid[])
  ) INTO v_network_ids
  FROM user_network
  WHERE user_id = v_current_user_id;

  IF v_network_ids IS NULL THEN
    v_network_ids := ARRAY[]::uuid[];
  END IF;

  -- ШАГ 1б: план юзера
  SELECT plan INTO v_plan
  FROM user_context
  WHERE user_id = v_current_user_id;

  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- ШАГ 2: объект + проверка доступа + JOIN-поля
  SELECT (
    -- properties, часть 1/2 (31 пара)
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
    -- properties, часть 2/2 (31 пара) + is_vastu
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
      'is_vastu',            p.is_vastu,                                    -- NEW (2b): «+ vastu» в карточке
      -- Локация (полный путь)
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
      -- NEW (2b): путь по бегунку приватности (public_location_id), один уровень
      'public_location_path', CASE WHEN p.public_location_id IS NULL THEN NULL
        ELSE TRIM(BOTH ' > ' FROM CONCAT_WS(' > ',
          NULLIF(pl_city.name,     ''),
          NULLIF(pl_comm.name,     ''),
          NULLIF(pl_sub.name,      ''),
          NULLIF(pl_cluster.name,  ''),
          NULLIF(pl_building.name, ''),
          CASE WHEN pl.level = 'checkpoint' THEN pl.name ELSE NULL END
        )) END,
      -- NEW (2b): Project из location_developers по leaf-локации (один ряд или NULL)
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
      -- Девелопер (справочник)
      'developer_name_ref',  d.name,
      'developer_logo_url',  d.logo_url,
      -- Бейдж владельца
      'owner_badge_level',   ab.badge_level,
      -- Флаг сети / свой объект
      'is_network',          (p.owner_id = ANY(v_network_ids)),
      'is_owner',            (p.owner_id = v_current_user_id),
      -- Данные агента (владельца)
      'agent',               jsonb_build_object(
        'id',           u.id,
        'full_name',    u.full_name,
        'tg_username',  u.tg_username,
        'whatsapp_phone', CASE
          WHEN p.owner_id = v_current_user_id    THEN u.whatsapp_phone
          WHEN v_plan = 'pro'                     THEN u.whatsapp_phone
          WHEN p.owner_id = ANY(v_network_ids)    THEN u.whatsapp_phone
          ELSE NULL
        END,
        'photo_url',    us.photo_url,
        'about',        us.about,
        'languages',    us.languages,
        'badge_level',  ab.badge_level,
        'agency_name',  ui.agency_name,
        'emirate_name', ui.emirate_name,
        'broker_license', CASE
          WHEN p.owner_id = v_current_user_id    THEN ui.broker_license
          WHEN v_plan = 'pro'                     THEN ui.broker_license
          WHEN p.owner_id = ANY(v_network_ids)    THEN ui.broker_license
          ELSE NULL
        END,
        -- NEW (2b): активных листингов у владельца
        'active_listings_count', (
          SELECT COUNT(*) FROM properties pp
          WHERE pp.owner_id = p.owner_id AND pp.status = 'active'
        )
      )
    )
  ) INTO v_result
  FROM properties p
  LEFT JOIN locations l           ON l.id  = p.location_id
  LEFT JOIN locations loc_city    ON loc_city.id    = l.city_id
  LEFT JOIN locations loc_comm    ON loc_comm.id    = l.community_id
  LEFT JOIN locations loc_sub     ON loc_sub.id     = l.sub_community_id
  LEFT JOIN locations loc_cluster ON loc_cluster.id = l.cluster_id
  LEFT JOIN locations loc_building ON loc_building.id = l.building_id
  -- NEW (2b): предки public-локации (для slider-адреса)
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
    AND (
      p.owner_id = v_current_user_id
      OR (p.status = 'active' AND p.visibility = 'public')
      OR (p.status = 'active' AND p.visibility = 'network'
          AND p.owner_id = ANY(v_network_ids))
    );

  -- ШАГ 3: не найдено / нет доступа
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'property not found or access denied',
      'property_id', p_property_id
    );
  END IF;

  RETURN v_result;

END;
$function$;
