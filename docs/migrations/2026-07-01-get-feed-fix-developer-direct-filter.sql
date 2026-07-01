-- LF-3b: get_feed — фильтр по застройщику пропускает объекты без явного застройщика.
-- Причина: фильтр проверяет иерархию locations (community/cluster/building ANY(v_developer_location_ids)).
-- Если застройщик привязан к целому кластеру через location_developers, все объекты кластера проходят,
-- даже если properties.developer_id = NULL.
-- Фикс: заменяем location-based проверку на прямую — p.developer_id = ANY(v_developer_ids).
-- Семантика: показывать объекты, у которых застройщик явно указан в поле объекта.
-- Staleness-proof: якорь — уникальный блок v_developer_location_ids IS NULL.
-- Идемпотентно. Применять под supabase_admin.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_feed' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- Идемпотентность: уже исправлено если нет location-based developer block
  IF position('v_developer_location_ids IS NULL' in v_def) = 0 THEN
    RAISE NOTICE 'get_feed: developer filter уже на p.developer_id — пропускаю';
    RETURN;
  END IF;

  -- Заменяем AND (v_developer_location_ids IS NULL OR loc.X = ANY(...) ...) →
  --           AND (v_developer_ids IS NULL OR p.developer_id = ANY(v_developer_ids))
  v_new := regexp_replace(
    v_def,
    'AND\s*\(\s*v_developer_location_ids IS NULL(\s*OR\s+loc\.[a-z_]+\s*=\s*ANY\s*\(\s*v_developer_location_ids\s*\))+\s*\)',
    E'AND (\n            v_developer_ids IS NULL OR p.developer_id = ANY(v_developer_ids)\n          )',
    'g'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed: якорь v_developer_location_ids не найден — тело изменилось, патч прерван';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed: developer filter заменён location-based → p.developer_id = ANY(v_developer_ids)';
END $migrate$;
