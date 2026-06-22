-- Стадия 1: bulk-impression. Бампает shown_at для текущего юзера по списку объектов.
-- Пропускает объекты, где владелец = сам юзер (чтобы не пачкать воронку seen_preview).
-- seen_at НЕ трогает (это сигнал открытия, не показа).
CREATE OR REPLACE FUNCTION public.mark_listings_shown(p_property_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_seen_listings (user_id, property_id, shown_at)
  SELECT auth.uid(), p.id, now()
  FROM public.properties p
  WHERE p.id = ANY(p_property_ids)
    AND p.owner_id IS DISTINCT FROM auth.uid()
  ON CONFLICT (user_id, property_id) DO UPDATE SET shown_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.mark_listings_shown(uuid[]) TO authenticated;
