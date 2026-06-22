-- ============================================================================
-- 2026-06-22-realtime-match-pipeline-009-012.sql
-- БАНДЛ применения миграций матчинга realtime (применяет владелец БД = superApp-чат).
--
-- Канонический источник 4 файлов — realtime/migrations/ (НЕ дублировать там правки;
-- это point-in-time артефакт того, что superApp-чат применил к прод-БД 2026-06-22
-- с явного согласия создателя). Порядок и атомарность — по handoff realtime
-- (realtime/docs/handoff-superapp-match-triggers.md): одной транзакцией, чтобы свап
-- enqueue-триггеров прошёл без окна без notify и без момента двойного enqueue.
--
-- Состав:
--   009 (product) — enqueue-триггеры на properties/saved_filters; те же имена, что у
--                   ранее применённой версии superApp → CREATE OR REPLACE атомарно
--                   заменяет её, убирая inline pg_notify (централизован в 010).
--                   ⚠️ Это ЗАМЕЩАЕТ docs/migrations/applied/2026-06-22-match-jobs-triggers.sql
--   010           — notify на match_jobs (FOR EACH STATEMENT, пустой payload → folding).
--   011           — lockdown match_jobs/dlq (RLS + REVOKE anon/authenticated + GRANT service_role).
--   012 (product) — property_matches_filter: убран путь locations.developer_ids (денорм),
--                   только location_developers → предикат 1:1 с get_feed.
--
-- Ревью superApp перед применением: search_path=public безопасен (gen_random_uuid в
-- pg_catalog); RLS не блокирует enqueue (supabase_admin = owner+superuser+bypassrls).
-- Откат: парные .down в realtime/migrations/, обратный порядок 012→011→010→009.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 009_match_triggers.up.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 009 — триггеры-источники очереди match_jobs (на ПРОДУКТОВЫХ таблицах superApp).
-- Замыкают входной контур матчера: properties/saved_filters → match_jobs.
--
-- ⚠️ Имена объектов = РОВНО как у superApp (они применили свою версию триггеров в prod раньше).
-- Эта миграция — канонический источник правды: DROP TRIGGER IF EXISTS + CREATE OR REPLACE FUNCTION
-- тех же имён АТОМАРНО заменяют их версию (их функции имели inline pg_notify — здесь notify убран,
-- он централизован в миграции 010 на самой match_jobs; двойного notify не будет).
-- Рекомендация по применению: 009 + 010 + 011 одной транзакцией (DDL триггеров транзакционно) —
-- тогда нет даже мгновения без notify при свапе.
--
-- Ownership: триггеры на таблицах superApp (properties, saved_filters) — применяет владелец БД.
--
-- SECURITY DEFINER на enqueue-функциях — НАМЕРЕННО: вставка в match_jobs должна пройти НЕЗАВИСИМО
-- от роли клиента (форма/модерация под anon/authenticated). Функции идут как supabase_admin (owner) —
-- мимо грантов и RLS (см. lockdown 011). Иначе тихий отказ INSERT = мёртвый матчинг.
--
-- Покрытие событий (сверено с superApp 2026-06-22):
--   • INSERT status='active'            → new_listing (агентский листинг, вставленный сразу активным)
--   • UPDATE status → active            → new_listing (pending_review→active = ОСНОВНОЙ путь публикации
--                                          после модерации; archived/expired→active = реактивация)
--   • UPDATE price, упала у активного   → price_drop (с гардом на ту же валюту/период)
--   • INSERT saved_filters deleted_at=∅ → filter_backfill
-- v1-граница (ОСОЗНАННО): правка существующего фильтра (UPDATE saved_filters) НЕ перематчивает —
--   корректный re-match требует инвалидации устаревших filter_matches (фича v2, не триггер). У superApp
--   серверного RPC правки критериев фильтра пока нет (save_filter = чистый INSERT), так что это безопасно.
-- ⚠️ На будущее: массовая миграция по properties (bulk price/status) выстрелит очередью построчно —
--   оборачивать такие операции в SET session_replication_role = replica (или DISABLE TRIGGER) на время.

-- Новый листинг (вставлен сразу активным) → new_listing.
CREATE OR REPLACE FUNCTION public.trg_property_insert_to_match_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO match_jobs (kind, match_type, ref_id)
    VALUES ('listing_new', 'new_listing', NEW.id);
  END IF;
  RETURN NULL;  -- AFTER-триггер: возвращаемое значение игнорируется.
END;
$$;

DROP TRIGGER IF EXISTS properties_insert_match ON properties;
CREATE TRIGGER properties_insert_match
  AFTER INSERT ON properties
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_property_insert_to_match_jobs();

