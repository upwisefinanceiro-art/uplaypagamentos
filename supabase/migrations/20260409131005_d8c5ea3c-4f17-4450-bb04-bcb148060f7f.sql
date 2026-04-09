
-- Fix the security definer view warning
ALTER VIEW public.units_public SET (security_invoker = true);

-- Since the view now uses security_invoker, we need a policy for non-admin users to read units through the view
-- Add a restrictive Responsavel policy that only allows SELECT on the units table (view will filter columns)
CREATE POLICY "Responsavel can view own unit limited"
ON public.units
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'RESPONSAVEL'::app_role)
  AND id = get_user_unit_id(auth.uid())
);
