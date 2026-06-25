-- SP-B (аддитивно): поля Form A/договора, приватный бакет, RLS, get_property → form_a + is_exclusive.
-- Без RPC, без DROP (старые title_deed-колонки убираются отдельной уборкой). property_form_a пуст → безопасно.
-- Обратимо: колонки/политики/бакет дропаются; get_property можно вернуть из git.

-- 1) Колонки
ALTER TABLE public.property_form_a ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE public.property_form_a ADD COLUMN IF NOT EXISTS pdf_password text;
ALTER TABLE public.properties      ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false;

-- 2) RLS таблицы property_form_a — insert-only история: владелец СВОЕГО объекта только
--    читает и создаёт строки. UPDATE/DELETE с клиента НЕ даём (строки неизменяемы и не
--    удаляются — копятся как история; модерация пишет под service_role, минуя RLS).
--    Это закрывает re-parent-дыру (UPDATE SET property_id=<чужой>) на корню, а не латает её.
ALTER TABLE public.property_form_a ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS form_a_owner_select ON public.property_form_a;
DROP POLICY IF EXISTS form_a_owner_insert ON public.property_form_a;
DROP POLICY IF EXISTS form_a_owner_update ON public.property_form_a;
DROP POLICY IF EXISTS form_a_owner_delete ON public.property_form_a;
CREATE POLICY form_a_owner_select ON public.property_form_a FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid()));
CREATE POLICY form_a_owner_insert ON public.property_form_a FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid()));

-- 3) Приватный бакет под Form A PDF (НЕ public, только PDF, 20 МБ).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property_form_a', 'property_form_a', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) RLS storage.objects для бакета: владелец только ЗАГРУЖАЕТ свой PDF (путь {owner_id}/...).
--    Чтения/замены/удаления с клиента НЕТ (панель файл не показывает; PDF — неизменяемый юр-документ);
--    модератор читает под service_role (минуя RLS). FOR INSERT, не FOR ALL — по фактической потребности.
DROP POLICY IF EXISTS form_a_obj_owner_all ON storage.objects;
DROP POLICY IF EXISTS form_a_obj_owner_insert ON storage.objects;
CREATE POLICY form_a_obj_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property_form_a' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5) Патч get_property (staleness-proof): добавить is_exclusive + form_a (массив строк, без файла/пароля).
--    Тело берётся из ЖИВОЙ БД; regexp учитывает выравнивание пробелами; guard «якорь не найден».
DO $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.get_property'::regproc);
  -- идемпотентность: если тело уже содержит ключ 'is_exclusive' — патч уже наложен, выходим.
  IF position('''is_exclusive''' IN v_def) > 0 THEN
    RAISE NOTICE 'get_property уже пропатчен (is_exclusive присутствует) — пропуск';
    RETURN;
  END IF;
  IF position('''is_vastu''' IN v_def) = 0 OR position('''developer_name_ref''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'get_property: якорь не найден — патч прерван';
  END IF;
  v_def := regexp_replace(
    v_def,
    '(''is_vastu'',\s+p\.is_vastu,)',
    '\1' || E'\n      ''is_exclusive'',         p.is_exclusive,',
    'g'
  );
  v_def := regexp_replace(
    v_def,
    '(''developer_name_ref'',\s+d\.name,)',
    E'''form_a'', (SELECT COALESCE(jsonb_agg(jsonb_build_object('
      || '''contract_number'', fa.contract_number, ''listing_start'', fa.listing_start, '
      || '''listing_end'', fa.listing_end, ''approved_at'', fa.approved_at, '
      || '''moderation_note'', fa.moderation_note) ORDER BY fa.uploaded_at DESC), ''[]''::jsonb) '
      || 'FROM public.property_form_a fa WHERE fa.property_id = p.id),'
      || E'\n      ' || '\1',
    'g'
  );
  EXECUTE v_def;
END $patch$;
