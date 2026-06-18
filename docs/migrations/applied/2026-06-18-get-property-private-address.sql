-- =============================================================================
-- get_property: приватность адреса — полный адрес только владельцу (V-10/V-11, P1)
-- =============================================================================
-- ЧТО: для НЕ-владельца, когда адрес скрыт слайдером (public_location_path задан),
--   убираем из ответа location_full_path и подменяем location_name (leaf) на
--   публичный leaf (последний сегмент public_location_path). Владелец и нескрытые
--   объекты — без изменений. public_location_path остаётся (для блока «Расположение»).
--
-- ЗАЧЕМ: сейчас get_property отдаёт полный путь адреса ВСЕМ → слайдер «что видят
--   коллеги» косметика, точный адрес утекает чужим. Чиним на сервере.
--
-- БЕЗОПАСНОСТЬ: НЕ переписываем тело из доков. Читаем ЖИВОЕ определение через
--   pg_get_functiondef и вставляем пост-обработку перед `RETURN v_result;`
--   (единственный якорь). Если якорь не найден — падаем ЯВНО, не патчим.
-- ИДЕМПОТЕНТНА: повторный прогон снова вставит блок — чтобы не дублировать,
--   проверяем, что блок ещё не вставлен (по маркер-комментарию).
-- ОБРАТИМА: да — убрать вставленный IF-блок, оставить голый `RETURN v_result;`.
-- РОЛЬ: применять под supabase_admin (владелец функции).
-- =============================================================================

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_inject text;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
  WHERE proname = 'get_property' AND pronamespace = 'public'::regnamespace;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Функция public.get_property не найдена';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('privacy-address-v10' IN v_def) > 0 THEN
    RAISE NOTICE 'get_property: приватность адреса уже включена — пропуск.';
    RETURN;
  END IF;

  -- Блок-вставка перед RETURN v_result; (маркер privacy-address-v10 для идемпотентности).
  v_inject := $inj$-- privacy-address-v10: чужим полный адрес не отдаём
  IF NOT COALESCE((v_result->>'is_owner')::boolean, false)
     AND v_result->>'public_location_path' IS NOT NULL THEN
    v_result := (v_result - 'location_full_path')
      || jsonb_build_object(
           'location_name',
           (regexp_split_to_array(v_result->>'public_location_path', ' > '))[
             cardinality(regexp_split_to_array(v_result->>'public_location_path', ' > '))]
         );
  END IF;

  RETURN v_result;$inj$;

  v_new := regexp_replace(v_def, 'RETURN v_result\s*;', v_inject, '');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_property: якорь "RETURN v_result;" не найден — формат изменился, не патчим';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_property: приватность адреса включена.';
END $$;
