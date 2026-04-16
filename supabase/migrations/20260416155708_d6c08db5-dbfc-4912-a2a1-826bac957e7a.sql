
-- Fix 1: Make get_user_company_id deterministic by adding ORDER BY
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.company_id 
  FROM public.units u
  JOIN public.profiles p ON p.unit_id = u.id
  WHERE p.id = _user_id
  ORDER BY u.created_at ASC
  LIMIT 1
$$;

-- Fix 2: Prevent ADMIN_MASTER from assigning ADMIN_MASTER role (only SUPER_ADMIN can)
DROP POLICY IF EXISTS "Admin Master can insert company roles" ON public.user_roles;
CREATE POLICY "Admin Master can insert company roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role NOT IN ('SUPER_ADMIN'::app_role, 'ADMIN_MASTER'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Admin Master can update company roles" ON public.user_roles;
CREATE POLICY "Admin Master can update company roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role NOT IN ('SUPER_ADMIN'::app_role, 'ADMIN_MASTER'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role NOT IN ('SUPER_ADMIN'::app_role, 'ADMIN_MASTER'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Admin Master can delete company roles" ON public.user_roles;
CREATE POLICY "Admin Master can delete company roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role NOT IN ('SUPER_ADMIN'::app_role, 'ADMIN_MASTER'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
);
