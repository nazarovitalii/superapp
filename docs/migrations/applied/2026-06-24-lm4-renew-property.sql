-- LM Task 3 (LM-4) — продление просроченного объекта (expired→active сразу, без модерации).
-- expires_at проставит триггер активации (Task 2, trg_set_expires_on_activation). owner-check.
-- Идемпотентно (CREATE OR REPLACE). ОБРАТИМО: DROP FUNCTION (внизу).
CREATE OR REPLACE FUNCTION public.renew_property(p_property_id uuid)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM properties
   WHERE id = p_property_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;
  IF v_status <> 'expired' THEN
    RAISE EXCEPTION 'cannot renew: property is not expired (status=%)', v_status;
  END IF;
  UPDATE properties SET status = 'active'
   WHERE id = p_property_id AND owner_id = auth.uid();
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.renew_property(uuid) TO authenticated;

-- ОТКАТ: DROP FUNCTION IF EXISTS public.renew_property(uuid);
