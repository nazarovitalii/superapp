-- 014 — owner-skip в слое матча. Правило доставки: не уведомлять юзера о СВОИХ листингах.
-- IS DISTINCT FROM (NULL-safe): объект без owner_id всё равно матчит. Предикат НЕ трогаем (= get_feed).
-- Источник: realtime (migrations/product/014). Прорецензировано superApp.
CREATE OR REPLACE FUNCTION public.match_property(p_property_id uuid)
RETURNS TABLE(filter_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT sf.id AS filter_id, sf.user_id
  FROM saved_filters sf
  WHERE sf.deleted_at IS NULL
    AND sf.user_id IS DISTINCT FROM (SELECT p.owner_id FROM properties p WHERE p.id = p_property_id)
    AND public.property_matches_filter(p_property_id, sf.id)
$$;

CREATE OR REPLACE FUNCTION public.match_filter(p_filter_id uuid)
RETURNS TABLE(property_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT p.id AS property_id
  FROM properties p
  WHERE p.status = 'active'
    AND p.created_at >= now() - interval '90 days'
    AND p.owner_id IS DISTINCT FROM (SELECT sf.user_id FROM saved_filters sf WHERE sf.id = p_filter_id)
    AND public.property_matches_filter(p.id, p_filter_id)
  ORDER BY p.created_at DESC
  LIMIT 500
$$;
GRANT EXECUTE ON FUNCTION public.match_property(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_filter(uuid)   TO service_role;
