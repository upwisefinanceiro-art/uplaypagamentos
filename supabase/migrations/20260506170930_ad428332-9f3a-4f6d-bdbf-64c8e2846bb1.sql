
REVOKE EXECUTE ON FUNCTION public.get_unit_secrets(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_unit_secrets(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_company_secrets(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_company_secrets(uuid, jsonb) FROM anon, public;
