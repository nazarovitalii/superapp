-- Стадия 3: get_saved_filters.unseen_count — LIVE COUNT вместо хранимого sf.unseen_count.
-- Формула (контракт realtime v5, Прил. A): сколько объектов фильтра, где последний матч свежее показа.
--   MAX(matched_at) на пару (filter,property) — из-за UNIQUE (filter_id,property_id,match_type) у пары
--   может быть 2 ряда (new_listing + price_drop), берём максимум. matched_at > shown_at(юзера) → непросмотрен.
-- ⚠️ Применять ПОСЛЕ filter_matches += matched_at. Требует, чтобы matcher проставлял matched_at.
-- Staleness-proof: патчим ТОЛЬКО значение ключа 'unseen_count' в jsonb-выводе (алиас saved_filters = sf).
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.get_saved_filters(uuid)'::regprocedure);
  v_new := regexp_replace(
    v_def,
    E'(''unseen_count''\\s*,\\s*)sf\\.unseen_count',
    E'\\1(SELECT count(*) FROM (SELECT fm.property_id, max(fm.matched_at) AS matched_at FROM filter_matches fm WHERE fm.filter_id = sf.id GROUP BY fm.property_id) m WHERE m.matched_at > COALESCE((SELECT usl.shown_at FROM user_seen_listings usl WHERE usl.property_id = m.property_id AND usl.user_id = sf.user_id), ''epoch''::timestamptz))',
    ''
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_saved_filters patch: якорь sf.unseen_count не найден — сверить тело';
  END IF;
  EXECUTE v_new;
END $$;
