-- Стадия 1: добавить is_unseen в jsonb-вывод каждого объекта get_feed (Прил. D).
-- is_unseen = объект опубликован/актуализирован позже, чем юзер видел его в ленте (shown_at).
-- ⚠️ Перед применением: получить тело и ПОДТВЕРДИТЬ (а) алиас таблицы properties в SELECT,
--    (б) выражение текущего юзера, (в) якорь-ключ для вставки:
--    SELECT pg_get_functiondef('public.get_feed(<полная сигнатура>)'::regprocedure);
--    (полная сигнатура — в docs/database.md, раздел get_feed).
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef(
    'public.get_feed(text, uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, integer[], integer[], boolean, boolean, text, uuid[], uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, text, text[], text[], text[], text, text[], text, integer[], text[], text, numeric, numeric, uuid[], text, integer, integer, integer[], boolean, boolean, boolean, boolean)'::regprocedure
  );

  -- Якорь: существующий стабильный ключ 'community_name'. ПОДТВЕРДИТЬ его наличие в v_def
  -- и при необходимости заменить на реально присутствующий ключ + верный алиас properties (ниже 'p').
  v_new := regexp_replace(
    v_def,
    E'(''community_name''\\s*,[^\\n]*\\n)',
    E'\\1      ''is_unseen'', (GREATEST(p.created_at, p.updated_at) > COALESCE((SELECT usl.shown_at FROM public.user_seen_listings usl WHERE usl.property_id = p.id AND usl.user_id = COALESCE(p_user_id, auth.uid())), ''epoch''::timestamptz)),\n',
    ''
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed patch: якорь не найден — сверить ключ/алиас с pg_get_functiondef';
  END IF;

  EXECUTE v_new;
END $$;
