
-- 1. Add explicit stock link columns to payments
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS stock_item_id uuid REFERENCES public.stock_items(id),
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 1;

-- 2. Create index for stock lookups
CREATE INDEX IF NOT EXISTS idx_payments_stock_item_id ON public.payments(stock_item_id) WHERE stock_item_id IS NOT NULL;

-- 3. Rewrite the trigger function with explicit linking + fallback + idempotency
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
  v_paid_statuses TEXT[] := ARRAY['PAID', 'RECEIVED', 'CONFIRMED'];
  v_already_processed boolean;
BEGIN
  -- Only process when status changes TO a paid status
  IF NOT (NEW.status = ANY(v_paid_statuses)) THEN
    RETURN NEW;
  END IF;
  
  -- Skip if old status was already paid (no double processing)
  IF OLD IS NOT NULL AND OLD.status = ANY(v_paid_statuses) THEN
    RETURN NEW;
  END IF;

  -- Determine stock item: explicit link first, then text fallback
  v_stock_item_id := NEW.stock_item_id;
  v_stock_qty := COALESCE(NULLIF(NEW.stock_quantity, 0), 1);

  IF v_stock_item_id IS NULL THEN
    -- Fallback: text matching for legacy charges
    SELECT id INTO v_stock_item_id
    FROM public.stock_items
    WHERE unit_id = NEW.unit_id
      AND active = true
      AND LOWER(NEW.description) LIKE '%' || LOWER(name) || '%'
    LIMIT 1;
  END IF;

  -- No stock item found, nothing to do
  IF v_stock_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: check if we already processed this payment
  SELECT EXISTS(
    SELECT 1 FROM public.stock_movements 
    WHERE payment_id = NEW.id AND movement_type = 'EXIT'
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN NEW;
  END IF;

  -- Load stock item
  SELECT * INTO v_stock_item FROM public.stock_items WHERE id = v_stock_item_id;
  IF v_stock_item IS NULL THEN
    RETURN NEW;
  END IF;

  -- Deduct stock
  UPDATE public.stock_items
  SET quantity = GREATEST(quantity - v_stock_qty, 0)
  WHERE id = v_stock_item_id;

  -- Record movement
  INSERT INTO public.stock_movements (item_id, unit_id, movement_type, quantity, reason, responsible_id, payment_id)
  VALUES (v_stock_item_id, NEW.unit_id, 'EXIT', v_stock_qty, 'Baixa automática - pagamento confirmado', NEW.responsible_id, NEW.id);

  -- Get student and responsible info for delivery notification
  SELECT full_name, enrollment_id INTO v_student
  FROM public.students
  WHERE id = NEW.student_id;

  SELECT full_name INTO v_responsible
  FROM public.profiles
  WHERE id = NEW.responsible_id;

  -- Create delivery notification
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

-- 4. Ensure trigger is ACTUALLY attached to the payments table
DROP TRIGGER IF EXISTS trg_process_stock_on_payment ON public.payments;

CREATE TRIGGER trg_process_stock_on_payment
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.process_stock_on_payment();

-- 5. Also fire on INSERT for cases where payment is inserted already as PAID
DROP TRIGGER IF EXISTS trg_process_stock_on_payment_insert ON public.payments;

CREATE TRIGGER trg_process_stock_on_payment_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.status IN ('PAID', 'RECEIVED', 'CONFIRMED'))
  EXECUTE FUNCTION public.process_stock_on_payment();