-- Активация листинга (любой не-active → active): публикация-после-модерации ИЛИ реактивация → new_listing.
-- Дизайн заточен под это: writeMatches делает ON CONFLICT DO UPDATE matched_at=now(), поэтому уже
-- виденная пара (filter,property) снова становится «непросмотренной» (MAX(matched_at) > shown_at).
-- match_type='new_listing' (НЕ price_drop: цена не падала).
CREATE OR REPLACE FUNCTION public.trg_property_activate_to_match_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO match_jobs (kind, match_type, ref_id)
  VALUES ('listing_new', 'new_listing', NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS properties_activate_match ON properties;
CREATE TRIGGER properties_activate_match
  AFTER UPDATE OF status ON properties
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
  EXECUTE FUNCTION public.trg_property_activate_to_match_jobs();

-- Падение цены активного листинга → price_drop.
-- Гард в WHEN (рекомендация superApp): только при той же валюте и том же периоде — иначе смена
-- price_currency (AED→USD) или price_period (год→месяц) даст численное «падение» без реального снижения.
CREATE OR REPLACE FUNCTION public.trg_property_price_drop_to_match_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO match_jobs (kind, match_type, ref_id)
  VALUES ('listing_changed', 'price_drop', NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS properties_price_drop_match ON properties;
CREATE TRIGGER properties_price_drop_match
  AFTER UPDATE OF price ON properties
  FOR EACH ROW
  WHEN (NEW.status = 'active'
        AND OLD.price IS NOT NULL AND NEW.price IS NOT NULL
        AND NEW.price < OLD.price
        AND NEW.price_currency = OLD.price_currency
        AND NEW.price_period IS NOT DISTINCT FROM OLD.price_period)
  EXECUTE FUNCTION public.trg_property_price_drop_to_match_jobs();

-- Новый сохранённый фильтр → filter_backfill (ref_id = filter_id; матч против существующих объектов).
CREATE OR REPLACE FUNCTION public.trg_saved_filter_insert_to_match_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    INSERT INTO match_jobs (kind, match_type, ref_id)
    VALUES ('filter_backfill', 'new_listing', NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS saved_filters_insert_match ON saved_filters;
CREATE TRIGGER saved_filters_insert_match
  AFTER INSERT ON saved_filters
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_saved_filter_insert_to_match_jobs();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 010_match_jobs_notify.up.sql                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 010 — нотификация матчера: AFTER INSERT ON match_jobs → pg_notify('match_jobs').
-- Активирует LISTEN-путь матчера (src/matcher/worker.start.js), который до сих пор работал ТОЛЬКО
-- на poll (MATCHER_POLL_MS ≈ 2с). С этим триггером job обрабатывается субсекундно, poll остаётся
-- страховкой на случай пропущенного NOTIFY.
--
-- Таблица match_jobs — realtime'овская (создана миграцией 004), поэтому триггер живёт в корне
-- migrations/, а не в product/ (там — триггеры на таблицах superApp, миграция 009).
--
-- Пустой payload '' — НАМЕРЕННО: Postgres схлопывает идентичные (канал+payload) NOTIFY в рамках
-- одной транзакции в одно событие. FOR EACH STATEMENT → один вызов на INSERT-стейтмент (а не на строку):
-- массовый бэкфилл = один wakeup, матчер дальше batch-claim'ит. Полезной нагрузки не нужно —
-- LISTEN-хендлер игнорирует payload и просто дёргает processOnce().
CREATE OR REPLACE FUNCTION notify_match_jobs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('match_jobs', '');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS match_jobs_notify ON match_jobs;
CREATE TRIGGER match_jobs_notify
  AFTER INSERT ON match_jobs
  FOR EACH STATEMENT
  EXECUTE FUNCTION notify_match_jobs();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 011_match_jobs_lockdown.up.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 011 — закрыть match_jobs / match_jobs_dlq от публичного API (PostgREST).
-- Находка ревью superApp (2026-06-22): RLS выключен + anon/authenticated имеют INSERT/UPDATE/DELETE/
-- TRUNCATE через PostgREST → любой залогиненный клиент мог флудить или чистить очередь матчинга.
--
-- match_jobs / match_jobs_dlq — внутренняя durable-очередь realtime (миграция 004). Доступ через
-- PostgREST не нужен НИКОМУ из клиентских ролей:
--   • realtime-сервисы (matcher) ходят НАПРЯМУЮ по DATABASE_URL (service_role/owner) — мимо PostgREST и RLS;
--   • enqueue-триггеры 009 — SECURITY DEFINER (права владельца), вставляют независимо от грантов клиента;
--   • notify-триггер 010 шлёт лишь pg_notify (прав на таблицу не требует).
--
-- Defense-in-depth, два слоя:
--   1) REVOKE прав у PUBLIC/anon/authenticated — закрывает PostgREST уже сейчас.
--   2) ENABLE RLS без политик — deny-all для обычных ролей даже если грант вернут случайно.
--      service_role и owner имеют BYPASSRLS, поэтому сервисы и SECURITY DEFINER-триггеры не затронуты.
--
-- Переносимость: роли anon/authenticated/service_role существуют только в Supabase. В обычном Postgres
-- (локальные тесты, CI) их нет — поэтому грант-операции по ним обёрнуты в проверку pg_roles.
-- RLS и REVOKE PUBLIC безопасны везде (PUBLIC есть всегда).

ALTER TABLE match_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_jobs_dlq ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE match_jobs     FROM PUBLIC;
REVOKE ALL ON TABLE match_jobs_dlq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE match_jobs, match_jobs_dlq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE match_jobs, match_jobs_dlq FROM authenticated;
  END IF;
  -- Явный доступ системной роли (страховка: сервисы могут ходить под service_role).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE match_jobs, match_jobs_dlq TO service_role;
  END IF;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 012_dev_resolve_location_developers.up.sql                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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
      (sf.filters->>'category')::uuid                         AS category_id,
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
