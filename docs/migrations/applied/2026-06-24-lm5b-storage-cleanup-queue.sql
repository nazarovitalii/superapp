-- LM Task 5b (часть 1/2) — durable-захват осиротевших файлов Storage при удалении объекта.
-- Все файлы объекта лежат под префиксом '{property_id}/' в бакете property_photos
--   ('{id}/0_full.webp', '{id}/0_thumb.webp', '{id}/fp_0_full.webp' …) → чистим ПО ПРЕФИКСУ.
-- Очередь + триггер захватывают префикс в транзакции удаления → ничего не теряется при краше.
-- ДРЕНЕР (физическое удаление файлов) — отдельная единица: инфра-развилка (см. ниже), т.к.
--   Vault пуст (нет service-role key) и net.http_delete без body (delete-by-prefix невозможен).
-- Применение НЕ деструктивно. Идемпотентно. ОБРАТИМО: DROP TRIGGER/FUNCTION/TABLE (внизу).
--
-- ДРЕНЕР — варианты (требуют решения создателя):
--   (A) service-role key в Vault → pg_cron-функция: per-key net.http_delete('/object/property_photos/'||key,
--       headers '{Authorization: Bearer <key>}'); ключи из storage.objects по префиксу. Полностью DB-side.
--   (B) внешний воркер (realtime, у него уже есть service-key) дренит storage_cleanup_queue. Cross-repo.

CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
  id          bigserial PRIMARY KEY,
  prefix      text NOT NULL,              -- '{property_id}/'
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  attempts    int NOT NULL DEFAULT 0,
  last_error  text
);
ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_cleanup_queue FROM anon, authenticated;

-- Enqueue при любом удалении объекта (через delete_property или иначе).
CREATE OR REPLACE FUNCTION public.enqueue_storage_cleanup()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO storage_cleanup_queue (prefix) VALUES (OLD.id::text || '/');
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enqueue_storage_cleanup ON public.properties;
CREATE TRIGGER trg_enqueue_storage_cleanup
  AFTER DELETE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_storage_cleanup();

-- ============================================================================
-- ОТКАТ:
--   DROP TRIGGER IF EXISTS trg_enqueue_storage_cleanup ON public.properties;
--   DROP FUNCTION IF EXISTS public.enqueue_storage_cleanup();
--   DROP TABLE IF EXISTS public.storage_cleanup_queue;
-- ============================================================================
