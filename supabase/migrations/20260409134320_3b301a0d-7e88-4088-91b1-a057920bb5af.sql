
-- Fix 1: Remove overly permissive audit log INSERT policy
-- Edge functions use service_role (bypasses RLS), so no client-side INSERT is needed
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Fix 2: Convert units_public to security invoker and add safe Responsavel policy
-- First make the view use security invoker (resolves Supabase linter warning)
ALTER VIEW public.units_public SET (security_invoker = true);

-- Add a Responsavel SELECT policy on units table so the view works for end-users
-- This policy allows reading ALL columns, but the view only exposes safe columns
-- The view is the intended access path for Responsavel users
CREATE POLICY "Responsavel can view own unit via view"
ON public.units
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'RESPONSAVEL'::app_role)
  AND id = get_user_unit_id(auth.uid())
);
