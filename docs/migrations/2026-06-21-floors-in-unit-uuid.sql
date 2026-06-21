-- ============================================================================
-- Миграция: этажность дома text → UUID (floors_in_unit_id) + патч get_property
--
-- ПРИЧИНА: floors_in_unit хранится текстом ('G+1'); переводим на FK к
--   property_type_values(group_name='floors_in_unit_house') для консистентности
--   и будущих фильтров. Старую колонку floors_in_unit НЕ дропаем (откат).
--
-- get_property: заменяем ключ floors_in_unit → floors_in_unit_id и добавляем
--   is_reduced / is_below_op (для бейджей деталки). Патч staleness-proof:
--   читаем живое тело через pg_get_functiondef и правим regexp'ом.
-- ОБРАТИМО: см. блок ОТКАТ внизу.
-- ПРИМЕНЯТЬ под ролью supabase_admin (не postgres — иначе must be owner).
-- ============================================================================

-- 1) Новая колонка (FK) ------------------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS floors_in_unit_id uuid REFERENCES public.property_type_values(id);

-- 2) Бэкфилл из текста (исторически только дома, значения G+x) ---------------
UPDATE public.properties p
   SET floors_in_unit_id = ptv.id
  FROM public.property_type_values ptv
 WHERE ptv.group_name = 'floors_in_unit_house'
   AND ptv.value = p.floors_in_unit
   AND p.floors_in_unit IS NOT NULL
   AND p.floors_in_unit_id IS NULL;

-- 3) Патч get_property: floors_in_unit → floors_in_unit_id + флаги ----------
DO $$
DECLARE
  def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid, uuid)'::regprocedure);

  -- 3a) этажность: ключ и колонка
  def := regexp_replace(
    def,
    '''floors_in_unit''(\s*),(\s*)p\.floors_in_unit\b',
    '''floors_in_unit_id''\1,\2p.floors_in_unit_id',
    'g'
  );

  -- 3b) добавить флаги после is_distress (идемпотентно)
  IF position('is_below_op' in def) = 0 THEN
    def := regexp_replace(
      def,
      '(''is_distress''\s*,\s*p\.is_distress\s*,)',
      E'\\1\n      ''is_reduced'',          p.is_reduced,\n      ''is_below_op'',         p.is_below_op,',
      'g'
    );
  END IF;

  EXECUTE def;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (выполнить после применения):
--   -- бэкфилл без потерь:
--   SELECT count(*) FILTER (WHERE floors_in_unit IS NOT NULL) AS txt,
--          count(*) FILTER (WHERE floors_in_unit_id IS NOT NULL) AS uuid
--     FROM public.properties;   -- txt должно совпасть с uuid (по домам)
--   -- get_property отдаёт новые ключи:
--   SELECT (get_property('<любой property_id>'::uuid))
--          ?| array['floors_in_unit_id','is_reduced','is_below_op'];  -- t
--
-- ОТКАТ:
--   -- вернуть прежний get_property из docs/migrations/applied/2026-06-18-get-property-layer2b.sql
--   ALTER TABLE public.properties DROP COLUMN IF EXISTS floors_in_unit_id;
-- ============================================================================
