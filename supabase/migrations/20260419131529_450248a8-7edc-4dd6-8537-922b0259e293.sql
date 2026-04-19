-- Tabela de inconsistências financeiras detectadas
CREATE TABLE public.payment_inconsistencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid,
  unit_id uuid NOT NULL,
  company_id uuid,
  responsible_id uuid,
  responsible_name text,
  asaas_payment_id text,
  error_type text NOT NULL,
  severity text NOT NULL DEFAULT 'MEDIUM',
  system_value numeric,
  asaas_value numeric,
  system_status text,
  asaas_status text,
  system_due_date date,
  asaas_due_date date,
  system_paid_at timestamptz,
  asaas_paid_at timestamptz,
  details jsonb DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_action text,
  detection_count integer NOT NULL DEFAULT 1,
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_payment_inconsistencies_unit ON public.payment_inconsistencies(unit_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_payment_inconsistencies_company ON public.payment_inconsistencies(company_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_payment_inconsistencies_severity ON public.payment_inconsistencies(severity) WHERE resolved_at IS NULL;
CREATE INDEX idx_payment_inconsistencies_payment ON public.payment_inconsistencies(payment_id);

-- Único por payment+error_type ainda não resolvido (evita duplicatas)
CREATE UNIQUE INDEX uq_payment_inconsistencies_open
  ON public.payment_inconsistencies(payment_id, error_type)
  WHERE resolved_at IS NULL AND payment_id IS NOT NULL;

-- Trigger updated_at
CREATE TRIGGER trg_payment_inconsistencies_updated
BEFORE UPDATE ON public.payment_inconsistencies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.payment_inconsistencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to payment_inconsistencies"
  ON public.payment_inconsistencies
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can manage company inconsistencies"
  ON public.payment_inconsistencies
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  );

CREATE POLICY "Admin Unidade can manage unit inconsistencies"
  ON public.payment_inconsistencies
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
    AND unit_id = get_user_unit_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
    AND unit_id = get_user_unit_id(auth.uid())
  );