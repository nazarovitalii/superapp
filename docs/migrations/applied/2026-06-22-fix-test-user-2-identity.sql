-- Добавляем запись в auth.identities для test2@mrsqm.dev.
-- GoTrue требует identity-запись для email-провайдера, иначе signInWithPassword падает.

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'b0000002-0000-0000-0000-000000000002',
  'b0000002-0000-0000-0000-000000000002',
  'email',
  '{"sub":"b0000002-0000-0000-0000-000000000002","email":"test2@mrsqm.dev","email_verified":true,"phone_verified":false}',
  now(), now(), now()
)
ON CONFLICT DO NOTHING;
