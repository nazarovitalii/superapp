-- ============================================================================
-- P-5b: фото объектов (Supabase Storage + RLS)
-- ----------------------------------------------------------------------------
-- ЧТО:
--   1) Storage-бакет `property_photos` (public — фото листингов видны по URL).
--   2) RLS на storage.objects (scoped по bucket_id='property_photos'):
--      - INSERT/UPDATE/DELETE: только владелец объекта (папка = id его property).
--      - SELECT: публично (бакет public; политика для совместимости).
--   3) RLS-политика SELECT на public.property_photos (читать фото видимых объектов).
--   4) CHECK property_photos.photo_type → согласованный набор значений.
-- ЗАЧЕМ: загрузка фото в форме добавления + показ в ленте/карточке.
-- ОБРАТИМО: да (DROP POLICY / DROP BUCKET). property_photos пустая (парсеры
--           пишут в unit_photos), таблица — только MrSQM, кросс-продукт не задет.
-- НАРЕЗКА: в браузере (thumb ~400px + full ~1600px, WebP); сервер не режет.
-- ПУТЬ В БАКЕТЕ: `<property_id>/<index>_full.webp` и `<index>_thumb.webp`.
-- ============================================================================

-- 1) Бакет (public). file_size_limit 5 МБ, только картинки.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property_photos', 'property_photos', true, 5242880,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) RLS storage.objects — заливать/менять/удалять может только владелец property,
--    id которого = первая часть пути (папка). storage.foldername(name)[1] = property_id.
DROP POLICY IF EXISTS property_photos_insert ON storage.objects;
CREATE POLICY property_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property_photos'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS property_photos_modify ON storage.objects;
CREATE POLICY property_photos_modify ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property_photos'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS property_photos_read ON storage.objects;
CREATE POLICY property_photos_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'property_photos');

-- 3) SELECT на таблице property_photos: видно фото тех объектов, что видны юзеру.
--    Вложенный SELECT к properties сам под RLS (properties_select) → автоматически
--    ограничивает по visibility/owner. Так не дублируем логику видимости.
DROP POLICY IF EXISTS photos_select ON public.property_photos;
CREATE POLICY photos_select ON public.property_photos
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_photos.property_id
    )
  );

-- 4) CHECK photo_type (таблица пустая → пересоздание безопасно).
ALTER TABLE public.property_photos
  DROP CONSTRAINT IF EXISTS property_photos_photo_type_check;
ALTER TABLE public.property_photos
  ADD CONSTRAINT property_photos_photo_type_check
  CHECK (photo_type IN ('gallery', 'primary', 'floor_plan', 'exterior', 'interior'));
