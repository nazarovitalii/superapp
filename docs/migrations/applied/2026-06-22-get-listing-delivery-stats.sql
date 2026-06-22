-- Стадия 2: воронка владельца по объекту (вложенная: preview ⊇ full ⊇ contact).
-- Только владелец объекта видит цифры (гейт по owner_id = auth.uid()).
CREATE OR REPLACE FUNCTION public.get_listing_delivery_stats(p_property_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = p_property_id AND p.owner_id = auth.uid()
    ) THEN jsonb_build_object('error', 'forbidden')
    ELSE jsonb_build_object(
      'seen_preview', (SELECT count(DISTINCT user_id) FROM user_seen_listings
                        WHERE property_id = p_property_id AND shown_at IS NOT NULL),
      'seen_full',    (SELECT count(DISTINCT user_id) FROM user_seen_listings
                        WHERE property_id = p_property_id AND seen_at IS NOT NULL),
      'seen_contact', (SELECT count(DISTINCT user_id) FROM user_seen_listings
                        WHERE property_id = p_property_id AND contact_at IS NOT NULL)
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_listing_delivery_stats(uuid) TO authenticated;
