ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS address text;

UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE au.id = p.id
  AND (p.email IS NULL OR p.email = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admin Unidade can update unit profiles'
  ) THEN
    CREATE POLICY "Admin Unidade can update unit profiles"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
      has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
      AND unit_id = get_user_unit_id(auth.uid())
    )
    WITH CHECK (
      has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
      AND unit_id = get_user_unit_id(auth.uid())
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Admin Unidade can view unit roles'
  ) THEN
    CREATE POLICY "Admin Unidade can view unit roles"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (
      has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = user_roles.user_id
          AND p.unit_id = get_user_unit_id(auth.uid())
      )
    );
  END IF;
END $$;