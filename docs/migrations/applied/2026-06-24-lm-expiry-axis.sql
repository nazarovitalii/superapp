-- LM Task 2 — Ось истечения: expires_at при активации + авто-свип active→expired.
-- Discovery 2026-06-24 (живой прод): pg_cron УЖЕ в shared_preload_libraries → нужен лишь
-- CREATE EXTENSION (без рестарта Postgres); supabase_admin = superuser (apply проходит);
-- статус-сеттер-триггера на properties НЕТ → порядок BEFORE-триггеров не важен (NEW.status финален).
-- Идемпотентно. ОБРАТИМО: cron.unschedule + DROP TRIGGER + DROP FUNCTION (внизу). Бэкфилл необратим.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- expires_at ставится ровно при переходе объекта в active (одно правило, одно место).
CREATE OR REPLACE FUNCTION public.set_expires_on_activation()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_expires_on_activation ON public.properties;
CREATE TRIGGER trg_set_expires_on_activation
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_expires_on_activation();

-- Бэкфилл: живым active без срока — 30 дней от раскатки (иначе старые не истекают, новые истекают).
UPDATE public.properties
   SET expires_at = now() + interval '30 days'
 WHERE status = 'active' AND expires_at IS NULL;

-- pg_cron: ежедневно (03:00 UTC) active→expired по истёкшему сроку.
SELECT cron.schedule(
  'expire-listings', '0 3 * * *',
  $job$UPDATE public.properties SET status = 'expired'
        WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now()$job$
);

-- ============================================================================
-- ОТКАТ:
--   SELECT cron.unschedule('expire-listings');
--   DROP TRIGGER IF EXISTS trg_set_expires_on_activation ON public.properties;
--   DROP FUNCTION IF EXISTS public.set_expires_on_activation();
--   -- pg_cron-расширение оставить (может использоваться другими); бэкфилл expires_at необратим.
-- ============================================================================
