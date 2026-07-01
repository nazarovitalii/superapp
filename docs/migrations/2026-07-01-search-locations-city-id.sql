-- ============================================================================
-- Миграция: search_locations (p_mode='search') — +поле city_id в результат
--
-- ЗАЧЕМ (LF-2): в автокомплите адресов ленты нужно пометить результат, если он
--   из ДРУГОГО эмирата, чем город юзера (user_context.city_id). Клиент читает
--   свой user_context.city_id (RLS context_select) и сравнивает по id — но для
--   этого результат поиска должен нести city_id. Сейчас есть только city_name.
--
-- ЧТО: в jsonb_build_object результата (search-ветка) рядом с 'city_name' добавить
--   'city_id' = l.city_id (FK локации на город; тот же, что get_feed сравнивает).
--   Возврат остаётся jsonb {results:[...]} — сигнатура НЕ меняется (CREATE OR REPLACE
--   не нужен, DROP не нужен; правим живое тело).
--
-- staleness-proof: патчим живое тело pg_get_functiondef + regexp; guard на
--   идемпотентность (position ''city_id'', l.city_id) и на несовпадение якоря.
-- ОБРАТИМО: убрать строку "'city_id', l.city_id," из тела search_locations.
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

  IF position('''city_id'', l.city_id' in def) > 0 THEN
    RAISE NOTICE 'city_id уже в search_locations — пропуск';
    RETURN;
  END IF;

  -- Якорь — строка результата поиска: '''city_name'', ci.name,'. Дописываем city_id
  -- сразу после неё. Первое вхождение (search-ветка); в info-ветке city_name нет.
  new_def := regexp_replace(
    def,
    '(''city_name'',\s*ci\.name,)',
    '\1' || chr(10) || '          ''city_id'', l.city_id,',
    ''  -- без 'g' → только первое (единственное) вхождение
  );

  IF new_def = def THEN
    RAISE NOTICE 'якорь ''city_name'', ci.name не найден — формат search_locations изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения):
--   SELECT jsonb_path_query_array(
--            search_locations('search','marina',NULL,NULL,3),
--            '$.results[*].city_id');
--   -- должны прийти НЕ-null uuid города для каждого результата.
--
-- ОТКАТ: pg_get_functiondef → regexp_replace убрать "'city_id', l.city_id," → EXECUTE.
-- ============================================================================
