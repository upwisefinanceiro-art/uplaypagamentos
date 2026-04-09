-- 1. Add new columns to stock_items
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS min_quantity integer NOT NULL DEFAULT 0;

-- 2. Create stock_movements table
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id),
  movement_type text NOT NULL DEFAULT 'EXIT', -- ENTRY, EXIT, ADJUSTMENT
  quantity integer NOT NULL DEFAULT 1,
  reason text,
  responsible_id uuid,
  payment_id uuid REFERENCES public.payments(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin Master can manage company stock movements"
ON public.stock_movements FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (SELECT units.id FROM units WHERE units.company_id = get_user_company_id(auth.uid()))
);

CREATE POLICY "Admin Unidade can manage unit stock movements"
ON public.stock_movements FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
);

CREATE POLICY "Super Admin full access to stock_movements"
ON public.stock_movements FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- 3. Update process_stock_on_payment to also record movement
CREATE OR REPLACE FUNCTION public.process_stock_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_item RECORD;
  v_student RECORD;
  v_responsible RECORD;
  v_paid_statuses TEXT[] := ARRAY['PAID', 'RECEIVED', 'CONFIRMED'];
BEGIN
  IF NEW.status = ANY(v_paid_statuses) AND (OLD.status IS NULL OR NOT (OLD.status = ANY(v_paid_statuses))) THEN
    SELECT * INTO v_stock_item
    FROM public.stock_items
    WHERE unit_id = NEW.unit_id
      AND active = true
      AND LOWER(NEW.description) LIKE '%' || LOWER(name) || '%'
    LIMIT 1;

    IF v_stock_item.id IS NOT NULL THEN
      UPDATE public.stock_items
      SET quantity = GREATEST(quantity - 1, 0)
      WHERE id = v_stock_item.id;

      -- Record stock movement
      INSERT INTO public.stock_movements (item_id, unit_id, movement_type, quantity, reason, responsible_id, payment_id)
      VALUES (v_stock_item.id, NEW.unit_id, 'EXIT', 1, 'Baixa automática - pagamento confirmado', NEW.responsible_id, NEW.id);

      SELECT full_name, enrollment_id INTO v_student
      FROM public.students
      WHERE id = NEW.student_id;

      SELECT full_name INTO v_responsible
      FROM public.profiles
      WHERE id = NEW.responsible_id;

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
$function$;