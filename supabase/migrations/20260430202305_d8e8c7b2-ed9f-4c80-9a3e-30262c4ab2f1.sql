-- 1. Adicionar campos na tabela units
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS partnership_plan text NOT NULL DEFAULT 'PLANO_ASAAS',
  ADD COLUMN IF NOT EXISTS uplay_fee_type text NOT NULL DEFAULT 'PERCENT',
  ADD COLUMN IF NOT EXISTS uplay_fee_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uplay_balance numeric NOT NULL DEFAULT 0;

-- Validações via constraint
ALTER TABLE public.units
  DROP CONSTRAINT IF EXISTS units_partnership_plan_check;
ALTER TABLE public.units
  ADD CONSTRAINT units_partnership_plan_check
  CHECK (partnership_plan IN ('PLANO_ASAAS', 'PLANO_UPLAY'));

ALTER TABLE public.units
  DROP CONSTRAINT IF EXISTS units_uplay_fee_type_check;
ALTER TABLE public.units
  ADD CONSTRAINT units_uplay_fee_type_check
  CHECK (uplay_fee_type IN ('PERCENT', 'FIXED'));

-- 2. Tabela de transações intermediadas
CREATE TABLE IF NOT EXISTS public.uplay_partner_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  company_id uuid,
  payment_id uuid,
  responsible_id uuid,
  responsible_name text,
  description text,
  gross_value numeric NOT NULL DEFAULT 0,
  fee_type text NOT NULL DEFAULT 'PERCENT',
  fee_value numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDENTE_REPASSE',
  paid_at timestamptz,
  transferred_at timestamptz,
  transferred_by uuid,
  transfer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uplay_partner_transactions_status_check
    CHECK (status IN ('PENDENTE_REPASSE', 'REPASSADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS idx_uplay_tx_unit ON public.uplay_partner_transactions(unit_id);
CREATE INDEX IF NOT EXISTS idx_uplay_tx_status ON public.uplay_partner_transactions(status);
CREATE INDEX IF NOT EXISTS idx_uplay_tx_payment ON public.uplay_partner_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_uplay_tx_paid_at ON public.uplay_partner_transactions(paid_at);

ALTER TABLE public.uplay_partner_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Super Admin gerencia tudo
DROP POLICY IF EXISTS "Super Admin full access uplay_tx" ON public.uplay_partner_transactions;
CREATE POLICY "Super Admin full access uplay_tx"
ON public.uplay_partner_transactions
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- RLS: Admin Master da empresa UpPlay vê todas as transações da sua empresa
DROP POLICY IF EXISTS "Admin Master manage company uplay_tx" ON public.uplay_partner_transactions;
CREATE POLICY "Admin Master manage company uplay_tx"
ON public.uplay_partner_transactions
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (
    SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (
    SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid())
  )
);

-- RLS: Admin Unidade vê apenas seu próprio extrato
DROP POLICY IF EXISTS "Admin Unidade view own uplay_tx" ON public.uplay_partner_transactions;
CREATE POLICY "Admin Unidade view own uplay_tx"
ON public.uplay_partner_transactions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_uplay_tx_updated_at ON public.uplay_partner_transactions;
CREATE TRIGGER trg_uplay_tx_updated_at
BEFORE UPDATE ON public.uplay_partner_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();