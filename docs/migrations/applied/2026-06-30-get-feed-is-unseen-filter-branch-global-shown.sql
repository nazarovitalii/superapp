-- Bug 2: оранжевая точка «непросмотрено» в ленте сохранённого фильтра моргает 5с и возвращается
-- при каждом открытии фильтра, хотя кружок-бейдж гаснет.
-- Причина: get_feed.is_unseen в ветке p_filter_id IS NOT NULL читает per-filter сигнал
-- user_filter_seen.seen_at, в который после refactor 2026-06-30 НИКТО не пишет (писатель
-- markFilterSeen удалён; дуэлл-таймер пишет только глобальный user_seen_listings.shown_at).
-- → is_unseen в фильтре всегда true.
-- Фикс: фильтр-ветка читает тот же глобальный shown_at, что и кружок (Миграция 1) и дуэлл-писатель.
-- floor по sf.created_at сохраняется. Единое определение «непросмотрено» на всех поверхностях.
-- Общая ветка (p_filter_id IS NULL) НЕ трогается — она уже на глобальном shown_at.
--
-- Staleness-proof: заменяем РОВНО один подзапрос seen-сигнала в фильтр-ветке is_unseen
-- (уникальный якорь — обращение к user_filter_seen). Сигнатура не меняется → CREATE OR REPLACE
-- из pg_get_functiondef. Применять под supabase_admin. Идемпотентно.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_old_sub text :=
    '(SELECT ufs.seen_at FROM public.user_filter_seen ufs '
    || 'WHERE ufs.user_id = sf.user_id AND ufs.filter_id = sf.id AND ufs.property_id = p.id)';
  v_new_sub text :=
    '(SELECT usl.shown_at FROM public.user_seen_listings usl '
    || 'WHERE usl.property_id = p.id AND usl.user_id = v_current_user_id)';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_feed' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  -- Идемпотентность: user_filter_seen больше не упоминается в теле (фильтр-ветка переведена).
  IF position('user_filter_seen' in v_def) = 0 THEN
    RAISE NOTICE 'get_feed.is_unseen: user_filter_seen уже не используется — пропускаю';
    RETURN;
  END IF;

  -- Якорь должен встречаться РОВНО один раз (только в фильтр-ветке is_unseen).
  IF (length(v_def) - length(replace(v_def, v_old_sub, '')))
       / length(v_old_sub) <> 1 THEN
    RAISE EXCEPTION 'get_feed: подзапрос user_filter_seen встречается не один раз — якорь неоднозначен, патч прерван';
  END IF;

  v_new := replace(v_def, v_old_sub, v_new_sub);

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed: якорь user_filter_seen не найден дословно — тело изменилось, патч прерван';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed.is_unseen (фильтр-ветка): переведена на глобальный user_seen_listings.shown_at (Bug 2)';
END
$migrate$;
