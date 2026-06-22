-- ============================================================================
-- 2026-06-22-match-jobs-triggers.sql  (RT-2)
--
-- ЧТО ДЕЛАЕТ: ставит 4 триггера на products-таблицы superApp, которые кладут
--   задание в очередь match_jobs (таблица realtime) при событиях:
--     1. новый объект, сразу active (network-видимость, INSERT)        → listing_new
--     2. объект ПЕРЕВЕДЁН в active через UPDATE (модерация public,      → listing_new
--        pending_review/draft/archived → active)
--     3. снижение цены у активного объекта (UPDATE price)               → price_drop
--     4. создан новый сохранённый фильтр (INSERT)                       → filter_backfill
--   Каждый триггер дополнительно шлёт pg_notify('match_jobs') — worker matcher
--   уже слушает этот канал (мгновенный матчинг вместо ожидания poll-интервала).
--
-- ЗАЧЕМ: без триггеров очередь match_jobs пустая → matcher крутится вхолостую,
--   бейдж unseen_count на сохранённых фильтрах не оживает. (TODO RT-2.)
--
-- КОНТРАКТ match_jobs (сверено с ЖИВОЙ БД 2026-06-22, не из доков):
--   kind       ∈ {listing_new, listing_changed, filter_backfill}
--   match_type ∈ {new_listing, price_drop}
--   ref_id     uuid  (property_id для listing_*, filter_id для filter_backfill)
--
-- ОТЛИЧИЕ ОТ ЧЕРНОВИКА realtime (next-session.md): добавлен триггер #2 на
--   UPDATE status→active. Причина: форма superApp вставляет public-объекты как
--   pending_review (add-property-page.component.ts:818) → активация идёт через
--   UPDATE при модерации. Только-INSERT-триггер пропустил бы все публичные объекты.
--
-- БЕЗОПАСНОСТЬ: SECURITY DEFINER (owner supabase_admin), как trg_sync_context_listings —
--   вставка в match_jobs не зависит от прав вызывающей роли и переживёт закрытие грантов.
--
-- ОБРАТИМО: да — см. блок ОТКАТ внизу (закомментирован).
-- ИДЕМПОТЕНТНО: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS перед CREATE.
-- ============================================================================

-- 1. Новый объект, сразу активный (network → INSERT status=active)
CREATE OR REPLACE FUNCTION public.trg_property_insert_to_match_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO match_jobs (kind, match_type, ref_id)
    VALUES ('listing_new', 'new_listing', NEW.id);
    PERFORM pg_notify('match_jobs', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_insert_match ON public.properties;
CREATE TRIGGER properties_insert_match
  AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.trg_property_insert_to_match_jobs();

-- 2. Объект переведён в active через UPDATE (pending_review/draft/archived → active)
CREATE OR REPLACE FUNCTION public.trg_property_activate_to_match_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    INSERT INTO match_jobs (kind, match_type, ref_id)
    VALUES ('listing_new', 'new_listing', NEW.id);
    PERFORM pg_notify('match_jobs', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_activate_match ON public.properties;
CREATE TRIGGER properties_activate_match
  AFTER UPDATE OF status ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.trg_property_activate_to_match_jobs();

-- 3. Снижение цены у активного объекта (price_drop)
CREATE OR REPLACE FUNCTION public.trg_property_price_drop_to_match_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.price IS DISTINCT FROM NEW.price AND NEW.price < OLD.price THEN
    INSERT INTO match_jobs (kind, match_type, ref_id)
    VALUES ('listing_changed', 'price_drop', NEW.id);
    PERFORM pg_notify('match_jobs', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_price_drop_match ON public.properties;
CREATE TRIGGER properties_price_drop_match
  AFTER UPDATE OF price ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.trg_property_price_drop_to_match_jobs();

-- 4. Новый сохранённый фильтр → backfill (matcher найдёт свежие объекты под него)
CREATE OR REPLACE FUNCTION public.trg_saved_filter_insert_to_match_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    INSERT INTO match_jobs (kind, match_type, ref_id)
    VALUES ('filter_backfill', 'new_listing', NEW.id);
    PERFORM pg_notify('match_jobs', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_filters_insert_match ON public.saved_filters;
CREATE TRIGGER saved_filters_insert_match
  AFTER INSERT ON public.saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.trg_saved_filter_insert_to_match_jobs();

-- ============================================================================
-- ОТКАТ (применить при необходимости отмены):
--   DROP TRIGGER IF EXISTS properties_insert_match     ON public.properties;
--   DROP TRIGGER IF EXISTS properties_activate_match   ON public.properties;
--   DROP TRIGGER IF EXISTS properties_price_drop_match ON public.properties;
--   DROP TRIGGER IF EXISTS saved_filters_insert_match  ON public.saved_filters;
--   DROP FUNCTION IF EXISTS public.trg_property_insert_to_match_jobs();
--   DROP FUNCTION IF EXISTS public.trg_property_activate_to_match_jobs();
--   DROP FUNCTION IF EXISTS public.trg_property_price_drop_to_match_jobs();
--   DROP FUNCTION IF EXISTS public.trg_saved_filter_insert_to_match_jobs();
-- ============================================================================
