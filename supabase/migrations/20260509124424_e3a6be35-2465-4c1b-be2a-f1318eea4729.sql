-- Sync status fields on payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS sync_last_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_last_fix TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_fixed_by UUID,
  ADD COLUMN IF NOT EXISTS sync_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS corrected_automatically BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS payments_sync_status_idx ON public.payments(sync_status);

-- Audit log of reconciliation actions
CREATE TABLE IF NOT EXISTS public.payment_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,
  asaas_payment_id TEXT,
  responsible_id UUID,
  unit_id UUID NOT NULL,
  old_value NUMERIC,
  new_value NUMERIC,
  old_discount NUMERIC,
  new_discount NUMERIC,
  action TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_sync_logs_payment_idx ON public.payment_sync_logs(payment_id);
CREATE INDEX IF NOT EXISTS payment_sync_logs_unit_idx ON public.payment_sync_logs(unit_id);

ALTER TABLE public.payment_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to payment_sync_logs"
  ON public.payment_sync_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can view company payment_sync_logs"
  ON public.payment_sync_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND unit_id IN (SELECT id FROM public.units WHERE company_id = public.get_user_company_id(auth.uid()))
  );

CREATE POLICY "Admin Unidade can view unit payment_sync_logs"
  ON public.payment_sync_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
    AND unit_id = public.get_user_unit_id(auth.uid())
  );