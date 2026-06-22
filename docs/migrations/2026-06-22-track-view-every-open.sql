-- Стадия 1: track_view бампает seen_at И shown_at на КАЖДОМ открытии (гард «раз в день» снят).
-- ⚠️ Staleness-proof: ПЕРЕД применением сверить с текущим телом:
--    SELECT pg_get_functiondef('public.track_view(uuid,uuid)'::regprocedure);
--    Перенести в новое тело любые расхождения DECLARE/резолва юзера, не учтённые здесь.
CREATE OR REPLACE FUNCTION public.track_view(p_property_id uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_owner_id uuid;
  v_is_first boolean;
BEGIN
  SELECT owner_id INTO v_owner_id FROM properties WHERE id = p_property_id;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'property not found');
  END IF;

  -- Не считать просмотр владельцем своего объекта
  IF v_owner_id = v_current_user_id THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'owner view');
  END IF;

  -- Первое ли это касание пары (user, property) за всё время — для unique_views
  SELECT NOT EXISTS (
    SELECT 1 FROM user_seen_listings
    WHERE user_id = v_current_user_id AND property_id = p_property_id
  ) INTO v_is_first;

  -- views_count++ всегда
  UPDATE properties SET views_count = views_count + 1 WHERE id = p_property_id;

  -- На КАЖДОМ открытии: бампаем обе метки (открыл ⟹ и показан)
  INSERT INTO user_seen_listings (user_id, property_id, seen_at, shown_at)
  VALUES (v_current_user_id, p_property_id, now(), now())
  ON CONFLICT (user_id, property_id) DO UPDATE
    SET seen_at = now(), shown_at = now();

  -- unique_views_count++ только при первом касании пары
  IF v_is_first THEN
    UPDATE properties SET unique_views_count = unique_views_count + 1 WHERE id = p_property_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'skipped', false, 'unique', v_is_first);
END;
$$;
