
-- Drop public listing policy (direct CDN URLs continue to work for public buckets)
DROP POLICY IF EXISTS "Public can view company logos" ON storage.objects;

-- Authenticated admins can view logos of their own company
CREATE POLICY "Admins can list own company logos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'company-logos' AND (
    has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (
      has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
      AND (storage.foldername(name))[1] = (get_user_company_id(auth.uid()))::text
    )
  )
);

-- Tighten INSERT: only allow upload into own company folder
DROP POLICY IF EXISTS "Admin Master can upload company logos" ON storage.objects;
CREATE POLICY "Admin Master can upload company logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' AND (
    has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (
      has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
      AND (storage.foldername(name))[1] = (get_user_company_id(auth.uid()))::text
    )
  )
);

-- Revoke EXECUTE from anon on sensitive SECURITY DEFINER functions (keep authenticated)
REVOKE EXECUTE ON FUNCTION public.get_unit_secrets(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_unit_secrets(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_company_secrets(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_company_secrets(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_school_payroll_paid(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_school_payroll_closure(uuid, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.post_payroll_closure_to_finance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_post_pending_payroll_to_finance() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_generate_payroll_closures() FROM anon, public;
