-- LM-3: колонка rejection_reason + owner-гейт в get_property.
-- Пишет колонку модератор Админки (cross-repo); мы добавляем + читаем.
-- ОБРАТИМО: DROP COLUMN + восстановление прежнего тела get_property из бэкапа (внизу).

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Патч get_property: owner-gated rejection_reason после каждого 'status', p.status,
-- (несколько json-веток; v_current_user_id виден во всей функции). regexp по гибкому пробелу.
DO $do$
DECLARE
  v_src text := pg_get_functiondef('public.get_property(uuid, uuid)'::regprocedure);
  v_new text;
BEGIN
  v_new := regexp_replace(
    v_src,
    '(''status'',\s*p\.status,)',
    E'\\1\n      ''rejection_reason'', CASE WHEN p.owner_id = v_current_user_id THEN p.rejection_reason ELSE NULL END,',
    'g'
  );
  IF v_new = v_src THEN
    RAISE EXCEPTION 'anchor ''status'', p.status, не найден — тело get_property изменилось, патч прерван';
  END IF;
  EXECUTE v_new;  -- pg_get_functiondef уже валиден (CREATE OR REPLACE ...), ; не нужен внутри EXECUTE
END
$do$;

-- ============================================================================
-- ОТКАТ:
--   ALTER TABLE public.properties DROP COLUMN IF EXISTS rejection_reason;
--   -- get_property: восстановить из бэкапа pg_get_functiondef ДО патча.
-- ============================================================================
