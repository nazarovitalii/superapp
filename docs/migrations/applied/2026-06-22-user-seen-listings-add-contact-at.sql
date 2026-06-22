-- Стадия 2: сильнейший сигнал воронки «нажал контакт WA/TG».
-- Аддитивно, идемпотентно. Драйвит seen_contact.
ALTER TABLE public.user_seen_listings
  ADD COLUMN IF NOT EXISTS contact_at timestamptz;
