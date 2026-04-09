
-- Tabela de itens de estoque
CREATE TABLE public.stock_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin Unidade can manage unit stock"
  ON public.stock_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Admin Master can manage company stock"
  ON public.stock_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Super Admin full access to stock_items"
  ON public.stock_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE TRIGGER update_stock_items_updated_at
  BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Tabela de notificações de entrega
CREATE TABLE public.delivery_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  responsible_id UUID NOT NULL,
  student_name TEXT,
  responsible_name TEXT,
  enrollment_id TEXT,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivered_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin Unidade can manage unit deliveries"
  ON public.delivery_notifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Admin Master can manage company deliveries"
  ON public.delivery_notifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Super Admin full access to delivery_notifications"
  ON public.delivery_notifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE TRIGGER update_delivery_notifications_updated_at
  BEFORE UPDATE ON public.delivery_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Função que processa baixa de estoque quando pagamento é confirmado
CREATE OR REPLACE FUNCTION public.process_stock_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock_item RECORD;
  v_student RECORD;
  v_responsible RECORD;
  v_paid_statuses TEXT[] := ARRAY['PAID', 'RECEIVED', 'CONFIRMED'];
BEGIN
  -- Só processa se o status mudou para pago
  IF NEW.status = ANY(v_paid_statuses) AND (OLD.status IS NULL OR NOT (OLD.status = ANY(v_paid_statuses))) THEN
    -- Busca item de estoque que corresponda à descrição do pagamento (case insensitive, parcial)
    SELECT * INTO v_stock_item
    FROM public.stock_items
    WHERE unit_id = NEW.unit_id
      AND active = true
      AND LOWER(NEW.description) LIKE '%' || LOWER(name) || '%'
    LIMIT 1;

    IF v_stock_item.id IS NOT NULL THEN
      -- Dá baixa no estoque
      UPDATE public.stock_items
      SET quantity = GREATEST(quantity - 1, 0)
      WHERE id = v_stock_item.id;

      -- Busca dados do aluno
      SELECT full_name, enrollment_id INTO v_student
      FROM public.students
      WHERE id = NEW.student_id;

      -- Busca dados do responsável
      SELECT full_name INTO v_responsible
      FROM public.profiles
      WHERE id = NEW.responsible_id;

      -- Cria notificação de entrega
      INSERT INTO public.delivery_notifications (
        unit_id, payment_id, stock_item_id, student_id, responsible_id,
        student_name, responsible_name, enrollment_id, item_name
      ) VALUES (
        NEW.unit_id, NEW.id, v_stock_item.id, NEW.student_id, NEW.responsible_id,
        v_student.full_name, v_responsible.full_name, v_student.enrollment_id, v_stock_item.name
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger na tabela payments
CREATE TRIGGER trigger_stock_on_payment_update
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.process_stock_on_payment();
