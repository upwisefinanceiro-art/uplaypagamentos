ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS emission_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS emission_error_code text,
  ADD COLUMN IF NOT EXISTS emission_error_message text,
  ADD COLUMN IF NOT EXISTS emission_payload jsonb,
  ADD COLUMN IF NOT EXISTS emission_response jsonb,
  ADD COLUMN IF NOT EXISTS emission_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS emission_attempts integer NOT NULL DEFAULT 0;

-- Marca como já emitidas as parcelas que possuem ID externo
UPDATE public.payments
SET emission_status = 'EMITTED'
WHERE emission_status = 'PENDING'
  AND (cora_invoice_id IS NOT NULL OR asaas_payment_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_payments_emission_status
  ON public.payments (unit_id, emission_status)
  WHERE emission_status = 'ERROR';