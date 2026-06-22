-- ============================================================================
-- 2026-06-22-get-saved-filters-unseen-active-only.sql  (RT-4)
--
-- ЧТО: unseen_count в get_saved_filters считает filter_matches БЕЗ учёта статуса объекта →
--   проданный/архивный объект (status != 'active') навсегда залипает в бейдже непросмотренных
--   (юзер не «погасит» его скроллом, т.к. неактивные не показываются в ленте фильтра).
-- ФИКС: во внутренний подзапрос unseen_count добавить
--   JOIN properties p ON p.id = fm.property_id AND p.status = 'active'
--   → бейдж считает только живые объявления, 1:1 с тем, что юзер увидит в ленте.
-- ЗАЧЕМ: read-side баг RT-4 (обещано realtime 2026-06-22; их сторона — опц. GC filter_matches).
--
-- КАК: staleness-proof патч — regexp по ЖИВОМУ pg_get_functiondef (НЕ переписываем тело из доков),
--   RAISE если якорь не найден, NOTICE-скип если уже применено. Сигнатура не меняется.
-- ОБРАТИМО: да — убрать JOIN тем же приёмом (или CREATE OR REPLACE из applied-копии).
-- ИДЕМПОТЕНТНО: да (проверка ALREADY_PATCHED).
-- Применять под supabase_admin.
-- ============================================================================

DO $migrate$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.get_saved_filters'::regproc);

  IF position('JOIN properties p ON p.id = fm.property_id' in v_def) > 0 THEN
    RAISE NOTICE 'RT-4: уже применено (JOIN присутствует) — пропускаю';
  ELSIF position('FROM filter_matches fm WHERE fm.filter_id = sf.id' in v_def) = 0 THEN
    RAISE EXCEPTION 'RT-4: якорь не найден — тело get_saved_filters изменилось, патч прерван';
  ELSE
    v_new := replace(
      v_def,
      'FROM filter_matches fm WHERE fm.filter_id = sf.id',
      'FROM filter_matches fm JOIN properties p ON p.id = fm.property_id AND p.status = ''active'' WHERE fm.filter_id = sf.id'
    );
    EXECUTE v_new;
    RAISE NOTICE 'RT-4: get_saved_filters пропатчен — unseen_count теперь только active';
  END IF;
END
$migrate$;
