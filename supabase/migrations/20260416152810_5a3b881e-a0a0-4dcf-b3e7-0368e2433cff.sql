
-- Drop the existing broad ALL policy for ADMIN_MASTER that allows any operation
-- and replace with more specific policies

-- First, remove the existing ADMIN_MASTER ALL policy
DROP POLICY IF EXISTS "Admin Master can manage company roles" ON public.user_roles;

-- Re-create ADMIN_MASTER policy for SELECT, INSERT, UPDATE, DELETE separately
-- ADMIN_MASTER can SELECT roles within their company
CREATE POLICY "Admin Master can view company roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role) 
  AND role <> 'SUPER_ADMIN'::app_role 
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
  )
);

-- ADMIN_MASTER can INSERT roles within their company (not SUPER_ADMIN)
CREATE POLICY "Admin Master can insert company roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role <> 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
  )
);

-- ADMIN_MASTER can UPDATE roles within their company (not SUPER_ADMIN)
CREATE POLICY "Admin Master can update company roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role <> 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role <> 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
  )
);

-- ADMIN_MASTER can DELETE roles within their company (not SUPER_ADMIN)
CREATE POLICY "Admin Master can delete company roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role <> 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
  )
);
