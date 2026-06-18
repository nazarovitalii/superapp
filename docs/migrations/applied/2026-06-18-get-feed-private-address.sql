-- =============================================================================
-- get_feed: приватность адреса в ленте — публичный leaf чужим (V-10, P2)
-- =============================================================================
-- ЧТО: в строке ленты
--   • location_name / community_name теперь = полный адрес ТОЛЬКО владельцу или
--     если адрес не скрыт (public_location_id IS NULL); иначе — публичный leaf /
--     публичная community (чтобы полный адрес чужим в payload не попадал);
--   • добавлены поля public_location_name / public_community_name = всегда
--     публичный вид (для показа в табе All Inventory даже своих объектов).
--
-- ЗАЧЕМ: сейчас get_feed отдаёт l.name (полный leaf) ВСЕМ → слайдер приватности
--   косметика. Клиент: My Inventory показывает полный, остальные охваты —
--   public_location_name (V-10).
--
-- БЕЗОПАСНОСТЬ: НЕ переписываем тело из доков (в живой функции есть is_vastu,
--   которого в доках нет). Читаем ЖИВОЕ определение через pg_get_functiondef и
--   точечно меняем две строки (location_name, community_name). Якоря не найдены —
--   падаем ЯВНО.
-- ИДЕМПОТЕНТНА: при наличии public_location_name — пропуск.
-- ОБРАТИМА: да — вернуть 'location_name', l.name, и 'community_name', lc.name,;
--   убрать поля public_*.
-- РОЛЬ: применять под supabase_admin (владелец функции).
-- =============================================================================

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_tmp text;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
  WHERE proname = 'get_feed' AND pronamespace = 'public'::regnamespace;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Функция public.get_feed не найдена';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('public_location_name' IN v_def) > 0 THEN
    RAISE NOTICE 'get_feed: приватность адреса уже включена — пропуск.';
    RETURN;
  END IF;

  v_new := v_def;

  -- 1) location_name: гейт по владельцу/скрытости + новое public_location_name.
  v_tmp := regexp_replace(
    v_new,
    $p1$'location_name',\s+l\.name,$p1$,
    $r1$'location_name', CASE WHEN p.owner_id = v_current_user_id OR p.public_location_id IS NULL THEN l.name ELSE (SELECT name FROM locations WHERE id = p.public_location_id) END,
        'public_location_name', CASE WHEN p.public_location_id IS NULL THEN l.name ELSE (SELECT name FROM locations WHERE id = p.public_location_id) END,$r1$,
    ''
  );
  IF v_tmp = v_new THEN
    RAISE EXCEPTION 'get_feed: якорь location_name не найден — формат изменился';
  END IF;
  v_new := v_tmp;

  -- 2) community_name: гейт + новое public_community_name (community-предок публичной локации).
  v_tmp := regexp_replace(
    v_new,
    $p2$'community_name',\s+lc\.name,$p2$,
    $r2$'community_name', CASE WHEN p.owner_id = v_current_user_id OR p.public_location_id IS NULL THEN lc.name ELSE (SELECT c2.name FROM locations pp2 LEFT JOIN locations c2 ON c2.id = pp2.community_id WHERE pp2.id = p.public_location_id) END,
        'public_community_name', CASE WHEN p.public_location_id IS NULL THEN lc.name ELSE (SELECT c2.name FROM locations pp2 LEFT JOIN locations c2 ON c2.id = pp2.community_id WHERE pp2.id = p.public_location_id) END,$r2$,
    ''
  );
  IF v_tmp = v_new THEN
    RAISE EXCEPTION 'get_feed: якорь community_name не найден — формат изменился';
  END IF;
  v_new := v_tmp;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed: приватность адреса (public_location_name/community) включена.';
END $$;
