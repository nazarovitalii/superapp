-- Создание тестового пользователя #2 для кросс-юзерного тестирования матчинга.
-- Email: test2@mrsqm.dev | Password: MrSQM2025 (временный, только dev)
-- UUID фиксирован — удобно для FK в тестах: b0000002-0000-0000-0000-000000000002

DO $$
DECLARE
  new_uid uuid := 'b0000002-0000-0000-0000-000000000002';
BEGIN
  -- 1. auth.users (email/password auth, тот же provider что у остальных)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_uid,
    'authenticated', 'authenticated',
    'test2@mrsqm.dev',
    crypt('MrSQM2025', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. public.users (профиль агента)
  INSERT INTO public.users (
    id, email, full_name, telegram_id, role, is_active, created_at, updated_at
  ) VALUES (
    new_uid,
    'test2@mrsqm.dev',
    'Тест Агент 2',
    999000002,
    'agent',
    true,
    now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Тест-юзер создан: test2@mrsqm.dev / MrSQM2025 (uuid: %)', new_uid;
END $$;
