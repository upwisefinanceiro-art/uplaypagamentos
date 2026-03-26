
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  asaas_payment_id text,
  local_payment_id uuid,
  unit_id uuid,
  old_status text,
  new_status text,
  payload jsonb,
  processed boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin Master can manage webhook logs"
ON public.webhook_logs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role));

CREATE POLICY "Admin Unidade can view webhook logs"
ON public.webhook_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role));

CREATE POLICY "Service can insert webhook logs"
ON public.webhook_logs FOR INSERT TO anon
WITH CHECK (true);
