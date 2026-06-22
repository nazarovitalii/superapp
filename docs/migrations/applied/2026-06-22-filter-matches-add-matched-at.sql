-- Стадия 3 (контракт realtime v5): filter_matches += matched_at.
-- Драйвит бейдж/жёлтый сохранённого фильтра (matched_at > shown_at). Применяет superApp
-- (один владелец процесса применения). matcher realtime проставляет matched_at на каждый матч/price_drop.
-- ⚠️ NOT NULL DEFAULT now() → существующим рядам проставится now() (разово «всё непросмотрено»,
--    пока юзеры не пролистают). Согласовано с realtime.
-- Реверс: ALTER TABLE public.filter_matches DROP COLUMN matched_at;
ALTER TABLE public.filter_matches
  ADD COLUMN IF NOT EXISTS matched_at timestamptz NOT NULL DEFAULT now();
