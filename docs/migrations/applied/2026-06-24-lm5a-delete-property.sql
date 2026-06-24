-- LM Task 5a (LM-5) — полное удаление объекта из архива (каскад + аудит-след).
-- ⚠ Эффект ДЕСТРУКТИВЕН ПРИ ВЫЗОВЕ; само применение НЕ удаляет данных (создаёт функцию+таблицу).
--
-- FK-аудит (живой прод, 2026-06-24): 11 из 12 FK→properties уже ON DELETE CASCADE
--   (filter_matches, user_filter_seen — realtime-owned; property_comments — F-13e; property_events,
--    property_form_a, property_logs, property_photos, property_price_history, saved_properties,
--    moderation_queue). Единственный NO ACTION — pdf_generations (наша feature-таблица, property_id
--    NOT NULL, 0 строк) → добиваем ЯВНЫМ DELETE внутри RPC. НИ ОДНОГО ALTER констрейнта (zero cross-repo).
--
-- Удаление разрешено ТОЛЬКО из архива (archived_sold/archived_withdrawn); owner-check.
-- Идемпотентно (CREATE OR REPLACE / IF NOT EXISTS). ОБРАТИМО: DROP FUNCTION/TABLE (внизу).

-- (1) Аудит-след: только факт удаления (сам объект НЕ хранится). Пишет лишь DEFINER-функция.
CREATE TABLE IF NOT EXISTS public.deleted_listings_audit (
  property_id uuid PRIMARY KEY,
  owner_id    uuid NOT NULL,
  deleted_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_listings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_listings_audit FROM anon, authenticated;

-- (2) RPC удаления: только из архива; аудит в той же транзакции; pdf явно, остальное каскадом.
CREATE OR REPLACE FUNCTION public.delete_property(p_property_id uuid)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_status text; v_owner uuid;
BEGIN
  SELECT status, owner_id INTO v_status, v_owner FROM properties
   WHERE id = p_property_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;
  IF v_status NOT IN ('archived_sold', 'archived_withdrawn') THEN
    RAISE EXCEPTION 'cannot delete: property must be archived first (status=%)', v_status;
  END IF;

  INSERT INTO deleted_listings_audit (property_id, owner_id)
       VALUES (p_property_id, v_owner)
  ON CONFLICT (property_id) DO NOTHING;

  DELETE FROM pdf_generations WHERE property_id = p_property_id;  -- NO ACTION FK → явная чистка
  DELETE FROM properties WHERE id = p_property_id AND owner_id = auth.uid();  -- 11 cascade добивают следы
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_property(uuid) TO authenticated;

-- ============================================================================
-- ОТКАТ:
--   DROP FUNCTION IF EXISTS public.delete_property(uuid);
--   DROP TABLE IF EXISTS public.deleted_listings_audit;
-- ============================================================================
