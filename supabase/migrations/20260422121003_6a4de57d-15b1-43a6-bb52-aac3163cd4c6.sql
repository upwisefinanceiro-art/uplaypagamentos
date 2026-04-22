
-- 1) Adiciona preço de custo nos itens de estoque (para custo variável automático)
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;

-- 2) Tabela de lançamentos financeiros (Custos Fixos, Variáveis, Consumo, Receitas extras)
CREATE TABLE IF NOT EXISTS public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  company_id uuid,
  entry_type text NOT NULL CHECK (entry_type IN ('FIXO', 'VARIAVEL', 'CONSUMO')),
  direction text NOT NULL DEFAULT 'DESPESA' CHECK (direction IN ('DESPESA', 'RECEITA')),
  category text,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  competence_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  paid_date date,
  reconciliation_status text NOT NULL DEFAULT 'PENDENTE' CHECK (reconciliation_status IN ('PENDENTE', 'PAGO', 'ATRASADO')),
  recurrence text NOT NULL DEFAULT 'UNICO' CHECK (recurrence IN ('UNICO', 'MENSAL')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_unit ON public.finance_entries(unit_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_company ON public.finance_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_due ON public.finance_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_competence ON public.finance_entries(competence_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_status ON public.finance_entries(reconciliation_status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_finance_entries_updated_at ON public.finance_entries;
CREATE TRIGGER trg_finance_entries_updated_at
  BEFORE UPDATE ON public.finance_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger: marca como ATRASADO automaticamente quando vence sem pagamento
CREATE OR REPLACE FUNCTION public.finance_entries_auto_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Se foi pago, status = PAGO e preenche paid_date se vazio
  IF NEW.paid_date IS NOT NULL THEN
    NEW.reconciliation_status := 'PAGO';
  ELSIF NEW.reconciliation_status = 'PAGO' AND NEW.paid_date IS NULL THEN
    NEW.paid_date := CURRENT_DATE;
  ELSIF NEW.paid_date IS NULL AND NEW.due_date < CURRENT_DATE AND NEW.reconciliation_status <> 'PAGO' THEN
    NEW.reconciliation_status := 'ATRASADO';
  ELSIF NEW.paid_date IS NULL AND NEW.due_date >= CURRENT_DATE AND NEW.reconciliation_status = 'ATRASADO' THEN
    NEW.reconciliation_status := 'PENDENTE';
  END IF;

  -- Preenche company_id automaticamente a partir da unit
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.units WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_entries_auto_status ON public.finance_entries;
CREATE TRIGGER trg_finance_entries_auto_status
  BEFORE INSERT OR UPDATE ON public.finance_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.finance_entries_auto_status();

-- 3) RLS
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to finance_entries"
  ON public.finance_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can manage company finance_entries"
  ON public.finance_entries FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  );

CREATE POLICY "Admin Unidade can manage unit finance_entries"
  ON public.finance_entries FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
    AND unit_id = get_user_unit_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
    AND unit_id = get_user_unit_id(auth.uid())
  );
