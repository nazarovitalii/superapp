-- Стадия 1 (unseen-трекинг): снять NOT NULL с user_seen_listings.seen_at.
-- Зачем: модель требует строку «показан, но не открыт» (shown_at задан, seen_at IS NULL).
--   Сейчас seen_at NOT NULL только потому, что строки раньше создавались ИСКЛЮЧИТЕЛЬНО при
--   открытии карточки (track_view). Новый bulk-RPC mark_listings_shown создаёт строки только
--   с shown_at (impression без открытия) → seen_at обязан быть nullable.
--   Воронка владельца seen_full = COUNT(... WHERE seen_at IS NOT NULL) тоже подразумевает null.
-- Обратимо/безопасно: существующие строки имеют seen_at; ограничение лишь ОСЛАБЛЯЕТСЯ
--   (backward-compatible). Идемпотентно: DROP NOT NULL на уже-nullable колонке — no-op.
-- ВАЖНО: применять ПЕРЕД mark_listings_shown.
ALTER TABLE public.user_seen_listings
  ALTER COLUMN seen_at DROP NOT NULL;
