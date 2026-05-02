
-- Adiciona campos para integração Cora na tabela payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cora_invoice_id text,
  ADD COLUMN IF NOT EXISTS cora_status text,
  ADD COLUMN IF NOT EXISTS cora_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_cora_invoice_id ON public.payments(cora_invoice_id) WHERE cora_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_pending_cora ON public.payments(unit_id, status, gateway) WHERE status = 'PENDING' AND gateway = 'CORA' AND cora_invoice_id IS NULL;
