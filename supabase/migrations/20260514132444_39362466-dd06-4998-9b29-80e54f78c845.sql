
-- 1) Idempotência de webhooks
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'ASAAS',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  asaas_payment_id TEXT,
  unit_id UUID,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment ON public.webhook_events(asaas_payment_id);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access webhook_events"
ON public.webhook_events FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master view company webhook_events"
ON public.webhook_events FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND (
  unit_id IS NULL OR unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
));

CREATE POLICY "Admin Unidade view unit webhook_events"
ON public.webhook_events FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

-- 2) Avisos de baixa de estoque sem item identificado
CREATE TABLE IF NOT EXISTS public.stock_baixa_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  description TEXT,
  payment_type TEXT,
  responsible_id UUID,
  reason TEXT NOT NULL DEFAULT 'NO_STOCK_ITEM_MATCH',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_warnings_unit ON public.stock_baixa_warnings(unit_id);
ALTER TABLE public.stock_baixa_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access stock_warnings"
ON public.stock_baixa_warnings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company stock_warnings"
ON public.stock_baixa_warnings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin Unidade manage unit stock_warnings"
ON public.stock_baixa_warnings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

-- 3) Atualizar trigger function de baixa de estoque para gerar warning quando não acha item
CREATE OR REPLACE FUNCTION public.process_stock_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_item_id uuid;
  v_stock_qty integer;
  v_stock_item RECORD;
  v_student RECORD;
  v_responsible RECORD;
  v_paid_statuses TEXT[] := ARRAY['PAID','RECEIVED','CONFIRMED'];
  v_already_processed boolean;
  v_norm_desc text;
BEGIN
  IF NOT (NEW.status = ANY(v_paid_statuses)) THEN
    RETURN NEW;
  END IF;

  IF OLD IS NOT NULL AND OLD.status = ANY(v_paid_statuses) THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_type NOT IN ('APOSTILA','MATRICULA') THEN
    RETURN NEW;
  END IF;

  v_stock_item_id := NEW.stock_item_id;
  v_stock_qty := COALESCE(NULLIF(NEW.stock_quantity, 0), 1);

  IF v_stock_item_id IS NULL THEN
    v_norm_desc := LOWER(COALESCE(NEW.description, ''));
    SELECT id INTO v_stock_item_id
    FROM public.stock_items
    WHERE unit_id = NEW.unit_id
      AND active = true
      AND char_length(name) >= 4
      AND v_norm_desc LIKE '%' || LOWER(name) || '%'
    ORDER BY char_length(name) DESC
    LIMIT 1;
  END IF;

  -- Sem item identificado => grava warning para revisão manual e segue
  IF v_stock_item_id IS NULL THEN
    INSERT INTO public.stock_baixa_warnings (unit_id, payment_id, description, payment_type, responsible_id, reason)
    VALUES (NEW.unit_id, NEW.id, NEW.description, NEW.payment_type, NEW.responsible_id, 'NO_STOCK_ITEM_MATCH')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stock_movements 
    WHERE payment_id = NEW.id AND movement_type = 'EXIT'
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_stock_item FROM public.stock_items WHERE id = v_stock_item_id;
  IF v_stock_item IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.stock_items
  SET quantity = GREATEST(quantity - v_stock_qty, 0)
  WHERE id = v_stock_item_id;

  INSERT INTO public.stock_movements (item_id, unit_id, movement_type, quantity, reason, responsible_id, payment_id)
  VALUES (v_stock_item_id, NEW.unit_id, 'EXIT', v_stock_qty, 'Baixa automática - pagamento confirmado', NEW.responsible_id, NEW.id);

  SELECT full_name, enrollment_id INTO v_student
  FROM public.students WHERE id = NEW.student_id;

  SELECT full_name INTO v_responsible
  FROM public.profiles WHERE id = NEW.responsible_id;

  INSERT INTO public.delivery_notifications (
    unit_id, payment_id, stock_item_id, student_id, responsible_id,
    student_name, responsible_name, enrollment_id, item_name, quantity
  ) VALUES (
    NEW.unit_id, NEW.id, v_stock_item_id, NEW.student_id, NEW.responsible_id,
    v_student.full_name, v_responsible.full_name, v_student.enrollment_id, v_stock_item.name, v_stock_qty
  );

  RETURN NEW;
END;
$function$;
