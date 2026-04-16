-- Tabela de notificações in-app para clientes (responsáveis)
CREATE TABLE public.client_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL,
  responsible_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  sent_by UUID NOT NULL,
  sent_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_notifications_responsible ON public.client_notifications(responsible_id, created_at DESC);
CREATE INDEX idx_client_notifications_unit ON public.client_notifications(unit_id, created_at DESC);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Super Admin: acesso total
CREATE POLICY "Super Admin full access to client_notifications"
ON public.client_notifications FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- Admin Master: gerencia notificações da empresa
CREATE POLICY "Admin Master can manage company client_notifications"
ON public.client_notifications FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
);

-- Admin Unidade: gerencia notificações da sua unidade
CREATE POLICY "Admin Unidade can manage unit client_notifications"
ON public.client_notifications FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
);

-- Responsável: vê e marca como lida suas próprias notificações
CREATE POLICY "Responsavel can view own client_notifications"
ON public.client_notifications FOR SELECT TO authenticated
USING (responsible_id = auth.uid());

CREATE POLICY "Responsavel can update own client_notifications"
ON public.client_notifications FOR UPDATE TO authenticated
USING (responsible_id = auth.uid())
WITH CHECK (responsible_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notifications;
ALTER TABLE public.client_notifications REPLICA IDENTITY FULL;