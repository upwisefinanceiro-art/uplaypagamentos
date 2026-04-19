-- Backup logs table
CREATE TABLE public.backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL,
  performed_by_name TEXT,
  scope TEXT NOT NULL DEFAULT 'COMPANY', -- 'GLOBAL' or 'COMPANY'
  company_id UUID,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, ERROR, RESTORED
  format TEXT NOT NULL DEFAULT 'JSON', -- JSON or ZIP
  size_bytes BIGINT DEFAULT 0,
  total_records INTEGER DEFAULT 0,
  tables_included TEXT[] DEFAULT '{}',
  error_message TEXT,
  action TEXT NOT NULL DEFAULT 'BACKUP', -- BACKUP or RESTORE
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_logs_performed_by ON public.backup_logs(performed_by);
CREATE INDEX idx_backup_logs_company_id ON public.backup_logs(company_id);
CREATE INDEX idx_backup_logs_created_at ON public.backup_logs(created_at DESC);

ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to backup_logs"
  ON public.backup_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can view own backup_logs"
  ON public.backup_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND performed_by = auth.uid()
  );

CREATE POLICY "Admin Master can insert own backup_logs"
  ON public.backup_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND performed_by = auth.uid()
  );