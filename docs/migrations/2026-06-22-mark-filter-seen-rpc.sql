-- Помечает объекты просмотренными в контексте фильтра (для частичного гашения бейджа).
-- SECURITY DEFINER, но вставляет строки ТОЛЬКО для фильтров, принадлежащих auth.uid()
-- (подзапрос по saved_filters) — нельзя пометить чужой фильтр. ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.mark_filter_seen(p_filter_id uuid, p_property_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_filter_seen (user_id, filter_id, property_id)
  SELECT auth.uid(), p_filter_id, pid
  FROM unnest(p_property_ids) AS pid
  WHERE EXISTS (
    SELECT 1 FROM public.saved_filters sf
    WHERE sf.id = p_filter_id AND sf.user_id = auth.uid()
  )
  ON CONFLICT (user_id, filter_id, property_id) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.mark_filter_seen(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_filter_seen(uuid, uuid[]) TO authenticated;
