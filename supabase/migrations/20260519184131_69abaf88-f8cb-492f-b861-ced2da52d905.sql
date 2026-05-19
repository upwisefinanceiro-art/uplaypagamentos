
-- 1. Add config column for finance posting day
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS finance_posting_day integer NOT NULL DEFAULT 21;

-- 2. Add link columns on closures
ALTER TABLE public.school_payroll_closures
  ADD COLUMN IF NOT EXISTS finance_entry_id uuid,
  ADD COLUMN IF NOT EXISTS finance_posted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_school_payroll_finance_entry
  ON public.school_payroll_closures(finance_entry_id)
  WHERE finance_entry_id IS NOT NULL;

-- 3. Function: post a closure to finance_entries (idempotent)
CREATE OR REPLACE FUNCTION public.post_payroll_closure_to_finance(_closure_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closure  public.school_payroll_closures%ROWTYPE;
  v_teacher_name text;
  v_entry_id uuid;
  v_amount numeric;
  v_posting_day int;
  v_paid_date date;
  v_due_date date;
BEGIN
  SELECT * INTO v_closure FROM public.school_payroll_closures WHERE id = _closure_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Already posted? return existing
  IF v_closure.finance_entry_id IS NOT NULL THEN
    RETURN v_closure.finance_entry_id;
  END IF;

  -- Only post when something was paid
  v_amount := COALESCE(v_closure.paid_amount, 0);
  IF v_amount <= 0 THEN
    v_amount := COALESCE(v_closure.total_value, 0);
  END IF;
  IF v_amount <= 0 THEN RETURN NULL; END IF;

  SELECT full_name INTO v_teacher_name FROM public.school_teachers WHERE id = v_closure.teacher_id;

  SELECT COALESCE(finance_posting_day, 21) INTO v_posting_day FROM public.units WHERE id = v_closure.unit_id;

  v_paid_date := COALESCE(v_closure.paid_at::date, CURRENT_DATE);
  v_due_date  := COALESCE(v_closure.scheduled_payment_date, v_closure.due_date, v_paid_date);

  INSERT INTO public.finance_entries (
    unit_id, company_id, direction, entry_type,
    category, subcategoria, description, descricao_item,
    amount, competence_date, due_date, paid_date,
    reconciliation_status, recurrence, notes
  ) VALUES (
    v_closure.unit_id, v_closure.company_id, 'DESPESA', 'FIXO',
    'Folha de Pagamento', 'Professores',
    'Pagamento Professor — ' || COALESCE(v_teacher_name, 'Professor'),
    'Folha Escolar — ciclo ' || to_char(v_closure.reference_month, 'DD/MM/YYYY')
       || ' a ' || to_char(COALESCE(v_closure.cycle_end_date, v_closure.reference_month + INTERVAL '1 month'), 'DD/MM/YYYY'),
    v_amount,
    COALESCE(v_closure.cycle_end_date, v_closure.reference_month),
    v_due_date,
    v_paid_date,
    'CONCILIADO', 'UNICO',
    'Lançamento automático do fechamento escolar #' || v_closure.id::text
  ) RETURNING id INTO v_entry_id;

  UPDATE public.school_payroll_closures
     SET finance_entry_id = v_entry_id,
         finance_posted_at = now()
   WHERE id = _closure_id;

  RETURN v_entry_id;
END;
$$;

-- 4. Trigger: auto-post when status becomes PAID
CREATE OR REPLACE FUNCTION public.trg_auto_post_payroll_to_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'PAID'
     AND NEW.finance_entry_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PAID') THEN
    PERFORM public.post_payroll_closure_to_finance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_post_payroll_to_finance ON public.school_payroll_closures;
CREATE TRIGGER auto_post_payroll_to_finance
  AFTER INSERT OR UPDATE OF status, paid_amount, paid_at ON public.school_payroll_closures
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_post_payroll_to_finance();

-- 5. Daily sweeper: post any PAID closures whose finance_posting_day has arrived
CREATE OR REPLACE FUNCTION public.auto_post_pending_payroll_to_finance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  cnt int := 0;
BEGIN
  FOR c IN
    SELECT spc.id
      FROM public.school_payroll_closures spc
      JOIN public.units u ON u.id = spc.unit_id
     WHERE spc.status = 'PAID'
       AND spc.finance_entry_id IS NULL
       AND EXTRACT(DAY FROM CURRENT_DATE) >= COALESCE(u.finance_posting_day, 21)
  LOOP
    PERFORM public.post_payroll_closure_to_finance(c.id);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;
