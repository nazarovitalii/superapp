-- ============================================================================
-- AP-2 (серверный скоуп уточнения адреса): новая функция search_in_scope
-- ----------------------------------------------------------------------------
-- ЧТО: НОВАЯ функция public.search_in_scope(p_query, p_within_id, p_limit) —
--   ищет локации ТОЛЬКО среди потомков узла p_within_id (по подстроке имени/алиаса).
--   Узел-предок задаётся id; потомком считается любая локация, у которой p_within_id
--   встречается в одном из FK-предков (city_id/community_id/sub_community_id/cluster_id/
--   building_id) и которая не равна самому узлу. Уровень узла знать не нужно —
--   фильтр универсален: выбрал Damac Hills (community) → только его потомки; выбрал
--   Golf Town (sub_community/cluster) → только то, что ниже Golf Town.
-- ЗАЧЕМ: на шаге «Уточните адрес» искать строго в пределах выбранного узла, а не брать
--   топ-N по всему Дубаю и фильтровать на клиенте (из-за чего «Vista» не находила
--   «Golf Vista» при маленьком лимите). Это замена клиентского обхода (p_limit=50).
-- ФОРМАТ ОТВЕТА: как у search_locations mode='search' —
--   { mode, query, count, results:[{id,name,level,community_name,city_name,
--     stats_listings,is_popular}] } — клиент использует тот же тип LocationSearchItem.
-- БЕЗОПАСНО / ОБРАТИМО:
--   • search_locations НЕ трогается (отдельная функция) → нулевой риск регресса каскада.
--   • Идемпотентно: CREATE OR REPLACE + GRANT. Откат: DROP FUNCTION public.search_in_scope(text,uuid,integer);
--   • STABLE, НЕ SECURITY DEFINER (как search_locations) — читает только публичные
--     справочные locations под привилегиями вызывающего (anon уже их читает).
--   • Только справочник locations (MrSQM/общий) — чужие таблицы (bayut_*) не затронуты.
-- РОЛЬ ПРИМЕНЕНИЯ: supabase_admin (Studio SQL Editor).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_in_scope(
  p_query     text,
  p_within_id uuid,
  p_limit     integer DEFAULT 50
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_q      text;
  v_result jsonb;
BEGIN
  -- Валидация: нужен узел-предок и запрос ≥2 символов.
  IF p_within_id IS NULL OR p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('mode', 'scope', 'query', p_query, 'count', 0,
                              'results', '[]'::jsonb);
  END IF;

  v_q := lower(trim(p_query));

  SELECT jsonb_build_object(
    'mode',    'scope',
    'query',   p_query,
    'count',   count(*),
    'results', COALESCE(jsonb_agg(sub.item ORDER BY sub.score DESC), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'id',             l.id,
        'name',           l.name,
        'level',          l.level,
        'community_name', c.name,
        'city_name',      ci.name,
        'stats_listings', COALESCE(l.stats_listings, 0),
        'is_popular',     COALESCE(l.is_popular, false)
      ) AS item,
      (
        CASE
          WHEN lower(l.name) = v_q                       THEN 100
          WHEN lower(l.name) LIKE v_q || '%'             THEN 80
          WHEN lower(l.name) LIKE '%' || v_q || '%'      THEN 60
          ELSE 0
        END
        + CASE WHEN EXISTS (
            SELECT 1 FROM unnest(l.aliases) a WHERE lower(a) LIKE '%' || v_q || '%'
          ) THEN 50 ELSE 0 END
        + CASE l.level
            WHEN 'sub_community' THEN 4
            WHEN 'cluster'       THEN 3
            WHEN 'building'       THEN 2
            WHEN 'checkpoint'     THEN 1
            ELSE 0
          END
      ) AS score
    FROM locations l
    LEFT JOIN locations c  ON c.id  = l.community_id
    LEFT JOIN locations ci ON ci.id = l.city_id
    WHERE l.is_active = true
      -- Потомок узла p_within_id (на любом уровне ниже), но не сам узел.
      AND l.id <> p_within_id
      AND p_within_id IN (l.city_id, l.community_id, l.sub_community_id,
                          l.cluster_id, l.building_id)
      -- Совпадение по имени или алиасу (подстрока).
      AND (
        lower(l.name) LIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(l.aliases) a WHERE lower(a) LIKE '%' || v_q || '%'
        )
      )
    ORDER BY score DESC
    LIMIT p_limit
  ) sub
  WHERE sub.score > 0;

  RETURN v_result;
END;
$function$;

-- Доступ для клиента (anon-ключ) и серверных ролей.
GRANT EXECUTE ON FUNCTION public.search_in_scope(text, uuid, integer)
  TO anon, authenticated, service_role;
