-- Баг B: бейдж фильтра отвязываем от глобального shown_at. Эта таблица хранит,
-- какие объекты юзер видел В КОНТЕКСТЕ конкретного фильтра. Отдельная от filter_matches
-- (та — realtime, перезаливается при DLQ re-enqueue → seen-состояние терялось бы).
-- Идемпотентно. RLS: юзер видит/пишет только свои строки.
CREATE TABLE IF NOT EXISTS public.user_filter_seen (
  user_id     uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  filter_id   uuid        NOT NULL REFERENCES public.saved_filters(id) ON DELETE CASCADE,
  property_id uuid        NOT NULL REFERENCES public.properties(id)  ON DELETE CASCADE,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, filter_id, property_id)
);

-- Индекс под предикат бейджа (фильтр + объект для NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_user_filter_seen_filter_prop
  ON public.user_filter_seen (filter_id, property_id);

ALTER TABLE public.user_filter_seen ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_filter_seen' AND policyname='ufs_select_own'
  ) THEN
    CREATE POLICY ufs_select_own ON public.user_filter_seen
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_filter_seen' AND policyname='ufs_insert_own'
  ) THEN
    CREATE POLICY ufs_insert_own ON public.user_filter_seen
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END
$rls$;

GRANT SELECT, INSERT ON public.user_filter_seen TO authenticated;
