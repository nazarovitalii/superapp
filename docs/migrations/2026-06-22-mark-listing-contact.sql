-- Стадия 2: нажатие кнопки контакта (WhatsApp/Telegram) в карточке.
-- Контакт ⟹ открыл ⟹ показан → бампаем все три метки. Owner-skip. Идемпотентно по PK.
CREATE OR REPLACE FUNCTION public.mark_listing_contact(p_property_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT owner_id INTO v_owner FROM properties WHERE id = p_property_id;
  IF v_owner IS NULL OR v_owner = v_uid THEN RETURN; END IF;  -- нет объекта / свой объект — пропуск
  INSERT INTO user_seen_listings (user_id, property_id, contact_at, seen_at, shown_at)
  VALUES (v_uid, p_property_id, now(), now(), now())
  ON CONFLICT (user_id, property_id) DO UPDATE
    SET contact_at = now(), seen_at = now(), shown_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_listing_contact(uuid) TO authenticated;
