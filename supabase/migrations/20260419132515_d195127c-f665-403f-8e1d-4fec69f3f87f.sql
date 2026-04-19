-- Tabela de custos operacionais por unidade
CREATE TABLE IF NOT EXISTS public.unit_financial_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL UNIQUE,
  fixed_monthly_cost numeric NOT NULL DEFAULT 0,
  cost_per_student numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unit_financial_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to unit_financial_costs"
ON public.unit_financial_costs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can manage company unit_financial_costs"
ON public.unit_financial_costs FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admin Unidade can view own unit_financial_costs"
ON public.unit_financial_costs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
);

CREATE TRIGGER trg_unit_financial_costs_updated_at
BEFORE UPDATE ON public.unit_financial_costs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();