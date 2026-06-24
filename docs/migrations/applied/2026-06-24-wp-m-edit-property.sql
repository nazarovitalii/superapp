-- WP-M Фаза A: edit_property — полноценное редактирование листинга с жёстким whitelist.
-- Неизменяемые поля (category/type/deal/location/beds/baths/owner/status) НЕ параметры →
-- недостижимы из devtools. SECURITY DEFINER + owner-check (owner_id = auth.uid()).
-- area_sqm/plot_sqm выводятся сервером из sqft (один источник округления, без клиентского дрейфа).
-- previous_price/price_changed_at пишет ТОЛЬКО эта функция (триггеров-писателей нет);
-- is_reduced/is_below_op ставит существующий trg_property_price_flags — здесь не трогаем.
-- Аддитивно: update_property/republish_property пока ЖИВЫ (дропаются в Фазе B после деплоя фронта).
-- Идемпотентно (CREATE OR REPLACE). ОБРАТИМО: DROP (внизу). Применять под supabase_admin.
CREATE OR REPLACE FUNCTION public.edit_property(
  p_property_id        uuid,
  p_price              numeric,
  p_description        text    DEFAULT NULL,
  p_is_maid            boolean DEFAULT false,
  p_is_study           boolean DEFAULT false,
  p_is_hotel_pool      boolean DEFAULT false,
  p_is_vastu           boolean DEFAULT false,
  p_area_sqft          numeric DEFAULT NULL,
  p_plot_sqft          numeric DEFAULT NULL,
  p_floor_level_id     uuid    DEFAULT NULL,
  p_floor_number       integer DEFAULT NULL,
  p_floors_in_unit_id  uuid    DEFAULT NULL,
  p_view_ids           uuid[]  DEFAULT NULL,
  p_position_ids       uuid[]  DEFAULT NULL,
  p_amenity_ids        uuid[]  DEFAULT NULL,
  p_furnished          text    DEFAULT NULL,
  p_price_period       text    DEFAULT NULL,
  p_occupancy_status   text    DEFAULT NULL,
  p_lease_until        date    DEFAULT NULL,
  p_listing_type       text    DEFAULT NULL,
  p_visibility         text    DEFAULT NULL,
  p_public_location_id uuid    DEFAULT NULL,
  p_original_price     numeric DEFAULT NULL
) RETURNS text
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
  WHERE id = p_property_id AND owner_id = auth.uid();

  RETURN v_new_status;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.edit_property(
  uuid, numeric, text, boolean, boolean, boolean, boolean, numeric, numeric,
  uuid, integer, uuid, uuid[], uuid[], uuid[], text, text, text, date, text, text, uuid, numeric
) TO authenticated;

-- ОТКАТ Фазы A (edit_property):
--   DROP FUNCTION IF EXISTS public.edit_property(
--     uuid, numeric, text, boolean, boolean, boolean, boolean, numeric, numeric,
--     uuid, integer, uuid, uuid[], uuid[], uuid[], text, text, text, date, text, text, uuid, numeric);

-- ── Аддитивный патч get_property: отдать public_location_id (uuid) ────────────
-- Зачем: фронт edit-property выставляет начальную позицию бегунка приватности по id
-- (сейчас отдаётся только public_location_path-строка — по ней нельзя точно найти узел).
-- Патч staleness-proof: pg_get_functiondef + regexp по живому определению (НЕ переписываем
-- тело из доков), с guard «якорь не найден». Якорь — существующий ключ 'public_location_path'.
DO $$
DECLARE def text; new_def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid,uuid)'::regprocedure);
  -- Точный якорь: json_build_object-запись «'public_location_path', CASE» (единственная;
  -- ссылки v_result->>'public_location_path' имеют другой контекст и НЕ затрагиваются).
  -- Вставляем ключ public_location_id ПЕРЕД ней. Без флага 'g' — одно вхождение.
  new_def := replace(
    def,
    '''public_location_path'', CASE',
    '''public_location_id'', p.public_location_id, ''public_location_path'', CASE'
  );
  IF new_def = def THEN
    RAISE NOTICE 'якорь "public_location_path, CASE" не найден — формат get_property изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;
-- ОТКАТ патча: повторно применить предыдущее определение get_property из applied/.
