
-- 1) Revoke direct column access on sensitive secrets
REVOKE SELECT (asaas_api_key, asaas_webhook_token, cora_client_id, cora_certificate, cora_private_key)
  ON public.units FROM authenticated;
REVOKE UPDATE (asaas_api_key, asaas_webhook_token, cora_client_id, cora_certificate, cora_private_key)
  ON public.units FROM authenticated;
REVOKE INSERT (asaas_api_key, asaas_webhook_token, cora_client_id, cora_certificate, cora_private_key)
  ON public.units FROM authenticated;

REVOKE SELECT (asaas_api_key_master, asaas_webhook_token_master)
  ON public.companies FROM authenticated;
REVOKE UPDATE (asaas_api_key_master, asaas_webhook_token_master)
  ON public.companies FROM authenticated;
REVOKE INSERT (asaas_api_key_master, asaas_webhook_token_master)
  ON public.companies FROM authenticated;

-- 2) RPC: read unit secrets (admins of same company only)
CREATE OR REPLACE FUNCTION public.get_unit_secrets(_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_row record;
BEGIN
  SELECT company_id INTO v_company FROM public.units WHERE id = _unit_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND v_company = public.get_user_company_id(auth.uid()))
    OR (public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND _unit_id = public.get_user_unit_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT asaas_api_key, asaas_webhook_token, cora_client_id, cora_certificate, cora_private_key
    INTO v_row FROM public.units WHERE id = _unit_id;

  RETURN jsonb_build_object(
    'asaas_api_key', v_row.asaas_api_key,
    'asaas_webhook_token', v_row.asaas_webhook_token,
    'cora_client_id', v_row.cora_client_id,
    'cora_certificate', v_row.cora_certificate,
    'cora_private_key', v_row.cora_private_key
  );
END;
$$;

-- 3) RPC: update unit secrets (admins of same company only)
CREATE OR REPLACE FUNCTION public.update_unit_secrets(_unit_id uuid, _secrets jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.units WHERE id = _unit_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND v_company = public.get_user_company_id(auth.uid()))
    OR (public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND _unit_id = public.get_user_unit_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.units SET
    asaas_api_key = COALESCE(NULLIF(_secrets->>'asaas_api_key',''), asaas_api_key),
    asaas_webhook_token = COALESCE(NULLIF(_secrets->>'asaas_webhook_token',''), asaas_webhook_token),
    cora_client_id = COALESCE(NULLIF(_secrets->>'cora_client_id',''), cora_client_id),
    cora_certificate = COALESCE(NULLIF(_secrets->>'cora_certificate',''), cora_certificate),
    cora_private_key = COALESCE(NULLIF(_secrets->>'cora_private_key',''), cora_private_key),
    updated_at = now()
  WHERE id = _unit_id;
END;
$$;

-- 4) RPC: read/update company master secrets
CREATE OR REPLACE FUNCTION public.get_company_secrets(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND _company_id = public.get_user_company_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT asaas_api_key_master, asaas_webhook_token_master
    INTO v_row FROM public.companies WHERE id = _company_id;
  RETURN jsonb_build_object(
    'asaas_api_key_master', v_row.asaas_api_key_master,
    'asaas_webhook_token_master', v_row.asaas_webhook_token_master
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_company_secrets(_company_id uuid, _secrets jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND _company_id = public.get_user_company_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.companies SET
    asaas_api_key_master = COALESCE(NULLIF(_secrets->>'asaas_api_key_master',''), asaas_api_key_master),
    asaas_webhook_token_master = COALESCE(NULLIF(_secrets->>'asaas_webhook_token_master',''), asaas_webhook_token_master),
    updated_at = now()
  WHERE id = _company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_secrets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_unit_secrets(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_secrets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_secrets(uuid, jsonb) TO authenticated;

-- 5) Restrictive policy: prevent non-admin self-insert into user_roles
CREATE POLICY "Block non-admin role self-insert"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  );
