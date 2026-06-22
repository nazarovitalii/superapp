-- ============================================================================
-- Миграция: get_property — устранить ДУБЛЬ последнего узла в пути локации
--           (location_full_path, public_location_path).
--
-- ПРОБЛЕМА (репорт создателя):
--   «Dubai > DAMAC Hills > The Park Villas > Trinity > Trinity»   (дубль Trinity)
--   «Dubai > DAMAC Hills > The Park Villas > The Park Villas»     (дубль The Park Villas)
--
-- ПРИЧИНА: путь собирается из колонок-предков (community → sub_community → cluster →
--   building), затем правилом «лист всегда» добавляется имя самого узла:
--     CASE WHEN l.building_id = l.id THEN NULL ELSE l.name END   (фикс leaf-in-path)
--   Это исключало дубль ТОЛЬКО для building (building_id=self). Но в данных
--   САМОССЫЛОЧНЫМИ бывают и другие уровни (колонки-предки непоследовательны):
--     • Trinity        — level=cluster,        cluster_id = id  ⇒ узел уже в пути через
--       колонку cluster, а правило листа добавляет его второй раз → дубль.
--     • The Park Villas — level=sub_community,  sub_community_id = id ⇒ то же через sub_community.
--   (Проверено: SELECT id=cluster_id / id=sub_community_id для этих локаций = true.)
--
-- ФИКС: исключать имя листа, если узел самоссылочен в ЛЮБОЙ из колонок-предков, по
--   которым строится путь (он уже добавлен через эту колонку):
--     CASE WHEN l.id IN (l.community_id, l.sub_community_id, l.cluster_id, l.building_id)
--          THEN NULL ELSE l.name END
--   building/cluster/sub_community/community с self-ref → NULL (не дублируем);
--   настоящий лист (его уровень-колонка NULL или указывает на реального предка) →
--   имя добавляется (сохраняем поведение leaf-in-path, узел не теряется).
--
-- После фикса:
--   «… > The Park Villas > Trinity»            (Trinity один раз)
--   «… > DAMAC Hills > The Park Villas»         (The Park Villas один раз)
--
-- staleness-proof: патчим живое тело pg_get_functiondef; guard на идемпотентность
--   (position 'IN (l.community_id') и на не-совпадение якоря (RAISE NOTICE).
-- ОБРАТИМО: вернуть прежнее условие (только building_id = id).
-- ПРИМЕНЯТЬ под supabase_admin (tools/apply-migration.sh).
-- ============================================================================

DO $$
DECLARE
  def     text;
  new_def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid, uuid)'::regprocedure);

  IF position('IN (l.community_id, l.sub_community_id' in def) > 0 THEN
    RAISE NOTICE 'дедуп самоссылки уже есть в get_property — пропуск';
    RETURN;
  END IF;

  -- 1) Путь владельца (location_full_path), алиас l
  new_def := replace(
    def,
    'CASE WHEN l.building_id = l.id THEN NULL ELSE l.name END',
    'CASE WHEN l.id IN (l.community_id, l.sub_community_id, l.cluster_id, l.building_id) THEN NULL ELSE l.name END'
  );

  -- 2) Slider-путь (public_location_path), алиас pl
  new_def := replace(
    new_def,
    'CASE WHEN pl.building_id = pl.id THEN NULL ELSE pl.name END',
    'CASE WHEN pl.id IN (pl.community_id, pl.sub_community_id, pl.cluster_id, pl.building_id) THEN NULL ELSE pl.name END'
  );

  IF new_def = def THEN
    RAISE NOTICE 'якорь "building_id = id THEN name" не найден — формат get_property изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения), на листинге в Trinity / The Park Villas:
--   SELECT get_property('<property_id>', NULL) -> 'location_full_path';
--     ожид. «… > The Park Villas > Trinity» (без дубля)
--   Или напрямую проверить, что у self-ref узлов имя не дублируется.
-- ОТКАТ: вернуть условие 'CASE WHEN l.building_id = l.id THEN NULL ELSE l.name END' (и pl).
-- ============================================================================
