-- Баг B (финальный фикс): бейдж сохранённого фильтра = число объектов с «точкой-непросмотр»
-- в ленте. Возвращаем unseen_count к ГЛОБАЛЬНОМУ сигналу user_seen_listings.shown_at —
-- той же формуле, что get_feed.is_unseen (см. applied/2026-06-22-get-feed-is-unseen.sql).
-- Семантика: «видел объект где угодно в ленте → он не считается непросмотренным ни в одном фильтре».
-- Сознательно отменяет per-filter-модель (applied/2026-06-22-get-saved-filters-per-filter-seen.sql
-- + 2026-06-23-get-saved-filters-renotify.sql): user_filter_seen писался слишком узко (только при
-- открытом фильтре + 5с), объекты из общей ленты в бейдже не гасли → накопление +3/+4.
--
-- Staleness-proof: заменяем ТОЛЬКО значение ключа 'unseen_count' в jsonb_build_object,
-- якорясь между 'unseen_count', и следующим ключом 'notification_type' (порядок ключей стабилен,
-- см. docs/database.md get_saved_filters; тот же якорь, что в applied/2026-06-23-...-renotify.sql).
-- Применять под supabase_admin. Идемпотентно.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_expr text :=
       '(SELECT count(DISTINCT fm.property_id) FROM filter_matches fm '
    || 'JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' '
    || 'WHERE fm.filter_id = sf.id '
    || 'AND GREATEST(p.created_at, p.updated_at) > COALESCE('
    || '(SELECT usl.shown_at FROM user_seen_listings usl '
    || 'WHERE usl.property_id = fm.property_id AND usl.user_id = sf.user_id), '
    || '''epoch''::timestamptz))';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_saved_filters' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- Идемпотентность: новая версия содержит уникальную подстроку нашего under-query.
  IF position('usl.property_id = fm.property_id' in v_def) > 0 THEN
    RAISE NOTICE 'get_saved_filters unseen→global-shown: уже применено — пропускаю';
    RETURN;
  END IF;

  -- Якорь конца выражения unseen_count — литерал 'notification_type' должен быть РОВНО один,
  -- иначе замена неоднозначна. Падаем явно, а не портим функцию.
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
  RAISE NOTICE 'get_saved_filters.unseen_count: переведён на глобальный shown_at (как get_feed.is_unseen)';
END
$migrate$;
