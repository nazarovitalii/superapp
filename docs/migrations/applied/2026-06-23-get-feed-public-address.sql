-- get_feed: вернуть публичный адрес (public_location_name / public_community_name).
-- Модель приватности (бегунок add-property): public_location_id = NULL → owner раскрыл
-- ПОЛНЫЙ адрес (дефолт бегунка = leaf); заданный = owner скрыл точность до этого уровня.
-- Поэтому COALESCE(public-локация, полная локация): null → полный (как видит owner),
-- задан → урезанный уровень. Без этого лента (feed-address.util не падает в location_name)
-- показывала друзьям только community — «адрес поломан». property-detail уже корректен.
--
-- Сигнатура НЕ меняется (additive: +2 LEFT JOIN, +2 jsonb-ключа) → патчим ТЕЛО через
-- pg_get_functiondef + regexp (staleness-proof, как session 5/re-notify). EXECUTE даёт
-- CREATE OR REPLACE → GRANT'ы сохраняются. Применять под supabase_admin, в транзакции.
-- ОТКАТ: применить applied/2026-06-23-get-feed-scope-rework.sql (тело без public-полей).
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

  -- идемпотентность: уже добавлено
  IF position('public_location_name' in v_def) > 0 THEN
    RAISE NOTICE 'get_feed public-address: уже применено — пропускаю';
    RETURN;
  END IF;

  -- guard: ожидаем SC-тело (единый CTE base) с якорями community_name и agent_badge join
  IF position('LEFT JOIN agent_badge ab ON ab.user_id = p.owner_id' in v_def) = 0
     OR position('''community_name''' in v_def) = 0 THEN
    RAISE EXCEPTION 'get_feed: якоря (agent_badge join / community_name) не найдены — патч прерван';
  END IF;

  -- 1) jsonb: после строки community_name добавить public_location_name / public_community_name
  v_new := regexp_replace(
    v_def,
    E'(''community_name''[[:space:]]*,[[:space:]]*lc\\.name[[:space:]]*,)',
    E'\\1\n            ''public_location_name'', COALESCE(pl.name, l.name),\n            ''public_community_name'', COALESCE(plc.name, lc.name),'
  );

  -- 2) FROM: после agent_badge доджойнить публичную локацию и её community
  v_new := regexp_replace(
    v_new,
    E'(LEFT JOIN agent_badge ab ON ab\\.user_id = p\\.owner_id)',
    E'\\1\n  LEFT JOIN locations pl  ON pl.id  = p.public_location_id\n  LEFT JOIN locations plc ON plc.id = pl.community_id'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'get_feed: замены не произошли — якоря не совпали (тело изменилось)';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'get_feed: public_location_name/public_community_name добавлены';
END
$migrate$;
