-- ============================================================================
-- Миграция: search_locations — тир «совпадение по целому слову» (релевантность)
--
-- ПРОБЛЕМА: при запросе «field» «The Field» (cluster, score 60+3=63) вытеснялся
--   из топ-8 под-комьюнити вроде «Brookfield»/«Whitefield» (60+4=64), где «field» —
--   лишь хвост слова. Скоринг награждал уровень, а не качество совпадения.
--
-- ФИКС: между prefix(80) и substring(60) добавляем тир 70 — запрос совпал с
--   ЦЕЛЫМ СЛОВОМ в названии (после пробела, в конце или в середине). LIKE по
--   пробелам (НЕ regex на пользовательском вводе → нет проблем экранирования).
--   «The Field» → '% field' → 70+3=73 > «Brookfield» 60+4=64. Правится в ОБОИХ
--   местах CASE (item.score и ORDER BY) — флаг 'g'.
--
-- staleness-proof: патчим живое тело pg_get_functiondef; guard на не-совпадение
--   (RAISE NOTICE) и идемпотентность (position 'THEN 70').
-- ОБРАТИМО: вернуть прежнее тело search_locations.
-- ПРИМЕНЯТЬ под ролью supabase_admin (не postgres — иначе must be owner).
-- ============================================================================

DO $$
DECLARE
  def text;
  new_def text;
BEGIN
  def := pg_get_functiondef(
    'public.search_locations(text, text, uuid, text, integer)'::regprocedure
  );

  IF position('THEN 70' in def) > 0 THEN
    RAISE NOTICE 'тир 70 уже есть в search_locations — пропуск';
    RETURN;
  END IF;

  new_def := regexp_replace(
    def,
    '(\n[ \t]*)WHEN lower\(l\.name\) LIKE v_query_lower \|\| ''%'' THEN 80',
    '\1WHEN lower(l.name) LIKE v_query_lower || ''%'' THEN 80'
    || '\1WHEN lower(l.name) LIKE ''% '' || v_query_lower'
    || ' OR lower(l.name) LIKE ''% '' || v_query_lower || '' %'' THEN 70',
    'g'
  );

  IF new_def = def THEN
    RAISE NOTICE 'якорь "THEN 80" не найден — формат search_locations изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения):
--   SELECT jsonb_path_query_array(
--            search_locations('search','field',NULL,NULL,8),
--            '$.results[*].name');
--   -- «The Field» должно быть в топе (рядом с «Park Field»), а не вытеснено.
--
-- ОТКАТ: вернуть прежнее тело search_locations (без строки "THEN 70").
-- ============================================================================
