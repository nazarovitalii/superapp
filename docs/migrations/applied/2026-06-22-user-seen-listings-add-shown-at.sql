-- Стадия 1: слабый частый сигнал «показан в ленте» (impression).
-- Аддитивно, идемпотентно — чтобы не конфликтовать с realtime-стороной
-- (ТЗ относит DDL этой колонки к их стороне; кто первый — тот добавил).
ALTER TABLE public.user_seen_listings
  ADD COLUMN IF NOT EXISTS shown_at timestamptz;
