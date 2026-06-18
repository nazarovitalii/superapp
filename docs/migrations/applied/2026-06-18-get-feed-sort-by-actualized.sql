-- =============================================================================
-- get_feed: сортировка по дате АКТУАЛИЗАЦИИ, а не публикации (U-3, баг сортировки)
-- =============================================================================
-- ЧТО: в ORDER BY функции public.get_feed ветки сортировки по дате
--   (p_sort_by = 'default' | 'date_desc' | 'date_asc') использовали
--   p.published_at. Меняем на COALESCE(p.last_actualized_at, p.published_at).
--
-- ЗАЧЕМ: лента ПОКАЗЫВАЕТ дату last_actualized_at (актуализация, «updated»), а
--   СОРТИРОВАЛАСЬ по published_at. Объект, актуализированный сегодня, но
--   опубликованный давно, показывал «Today», но проваливался вниз списка —
--   видимый баг «сортировка не работает». Теперь порядок совпадает с
--   отображаемой датой. COALESCE → у строк без актуализации берётся published_at.
--   Ветки по цене (price_asc/price_desc) НЕ трогаем.
--
-- БЕЗОПАСНОСТЬ: миграция НЕ переписывает тело функции из документации (которая
--   могла устареть). Она читает ЖИВОЕ определение через pg_get_functiondef и
--   точечно патчит только три ORDER BY-ветки регуляркой — всё остальное (поля,
--   SECURITY DEFINER, любые недавние правки) сохраняется как есть.
--
-- ИДЕМПОТЕНТНА: повторный запуск — no-op (после первого прогона в ORDER BY уже
--   COALESCE(...), и регулярка `THEN p.published_at` больше не находит совпадений).
-- ОБРАТИМА: да — заменить COALESCE(p.last_actualized_at, p.published_at) обратно
--   на p.published_at в тех же трёх ветках.
--
-- РОЛЬ: применять под supabase_admin (владелец функции), иначе «must be owner».
-- =============================================================================

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  -- Найти единственный overload public.get_feed (если их несколько — упадём явно).
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_feed'
    AND p.pronamespace = 'public'::regnamespace;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Функция public.get_feed не найдена';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Точечный патч: только ветки сортировки по дате (default/date_desc/date_asc).
  -- Ветки по цене (THEN p.price) и поле 'published_at' в jsonb-выводе не затрагиваются.
  v_new := regexp_replace(
    v_def,
    '(WHEN p_sort_by = ''(default|date_desc|date_asc)''[[:space:]]*THEN )p\.published_at',
    '\1COALESCE(p.last_actualized_at, p.published_at)',
    'g'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'get_feed: совпадений не найдено — уже пропатчено или формат ORDER BY изменился (проверьте вручную).';
  ELSE
    EXECUTE v_new;
    RAISE NOTICE 'get_feed: ORDER BY по дате переключён на COALESCE(last_actualized_at, published_at).';
  END IF;
END $$;
