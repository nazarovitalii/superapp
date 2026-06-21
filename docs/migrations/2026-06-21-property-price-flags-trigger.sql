-- ============================================================================
-- Миграция: авто-флаги цены на properties
--   is_below_op — производное: original_price задан И price < original_price
--                 (на каждый INSERT/UPDATE).
--   is_reduced  — sticky: при снижении цены (UPDATE) ставим true, не сбрасываем.
--
-- Отдельная функция/триггер; существующий log_property_changes НЕ трогаем
-- (использует OLD.price напрямую → не зависит от порядка BEFORE-триггеров).
-- ОБРАТИМО: DROP внизу.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_property_price_flags()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  -- ниже Original Price (производное)
  NEW.is_below_op := (NEW.original_price IS NOT NULL AND NEW.price < NEW.original_price);

  -- sticky «когда-либо снижали»: только при UPDATE и снижении цены
  IF (TG_OP = 'UPDATE') AND (NEW.price < OLD.price) THEN
    NEW.is_reduced := true;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_property_price_flags ON public.properties;
CREATE TRIGGER trg_property_price_flags
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_price_flags();

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения, на тестовом объекте владельца):
--   -- insert ниже OP → is_below_op=true; снижение цены → is_reduced=true;
--   -- рост цены назад выше OP → is_below_op=false, is_reduced остаётся true.
--
-- ОТКАТ:
--   DROP TRIGGER IF EXISTS trg_property_price_flags ON public.properties;
--   DROP FUNCTION IF EXISTS public.set_property_price_flags();
-- ============================================================================
