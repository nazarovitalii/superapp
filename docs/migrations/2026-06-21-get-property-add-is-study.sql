-- ============================================================================
-- Миграция: get_property отдаёт is_study (для «N + study» в деталке)
--
-- Колонка properties.is_study уже существует и пишется формой; в jsonb-вывод
-- get_property её не добавляли. Точечный staleness-proof патч: добавляем ключ
-- 'is_study' сразу после 'is_maid'. Якорь — на запятую (НЕ \b: в Postgres ARE
-- \b = backspace). Guard по факту замены + идемпотентность по position().
-- ОБРАТИМО: вернуть прежний get_property (см. ОТКАТ).
-- ПРИМЕНЯТЬ под ролью supabase_admin (не postgres — иначе must be owner).
-- ============================================================================

DO $$
DECLARE
  def text;
  new_def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid, uuid)'::regprocedure);

  IF position('''is_study''' in def) > 0 THEN
    RAISE NOTICE 'is_study уже есть в get_property — пропуск';
    RETURN;
  END IF;

  new_def := regexp_replace(
    def,
    '(''is_maid''\s*,\s*p\.is_maid\s*,)',
    E'\\1\n      ''is_study'',            p.is_study,',
    'g'
  );

  IF new_def = def THEN
    RAISE NOTICE 'якорь is_maid не найден — формат изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения):
--   SELECT (get_property('<property_id>'::uuid, '<owner_id>'::uuid)) ? 'is_study';  -- t
--
-- ОТКАТ:
--   -- вернуть прежний get_property из applied/2026-06-21-floors-in-unit-uuid.sql
--   -- (или из applied/2026-06-18-get-property-layer2b.sql + последующие патчи)
-- ============================================================================
