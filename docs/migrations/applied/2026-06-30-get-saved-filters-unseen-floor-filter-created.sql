-- Bug 3: новый фильтр сразу показывает кружок-счётчик на ранее существовавшие объекты.
-- Причина: миграция applied/2026-06-30-get-saved-filters-unseen-global-shown.sql выкинула
-- floor по sf.created_at — счётчик считал «непросмотренными» все уже существовавшие совпадения.
-- Фикс: вернуть floor «объект новее самого фильтра», сохранив глобальный shown_at-сигнал:
--   unseen ⟺ GREATEST(p.created_at, p.updated_at) > GREATEST(sf.created_at, COALESCE(shown_at,'epoch'))
-- Та же формула, что будет в get_feed.is_unseen (фильтр-ветка) и get_bell после парных миграций —
-- единое определение «непросмотрено» на всех трёх поверхностях.
--
-- Staleness-proof: заменяем ТОЛЬКО значение ключа 'unseen_count' в jsonb_build_object,
-- якорясь между 'unseen_count', и следующим ключом 'notification_type' (тот же якорь, что в
-- applied/2026-06-30-get-saved-filters-unseen-global-shown.sql). Применять под supabase_admin. Идемпотентно.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_expr text :=
       '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
    || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
    || 'WHERE fm.filter_id = sf.id '
    || 'AND GREATEST(p.created_at, p.updated_at) > GREATEST(sf.created_at, COALESCE('
    || '(SELECT usl.shown_at FROM user_seen_listings usl '
    || 'WHERE usl.property_id = fm.property_id AND usl.user_id = sf.user_id), '
    || '''epoch''::timestamptz)))';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- Идемпотентность: новая версия содержит floor GREATEST(sf.created_at, COALESCE(...usl...)).
  IF position('GREATEST(sf.created_at, COALESCE((SELECT usl.shown_at' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters unseen floor: уже применено — пропускаю';
    RETURN;
  END IF;

  -- Якорь конца выражения unseen_count — литерал 'notification_type' должен быть РОВНО один.
  IF (length(v_def) - length(replace(v_def, '''notification_type''', '')))
       / length('''notification_type''') <> 1 THEN
    RAISE EXCEPTION 'get_saved_filters: ''notification_type'' встречается не один раз — якорь неоднозначен, патч прерван';
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
  RAISE NOTICE 'get_saved_filters.unseen_count: добавлен floor sf.created_at (Bug 3)';
END
$migrate$;
