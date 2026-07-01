-- LF-3: get_feed фильтр по застройщику не работает.
-- Причина: в подзапросе для locations.developer_id — такой колонки нет; есть developer_ids (array).
-- Фикс: WHERE developer_id = ANY(v_developer_ids)
--      → WHERE developer_ids && v_developer_ids  (array overlap)
-- Staleness-proof: pg_get_functiondef + regexp_replace по уникальному якорю.
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

  -- Идемпотентность: якоря нет → патч уже применён.
  IF NOT (v_def ~ 'FROM locations\s+WHERE developer_id = ANY\(v_developer_ids\)') THEN
    RAISE NOTICE 'get_feed: developer_id в locations уже исправлен — пропускаю';
    RETURN;
  END IF;

  -- Заменяем ТОЛЬКО подзапрос FROM locations (location_developers.developer_id корректен и не затрагивается).
  v_new := regexp_replace(
    v_def,
    '(FROM locations\s+WHERE )developer_id = ANY\(v_developer_ids\)',
    '\1developer_ids && v_developer_ids',
    'g'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed: regexp не нашёл якорь — тело изменилось, патч прерван';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed: исправлен фильтр по застройщику (locations.developer_id → developer_ids && v_developer_ids)';
END
$migrate$;
