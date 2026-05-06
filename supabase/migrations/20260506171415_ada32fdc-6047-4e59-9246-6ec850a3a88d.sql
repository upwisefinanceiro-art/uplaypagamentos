
-- UNITS: revoke broad table-level privileges and re-grant only non-secret columns
REVOKE SELECT, INSERT, UPDATE ON public.units FROM authenticated;

GRANT SELECT, INSERT, UPDATE (
  id, name, active, status, cnpj, address, phone, asaas_base_url,
  whatsapp_financeiro, usar_whatsapp_padrao, razao_social, tipo_cadastro,
  cpf, rg_ie, cidade, estado, bairro, cep, whatsapp, email_empresa,
  email_acesso, cora_environment, preferred_bank, partnership_plan,
  uplay_fee_type, uplay_fee_value, uplay_balance, company_id,
  created_at, updated_at
) ON public.units TO authenticated;

-- DELETE remains controlled by RLS
GRANT DELETE ON public.units TO authenticated;

-- COMPANIES: same treatment for the master Asaas keys
REVOKE SELECT, INSERT, UPDATE ON public.companies FROM authenticated;

GRANT SELECT, INSERT, UPDATE (
  id, name, system_name, logo_url, primary_color, secondary_color,
  whatsapp_financeiro, cnpj, email, phone, plan, status, max_units,
  max_users, endereco, numero, bairro, cidade, estado, cep,
  asaas_base_url_master, valor_mensalidade, dias_bloqueio, whatsapp_master,
  created_at, updated_at
) ON public.companies TO authenticated;

GRANT DELETE ON public.companies TO authenticated;
