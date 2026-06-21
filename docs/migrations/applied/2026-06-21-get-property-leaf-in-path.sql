-- ============================================================================
-- Миграция: get_property — узел локации всегда в пути (location_full_path,
--           public_location_path)
--
-- ПРОБЛЕМА: путь «Расположение» собирается из колонок-предков локации
--   (city_id → community_id → sub_community_id → cluster_id → building_id), а САМ
--   узел добавляется только если его уровень = 'checkpoint'. Но путь строится для
--   узла ЛЮБОГО уровня:
--     • location_full_path  — по location_id (всегда лист: cluster/building/…)
--     • public_location_path — по public_location_id (бегунок приватности; может
--       указывать на НЕ-лист, напр. sub_community)
--   Колонки-предки заполнены непоследовательно:
--     building      → building_id = self  ⇒ узел попадает в путь ✅
--     checkpoint    → спец-условие THEN l.name ⇒ ✅
--     cluster       → cluster_id = NULL   ⇒ узел ТЕРЯЕТСЯ ❌
--     sub_community → sub_community_id = NULL ⇒ узел ТЕРЯЕТСЯ ❌
--   Пример (Golf Horizon листинг eae23576):
--     location_id        = «Golf Horizon Tower A» (cluster)       → видел владелец
--     public_location_id = «Golf Horizon»          (sub_community) → видели все
--     Владелец: «Dubai > DAMAC Hills > Golf Horizon»     (потерян кластер)
--     Все:      «Dubai > DAMAC Hills»                    (потеряно под-комьюнити)
--
-- ПОЧЕМУ НЕ is_leaf: гейт «добавлять, если is_leaf» ломается дважды:
--     1) публичный узел может быть НЕ листом (Golf Horizon is_leaf=false) — не
--        добавился бы → «что видят все» осталось бы сломанным;
--     2) building-лист имеет building_id=self и уже в пути через колонку building
--        → is_leaf добавил бы дубль «… > Tara Park > Tara Park».
--
-- ФИКС: добавлять имя самого узла ВСЕГДА, кроме единственного случая самоссылки
--   building_id = id (только building дублируется через свою колонку):
--     CASE WHEN l.building_id = l.id THEN NULL ELSE l.name END
--   building → building_id=id ⇒ NULL ⇒ не дублируем (уже в loc_building)
--   cluster/sub_community/checkpoint → building_id ≠ id (или NULL) ⇒ добавляем имя
--   После фикса:
--     Владелец: «Dubai > DAMAC Hills > Golf Horizon > Golf Horizon Tower A»
--     Все:      «Dubai > DAMAC Hills > Golf Horizon»
--
-- staleness-proof: патчим живое тело pg_get_functiondef; guard на не-совпадение
--   (RAISE NOTICE) и идемпотентность (position 'building_id = l.id').
-- ОБРАТИМО: вернуть прежнее тело get_property (спец-условие 'checkpoint').
-- ПРИМЕНЯТЬ под ролью supabase_admin (не postgres — иначе must be owner).
-- ============================================================================

DO $$
DECLARE
  def     text;
  new_def text;
BEGIN
  def := pg_get_functiondef(
    'public.get_property(uuid, uuid)'::regprocedure
  );

  IF position('building_id = l.id' in def) > 0 THEN
    RAISE NOTICE 'узел-в-пути уже есть в get_property — пропуск';
    RETURN;
  END IF;

  -- 1) Путь владельца (location_full_path), алиас l
  new_def := regexp_replace(
    def,
    'WHEN l\.level = ''checkpoint'' THEN l\.name ELSE NULL END',
    'WHEN l.building_id = l.id THEN NULL ELSE l.name END',
    'g'
  );

  -- 2) Slider-путь (public_location_path), алиас pl
  new_def := regexp_replace(
    new_def,
    'WHEN pl\.level = ''checkpoint'' THEN pl\.name ELSE NULL END',
    'WHEN pl.building_id = pl.id THEN NULL ELSE pl.name END',
    'g'
  );

  IF new_def = def THEN
    RAISE NOTICE 'якорь "checkpoint THEN name" не найден — формат get_property изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения):
--   SELECT get_property('eae23576-f522-4870-9466-e5699468007f', NULL)
--          -> 'location_full_path';   -- ожид. «...Golf Horizon > Golf Horizon Tower A»
--   SELECT get_property('eae23576-f522-4870-9466-e5699468007f', NULL)
--          -> 'public_location_path'; -- ожид. «Dubai > DAMAC Hills > Golf Horizon»
--
-- ОТКАТ: вернуть прежнее тело get_property (спец-условие 'checkpoint').
-- ============================================================================
