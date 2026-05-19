-- 1. Adicionar campos ao fechamento mensal
ALTER TABLE public.school_payroll_closures
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS scheduled_payment_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

-- 2. Nova tabela de pagamentos avulsos / adiantamentos / bônus
CREATE TABLE IF NOT EXISTS public.school_teacher_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  closure_id uuid NULL REFERENCES public.school_payroll_closures(id) ON DELETE SET NULL,
  payment_type text NOT NULL CHECK (payment_type IN (
    'FOLHA_MENSAL','ADIANTAMENTO','AVULSO','REPOSICAO','AULA_EXTRA','BONUS','AJUDA_CUSTO'
  )),
  amount numeric NOT NULL CHECK (amount >= 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  competence_month date NULL,
  description text NULL,
  notes text NULL,
  payment_proof_url text NULL,
  status text NOT NULL DEFAULT 'PAGO' CHECK (status IN ('PENDENTE','PAGO','CANCELADO')),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_teacher_payments_teacher
  ON public.school_teacher_payments(teacher_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_school_teacher_payments_closure
  ON public.school_teacher_payments(closure_id);
CREATE INDEX IF NOT EXISTS idx_school_teacher_payments_unit
  ON public.school_teacher_payments(unit_id, payment_date DESC);

-- 3. RLS
ALTER TABLE public.school_teacher_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access school_teacher_payments"
  ON public.school_teacher_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company school_teacher_payments"
  ON public.school_teacher_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin Unidade manage unit school_teacher_payments"
  ON public.school_teacher_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Teacher can view own school_teacher_payments"
  ON public.school_teacher_payments FOR SELECT TO authenticated
  USING (teacher_id = get_teacher_id_for(auth.uid()));

-- 4. Trigger para manter paid_amount/status do fechamento atualizado
CREATE OR REPLACE FUNCTION public.recalc_school_payroll_closure(_closure_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_new_status text;
  v_current_status text;
BEGIN
  IF _closure_id IS NULL THEN RETURN; END IF;

  SELECT total_value, status INTO v_total, v_current_status
  FROM public.school_payroll_closures WHERE id = _closure_id;

  IF v_total IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
  FROM public.school_teacher_payments
  WHERE closure_id = _closure_id AND status = 'PAGO';

  IF v_current_status = 'CANCELED' THEN
    v_new_status := 'CANCELED';
  ELSIF v_paid >= v_total AND v_total > 0 THEN
    v_new_status := 'PAID';
  ELSIF v_paid > 0 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'PENDING';
  END IF;

  UPDATE public.school_payroll_closures
    SET paid_amount = v_paid,
        status = v_new_status,
        paid_at = CASE WHEN v_new_status='PAID' THEN COALESCE(paid_at, now()) ELSE paid_at END,
        updated_at = now()
  WHERE id = _closure_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.school_teacher_payments_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_school_payroll_closure(OLD.closure_id);
    RETURN OLD;
  ELSE
    IF TG_OP = 'UPDATE' AND OLD.closure_id IS DISTINCT FROM NEW.closure_id THEN
      PERFORM public.recalc_school_payroll_closure(OLD.closure_id);
    END IF;
    PERFORM public.recalc_school_payroll_closure(NEW.closure_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_teacher_payments_recalc ON public.school_teacher_payments;
CREATE TRIGGER trg_school_teacher_payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.school_teacher_payments
FOR EACH ROW EXECUTE FUNCTION public.school_teacher_payments_after_change();

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_school_teacher_payments_updated ON public.school_teacher_payments;
CREATE TRIGGER trg_school_teacher_payments_updated
BEFORE UPDATE ON public.school_teacher_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. Atualizar status check do fechamento
ALTER TABLE public.school_payroll_closures DROP CONSTRAINT IF EXISTS school_payroll_closures_status_check;
ALTER TABLE public.school_payroll_closures
  ADD CONSTRAINT school_payroll_closures_status_check
  CHECK (status IN ('PENDING','PARTIAL','PAID','CANCELED'));