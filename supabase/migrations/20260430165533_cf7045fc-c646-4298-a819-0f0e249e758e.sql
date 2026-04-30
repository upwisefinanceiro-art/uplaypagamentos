-- Adiciona flag de negativação (SPC/Serasa) em payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS in_dunning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dunning_status text,
  ADD COLUMN IF NOT EXISTS dunning_id text,
  ADD COLUMN IF NOT EXISTS dunning_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payments_in_dunning ON public.payments (in_dunning) WHERE in_dunning = true;
CREATE INDEX IF NOT EXISTS idx_payments_dunning_id ON public.payments (dunning_id) WHERE dunning_id IS NOT NULL;