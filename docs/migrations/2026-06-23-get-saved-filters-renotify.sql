-- Re-notify по времени изменения объекта: unseen_count считает матчи, где объект изменён
-- (created/updated) ПОЗЖЕ создания фильтра И позже последнего просмотра в этом фильтре.
-- → новый фильтр стартует с 0 (старые объекты исключены); обновлённый позже объект снова +1.
-- Staleness-proof: заменяем ТОЛЬКО значение ключа 'unseen_count' (между 'unseen_count', и 'notification_type').
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_expr text :=
    '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
 || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
 || 'WHERE fm.filter_id = sf.id '
 || 'AND GREATEST(p.created_at, p.updated_at) > GREATEST(sf.created_at, '
 || 'COALESCE((SELECT ufs.seen_at FROM user_filter_seen ufs '
 || 'WHERE ufs.user_id = sf.user_id AND ufs.filter_id = sf.id AND ufs.property_id = fm.property_id), '
 || '''epoch''::timestamptz)))';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- идемпотентность: новая версия содержит GREATEST(p.created_at, p.updated_at)
  IF position('GREATEST(p.created_at, p.updated_at)' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters re-notify: уже применено — пропускаю';
    RETURN;
  END IF;

  -- guard единственности якоря конца выражения (PG ARE: при >1 'notification_type' замена захватит лишнее)
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
  RAISE NOTICE 'get_saved_filters.unseen_count: re-notify по updated_at применён';
END
$migrate$;
