-- Стадия 3 (для серверного бота gpt): перегрузка mark_listings_shown с ЯВНЫМ p_user_id.
-- Зачем: бот ходит сервер-сайд без web-сессии → auth.uid() пуст. Логика та же, что у
--   mark_listings_shown(uuid[]): bump shown_at=now() по списку объектов, пропуск собственных объектов юзера.
-- ⚠️ БЕЗОПАСНОСТЬ: GRANT только service_role (НЕ authenticated). Иначе любой web-юзер под anon/authenticated
--   подставит чужой p_user_id и пометит показы за другого (privacy/integrity). Бот ходит под service-key.
-- Это НОВАЯ перегрузка (2 аргумента) — одноаргументная mark_listings_shown(uuid[]) остаётся для web.
CREATE OR REPLACE FUNCTION public.mark_listings_shown(p_property_ids uuid[], p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  INSERT INTO public.user_seen_listings (user_id, property_id, shown_at)
  SELECT p_user_id, p.id, now()
  FROM public.properties p
  WHERE p.id = ANY(p_property_ids)
    AND p.owner_id IS DISTINCT FROM p_user_id
  ON CONFLICT (user_id, property_id) DO UPDATE SET shown_at = now();
$$;

-- ⚠️ В Supabase default privileges навешивают EXECUTE на anon/authenticated через ALTER DEFAULT
--    PRIVILEGES (НЕ через PUBLIC) → REVOKE FROM PUBLIC их НЕ снимает. Явно отзываем у anon/authenticated.
REVOKE ALL ON FUNCTION public.mark_listings_shown(uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_listings_shown(uuid[], uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_listings_shown(uuid[], uuid) TO service_role;
