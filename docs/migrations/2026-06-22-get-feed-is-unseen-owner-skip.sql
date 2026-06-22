-- Баг A: свои объекты вечно светятся. is_unseen в get_feed не учитывал владельца,
-- а mark_listings_shown намеренно пропускает свои объекты → shown_at=NULL → is_unseen
-- вечно true. Фикс: свои объекты всегда is_unseen=false (owner-skip в самом выражении).
-- Staleness-proof: правим по живому pg_get_functiondef, вставляя owner-skip перед GREATEST.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_feed' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  IF position('p.owner_id IS DISTINCT FROM COALESCE(p_user_id, auth.uid()) AND GREATEST(p.created_at' in v_def) > 0 THEN
    RAISE NOTICE 'get_feed owner-skip: уже применено — пропускаю';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_def,
    E'(''is_unseen''[[:space:]]*,[[:space:]]*\\()(GREATEST\\(p\\.created_at)',
    E'\\1p.owner_id IS DISTINCT FROM COALESCE(p_user_id, auth.uid()) AND \\2'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed owner-skip: якорь is_unseen/GREATEST не найден — тело изменилось, патч прерван';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed.is_unseen: owner-skip применён';
END
$migrate$;
