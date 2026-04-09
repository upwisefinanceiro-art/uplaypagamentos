
-- Fix 1: user_roles - Add SUPER_ADMIN exclusion to USING clause
DROP POLICY IF EXISTS "Admin Master can manage company roles" ON public.user_roles;

CREATE POLICY "Admin Master can manage company roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role <> 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM units
      WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role <> 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM units
      WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
);

-- Fix 2: Storage - Add company ownership check to company-logos policies
DROP POLICY IF EXISTS "Admin Master can upload company logos" ON storage.objects;
CREATE POLICY "Admin Master can upload company logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Admin Master can update company logos" ON storage.objects;
CREATE POLICY "Admin Master can update company logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Admin Master can delete company logos" ON storage.objects;
CREATE POLICY "Admin Master can delete company logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- Fix 3: Restrict Responsavel access to units - only allow non-sensitive columns via a safe view
-- Drop the overly permissive policy that exposes API keys to all authenticated users
DROP POLICY IF EXISTS "Responsavel can view own unit" ON public.units;

-- Create a new restrictive policy for Responsavel that only allows reading non-sensitive fields
-- Since RLS can't restrict columns, we use a view approach instead
-- Re-create units_public view to include status and company_id for app functionality
DROP VIEW IF EXISTS public.units_public;
CREATE VIEW public.units_public AS
SELECT id, name, active, status, company_id, address, cnpj, phone, created_at, updated_at
FROM public.units;

-- Grant access to the view for authenticated and anon roles
GRANT SELECT ON public.units_public TO authenticated;
GRANT SELECT ON public.units_public TO anon;
