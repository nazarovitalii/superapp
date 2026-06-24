-- WP-M (Task 2 companion): RLS-политики UPDATE/DELETE на public.property_photos.
-- ПРИЧИНА: на таблице RLS включён, но политики были только INSERT + SELECT (photos_insert/
--   photos_select). Поэтому owner НЕ мог менять order_index (reorder) или удалять строку фото
--   (deletePhoto) с клиента — UPDATE/DELETE без политики молча затрагивают 0 строк.
--   Подтверждено интроспекцией прод-БД 2026-06-24 (pg_policies: только INSERT/SELECT).
-- ЧТО: owner-scoped политики UPDATE и DELETE — менять/удалять можно только фото СВОИХ объектов
--   (тот же owner-чек, что в storage-политике property_photos_modify). Storage-DELETE уже
--   защищён той политикой; здесь закрываем строку в таблице.
-- БЕЗОПАСНОСТЬ: доступ строго по owner_id = auth.uid() через EXISTS к properties. anon — нет.
-- ИЗМЕНЕНИЯ ДАННЫХ: нет. Идемпотентно (DROP POLICY IF EXISTS перед CREATE). ОБРАТИМО (внизу).
-- Применять под supabase_admin.

DROP POLICY IF EXISTS photos_update ON public.property_photos;
CREATE POLICY photos_update ON public.property_photos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_photos.property_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_photos.property_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_delete ON public.property_photos;
CREATE POLICY photos_delete ON public.property_photos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_photos.property_id
        AND p.owner_id = auth.uid()
    )
  );

-- ОТКАТ:
--   DROP POLICY IF EXISTS photos_update ON public.property_photos;
--   DROP POLICY IF EXISTS photos_delete ON public.property_photos;
