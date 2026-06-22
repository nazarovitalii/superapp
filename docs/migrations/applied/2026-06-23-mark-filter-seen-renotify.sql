-- Re-notify: повторный просмотр в фильтре ОБНОВЛЯЕТ seen_at (а не игнорирует).
-- Нужно, чтобы объект, обновлённый позже последнего просмотра, снова попал в счётчик
-- (read-side сравнивает updated_at > seen_at). Функция наша, тело простое — CREATE OR REPLACE целиком.
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
  ON CONFLICT (user_id, filter_id, property_id) DO UPDATE SET seen_at = now();
$$;

REVOKE ALL ON FUNCTION public.mark_filter_seen(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_filter_seen(uuid, uuid[]) TO authenticated;
