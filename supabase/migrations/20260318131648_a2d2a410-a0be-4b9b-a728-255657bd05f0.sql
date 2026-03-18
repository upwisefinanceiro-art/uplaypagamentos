
CREATE TABLE public.whatsapp_message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  responsible_id UUID NOT NULL,
  phone TEXT,
  message_text TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'MANUAL',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT'
);

ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin Master can manage all logs"
  ON public.whatsapp_message_logs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role));

CREATE POLICY "Admin Unidade can view logs"
  ON public.whatsapp_message_logs
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role));

CREATE POLICY "Users can insert own logs"
  ON public.whatsapp_message_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (sent_by = auth.uid());
