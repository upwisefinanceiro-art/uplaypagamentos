
-- Remove the Responsavel policy that re-exposes all columns
DROP POLICY IF EXISTS "Responsavel can view own unit limited" ON public.units;

-- Set view back to security_definer so it bypasses RLS but only shows safe columns
ALTER VIEW public.units_public SET (security_invoker = false);
