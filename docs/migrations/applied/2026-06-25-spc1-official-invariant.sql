-- SP-C1: инвариант модерации Official/Form A + edit_property +is_exclusive.
-- 1) Триггер на properties: Official может быть active ТОЛЬКО если САМЫЙ СВЕЖИЙ Form A одобрен,
--    иначе принудительно pending_review (только ужесточает; покрывает и add-INSERT; модератор
--    проходит, т.к. триггер смотрит на факт одобрения, а не на роль).
-- 2) edit_property: +p_is_exclusive (смена сигнатуры → DROP+CREATE, тело из живой БД).
--    + RETURNING status — вернуть ФАКТИЧЕСКИЙ статус после триггера (а не вычисленный), чтобы
--    клиент честно показал «На проверке»/«Сохранено». Статус-логику (v_new_status) НЕ меняем.
-- Обратимо: триггер/функция дропаются; edit_property вернуть из git (applied/2026-06-24-wp-m-edit-property.sql).
-- Применять под supabase_admin, транзакционно.

-- 1) Триггер инварианта ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_official_forma_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_latest_approved boolean;
BEGIN
  IF NEW.listing_type = 'official' AND NEW.status = 'active' THEN
    SELECT (fa.approved_at IS NOT NULL)
      INTO v_latest_approved
      FROM public.property_form_a fa
     WHERE fa.property_id = NEW.id
     ORDER BY fa.uploaded_at DESC
     LIMIT 1;
    IF COALESCE(v_latest_approved, false) = false THEN
      NEW.status := 'pending_review';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_official_requires_approved_forma ON public.properties;
CREATE TRIGGER trg_official_requires_approved_forma
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_official_forma_approved();

-- 2) edit_property +p_is_exclusive (смена сигнатуры → DROP старой 23-арг + CREATE 24-арг) ─────
DROP FUNCTION IF EXISTS public.edit_property(uuid, numeric, text, boolean, boolean, boolean, boolean, numeric, numeric, uuid, integer, uuid, uuid[], uuid[], uuid[], text, text, text, date, text, text, uuid, numeric);

CREATE OR REPLACE FUNCTION public.edit_property(p_property_id uuid, p_price numeric, p_description text DEFAULT NULL::text, p_is_maid boolean DEFAULT false, p_is_study boolean DEFAULT false, p_is_hotel_pool boolean DEFAULT false, p_is_vastu boolean DEFAULT false, p_area_sqft numeric DEFAULT NULL::numeric, p_plot_sqft numeric DEFAULT NULL::numeric, p_floor_level_id uuid DEFAULT NULL::uuid, p_floor_number integer DEFAULT NULL::integer, p_floors_in_unit_id uuid DEFAULT NULL::uuid, p_view_ids uuid[] DEFAULT NULL::uuid[], p_position_ids uuid[] DEFAULT NULL::uuid[], p_amenity_ids uuid[] DEFAULT NULL::uuid[], p_furnished text DEFAULT NULL::text, p_price_period text DEFAULT NULL::text, p_occupancy_status text DEFAULT NULL::text, p_lease_until date DEFAULT NULL::date, p_listing_type text DEFAULT NULL::text, p_visibility text DEFAULT NULL::text, p_public_location_id uuid DEFAULT NULL::uuid, p_original_price numeric DEFAULT NULL::numeric, p_is_exclusive boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_status      text;
  v_visibility  text;
  v_old_price   numeric;
  v_old_op      numeric;
  v_new_status  text;
  v_sqft_to_sqm constant numeric := 0.092903;
BEGIN
  SELECT status, visibility, price, original_price
    INTO v_status, v_visibility, v_old_price, v_old_op
    FROM properties
   WHERE id = p_property_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;

  -- Статус: active остаётся active; rejected/withdrawn → переопубликация по (новой) видимости;
  -- остальное запрещено (pending ждёт модерации, expired — сперва «Продлить», sold — архив).
  IF v_status = 'active' THEN
    v_new_status := 'active';
  ELSIF v_status IN ('rejected', 'archived_withdrawn') THEN
    v_new_status := CASE
      WHEN COALESCE(p_visibility, v_visibility) = 'public' THEN 'pending_review'
      ELSE 'active'
    END;
  ELSE
    RAISE EXCEPTION 'cannot edit listing in status %', v_status;
  END IF;

  UPDATE properties SET
    is_maid            = p_is_maid,
    is_study           = p_is_study,
    is_hotel_pool      = p_is_hotel_pool,
    is_vastu           = p_is_vastu,
    is_exclusive       = p_is_exclusive,
    area_sqft          = p_area_sqft,
    area_sqm           = CASE WHEN p_area_sqft IS NULL THEN NULL
                              ELSE round(p_area_sqft * v_sqft_to_sqm, 2) END,
    plot_sqft          = p_plot_sqft,
    plot_sqm           = CASE WHEN p_plot_sqft IS NULL THEN NULL
                              ELSE round(p_plot_sqft * v_sqft_to_sqm, 2) END,
    floor_level_id     = p_floor_level_id,
    floor_number       = p_floor_number,
    floors_in_unit_id  = p_floors_in_unit_id,
    view_ids           = p_view_ids,
    position_ids       = p_position_ids,
    amenity_ids        = p_amenity_ids,
    furnished          = p_furnished,
    price              = p_price,
    price_period       = p_price_period,
    occupancy_status   = p_occupancy_status,
    lease_until        = p_lease_until,
    listing_type       = p_listing_type,
    visibility         = COALESCE(p_visibility, v_visibility),
    public_location_id = p_public_location_id,
    original_price     = COALESCE(v_old_op, p_original_price),
    description        = p_description,
    previous_price     = CASE WHEN p_price IS DISTINCT FROM v_old_price
                              THEN v_old_price ELSE previous_price END,
    price_changed_at   = CASE WHEN p_price IS DISTINCT FROM v_old_price
                              THEN now() ELSE price_changed_at END,
    last_actualized_at = now(),
    status             = v_new_status
  WHERE id = p_property_id AND owner_id = auth.uid()
  RETURNING status INTO v_new_status;

  RETURN v_new_status;
END;
$function$;
