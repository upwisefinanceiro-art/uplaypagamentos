
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  performed_by uuid NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin Master can manage all audit logs"
  ON public.audit_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role));

CREATE POLICY "Admin Unidade can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role));

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid());

CREATE INDEX idx_audit_logs_target ON public.audit_logs (target_table, target_id);
CREATE INDEX idx_audit_logs_performed_by ON public.audit_logs (performed_by);
