-- Bug 3 (колокол): создание первого фильтра у нового юзера зажигает колокол на ВСЕ ранее
-- существовавшие подходящие объекты (матчер бэкфиллит filter_matches с matched_at≈now() при
-- создании фильтра; bell_seen_at нового юзера = -infinity → всё считается новым).
-- Правило создателя: уведомлять только по объектам, созданным/обновлённым ПОСЛЕ создания фильтра.
-- Фикс: floor «объект новее сматчившего фильтра» — GREATEST(p.created_at, p.updated_at) > sf.created_at —
-- в счётчик bell_unseen и в выборку дропдауна. Bell-курсор (matched_at > bell_seen_at) НЕ трогается.
-- Единое определение «новизны» с unseen_count (Миграция 1) и is_unseen (Миграция 2).
--
-- Staleness-proof: три одно-строчных уникальных якоря в живом теле get_bell. Сигнатура не меняется
-- → CREATE OR REPLACE из pg_get_functiondef. Применять под supabase_admin. Идемпотентно.
DO $migrate$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  WHERE p.proname = 'get_bell' AND p.pronamespace = 'public'::regnamespace;

  v_def := pg_get_functiondef(v_oid);

  IF position('filter_created_at' in v_def) > 0 THEN
    RAISE NOTICE 'get_bell floor: уже применено — пропускаю';
    RETURN;
  END IF;

  v_new := v_def;

  -- (1) Протащить created_at сматчившего фильтра в CTE per_property.
  v_new := replace(v_new,
    'fm.property_id, fm.filter_id, fm.match_type, fm.matched_at',
    'fm.property_id, fm.filter_id, fm.match_type, fm.matched_at, sf.created_at AS filter_created_at');

  -- (2) Floor в счётчик bell_unseen.
  v_new := replace(v_new,
    'WHERE pp.matched_at > bcur.seen_at AND p.status = ''active''), 100)',
    'WHERE pp.matched_at > bcur.seen_at AND p.status = ''active'' AND GREATEST(p.created_at, p.updated_at) > pp.filter_created_at), 100)');

  -- (3) Floor в выборку дропдауна.
  v_new := replace(v_new,
    'AND (p_before IS NULL OR pp.matched_at < p_before)',
    'AND (p_before IS NULL OR pp.matched_at < p_before) AND GREATEST(p.created_at, p.updated_at) > pp.filter_created_at');

  -- Все три якоря обязаны были сработать: filter_created_at должен появиться РОВНО 3 раза
  -- (1 определение в CTE + 2 использования во floor).
  IF (length(v_new) - length(replace(v_new, 'filter_created_at', '')))
       / length('filter_created_at') <> 3 THEN
    RAISE EXCEPTION 'get_bell: один из трёх якорей не сработал (filter_created_at != 3 вхождений) — тело изменилось, патч прерван';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_bell: добавлен floor sf.created_at в bell_unseen и дропдаун (Bug 3)';
END
$migrate$;
