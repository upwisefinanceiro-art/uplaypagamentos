
UPDATE auth.users
SET email = 'herbertmaxx@gmail.com',
    encrypted_password = crypt('Uplay@2026', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '6e32fa3c-c89f-48b0-8e3c-b01d7479e3a1';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"herbertmaxx@gmail.com"'),
    updated_at = now()
WHERE user_id = '6e32fa3c-c89f-48b0-8e3c-b01d7479e3a1'
  AND provider = 'email';
