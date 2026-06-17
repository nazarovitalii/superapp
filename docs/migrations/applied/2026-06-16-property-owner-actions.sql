-- ============================================================================
-- Миграция: действия владельца над своим объектом
--   1) Редактирование (только цена + описание)
--   2) Актуализация (поднять объект в ленте)
--   3) Архивация (смена статуса: продан / снят)
--
-- ПРИЧИНА: на таблице public.properties есть RLS только на INSERT и SELECT
--   (properties_insert / properties_select). UPDATE-политики НЕТ → агент не может
--   менять свои объекты с клиента (anon-ключ + RLS). Добавляем 3 узкие функции
--   SECURITY DEFINER: каждая проверяет owner_id = auth.uid() и меняет ТОЛЬКО
--   разрешённые поля. Это безопаснее общей UPDATE-политики (агент не сможет
--   поменять, например, статус на 'active' в обход модерации или чужие поля).
--
-- ИЗМЕНЕНИЯ ДАННЫХ: нет. Создаём только функции (история цены/updated_at —
--   за существующими триггерами properties). ОБРАТИМО: DROP FUNCTION (внизу).
-- ============================================================================

-- 1) Редактирование: только цена и описание ---------------------------------
CREATE OR REPLACE FUNCTION public.update_property(
  p_property_id uuid,
  p_price       numeric,
  p_description text
) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE properties
     SET price       = p_price,
         description = p_description
   WHERE id = p_property_id
     AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;
  RETURN true;
END;
$function$;

-- 2) Актуализация: last_actualized_at = now() (объект всплывает в ленте) ------
CREATE OR REPLACE FUNCTION public.actualize_property(p_property_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE properties
     SET last_actualized_at = now()
   WHERE id = p_property_id
     AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;
  RETURN true;
END;
$function$;

-- 3) Архивация: статус archived_sold | archived_withdrawn --------------------
CREATE OR REPLACE FUNCTION public.archive_property(
  p_property_id uuid,
  p_status      text
) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_status NOT IN ('archived_sold', 'archived_withdrawn') THEN
    RAISE EXCEPTION 'archive status must be archived_sold or archived_withdrawn';
  END IF;

  UPDATE properties
     SET status = p_status
   WHERE id = p_property_id
     AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;
  RETURN true;
END;
$function$;

-- Права вызова: только аутентифицированные (auth.uid() есть только у них) ------
GRANT EXECUTE ON FUNCTION public.update_property(uuid, numeric, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualize_property(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_property(uuid, text)         TO authenticated;

-- ============================================================================
-- ОТКАТ:
--   DROP FUNCTION IF EXISTS public.update_property(uuid, numeric, text);
--   DROP FUNCTION IF EXISTS public.actualize_property(uuid);
--   DROP FUNCTION IF EXISTS public.archive_property(uuid, text);
-- ============================================================================
