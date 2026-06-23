-- My-фильтры не получают матчей → бейдж всегда 0. Оборачиваем текущую формулу
-- unseen_count в CASE по sf.filters->>'scope'. Staleness-proof: заменяем только
-- значение ключа 'unseen_count' (между 'unseen_count', и 'notification_type').
-- Базируется на формуле re-notify (GREATEST(p.created_at,p.updated_at)) — guard ниже
-- проверяет, что она присутствует, иначе прерывает (тело иное — не патчим вслепую).
-- Применять под supabase_admin, в транзакции. ОТКАТ: применить 2026-06-23-get-saved-filters-renotify.sql.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  -- значение unseen_count = 0 для scope='my', иначе re-notify формула (verbatim из renotify-миграции)
  v_expr text :=
    'CASE WHEN sf.filters->>''scope'' = ''my'' THEN 0 ELSE '
 || '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
 || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
 || 'WHERE fm.filter_id = sf.id '
 || 'AND GREATEST(p.created_at, p.updated_at) > GREATEST(sf.created_at, '
 || 'COALESCE((SELECT ufs.seen_at FROM user_filter_seen ufs '
 || 'WHERE ufs.user_id = sf.user_id AND ufs.filter_id = sf.id AND ufs.property_id = fm.property_id), '
 || '''epoch''::timestamptz))) END';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- идемпотентность: уже обёрнуто в CASE по scope
  IF position('sf.filters->>''scope''' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters my-scope-zero: уже применено — пропускаю';
    RETURN;
  END IF;

  -- guard базы: ожидаем формулу re-notify (иначе якорь/база иные — прерываем)
  IF position('GREATEST(p.created_at, p.updated_at)' in v_def) = 0 THEN
    RAISE EXCEPTION 'get_saved_filters: базовая re-notify формула не найдена — патч прерван';
  END IF;

  -- guard единственности якоря конца выражения
  IF (length(v_def) - length(replace(v_def, '''notification_type''', '')))
       / length('''notification_type''') <> 1 THEN
    RAISE EXCEPTION 'get_saved_filters: ''notification_type'' встречается не один раз — якорь неоднозначен';
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
  RAISE NOTICE 'get_saved_filters.unseen_count: my-scope → 0 применён';
END
$migrate$;
