-- Баг B: unseen_count перестаёт зависеть от глобального shown_at. Теперь = активные
-- матчи фильтра, которых юзер ещё НЕ видел в этом фильтре (NOT EXISTS user_filter_seen).
-- Staleness-proof: заменяем ТОЛЬКО значение ключа 'unseen_count' в jsonb_build_object,
-- якорясь между 'unseen_count', и следующим ключом 'notification_type'. Якорь надёжен:
-- порядок ключей в функции стабилен (см. docs/database.md get_saved_filters).
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_expr text := '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
              || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
              || 'WHERE fm.filter_id = sf.id AND NOT EXISTS ('
              || 'SELECT 1 FROM user_filter_seen ufs WHERE ufs.user_id = sf.user_id '
              || 'AND ufs.filter_id = sf.id AND ufs.property_id = fm.property_id))';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  IF position('user_filter_seen' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters per-filter-seen: уже применено — пропускаю';
    RETURN;
  END IF;

  -- I-2: убеждаемся, что литерал 'notification_type' в теле ровно один (якорь конца
  -- выражения unseen_count). Именно единственность вхождения делает замену безопасной:
  -- при ровно одном 'notification_type' greedy и non-greedy дают один результат.
  -- Падаем явно, а не портим функцию.
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
  RAISE NOTICE 'get_saved_filters.unseen_count: переведён на user_filter_seen';
END
$migrate$;
