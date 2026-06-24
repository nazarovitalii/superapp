-- LM Task 4 (LM-6) — переопубликация отклонённого/снятого: правка цены+описания + смена статуса.
-- rejected/withdrawn → public:pending_review | network:active. Возвращает итоговый статус
-- (серверная истина — клиент не пересчитывает). expires_at при network→active ставит триггер Task 2.
-- Идемпотентно (CREATE OR REPLACE). ОБРАТИМО: DROP FUNCTION (внизу).
CREATE OR REPLACE FUNCTION public.republish_property(
  p_property_id uuid, p_price numeric, p_description text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_status text; v_visibility text; v_new_status text;
BEGIN
  SELECT status, visibility INTO v_status, v_visibility FROM properties
   WHERE id = p_property_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;
  IF v_status NOT IN ('rejected', 'archived_withdrawn') THEN
    RAISE EXCEPTION 'cannot republish: status must be rejected or withdrawn (status=%)', v_status;
  END IF;
  v_new_status := CASE WHEN v_visibility = 'public' THEN 'pending_review' ELSE 'active' END;
  UPDATE properties
     SET price = p_price, description = p_description, status = v_new_status
   WHERE id = p_property_id AND owner_id = auth.uid();
  RETURN v_new_status;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.republish_property(uuid, numeric, text) TO authenticated;

-- ОТКАТ: DROP FUNCTION IF EXISTS public.republish_property(uuid, numeric, text);
