
-- Add payroll closure link to lessons
ALTER TABLE public.school_lessons
  ADD COLUMN IF NOT EXISTS payroll_closure_id uuid;

-- Payroll closures table (monthly per teacher)
CREATE TABLE IF NOT EXISTS public.school_payroll_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  reference_month date NOT NULL, -- always YYYY-MM-01
  lessons_count integer NOT NULL DEFAULT 0,
  total_hours numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING', -- PENDING | PAID | CANCELED
  paid_at timestamptz,
  payment_proof_url text,
  notes text,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_closures_unit_month
  ON public.school_payroll_closures (unit_id, reference_month DESC);

ALTER TABLE public.school_payroll_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access school_payroll_closures"
  ON public.school_payroll_closures FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company school_payroll_closures"
  ON public.school_payroll_closures FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin Unidade manage unit school_payroll_closures"
  ON public.school_payroll_closures FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Teacher can view own payroll_closures"
  ON public.school_payroll_closures FOR SELECT TO authenticated
  USING (teacher_id = get_teacher_id_for(auth.uid()));

CREATE TRIGGER tg_payroll_closures_updated_at
  BEFORE UPDATE ON public.school_payroll_closures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to generate (or refresh) a monthly closure for a teacher
CREATE OR REPLACE FUNCTION public.generate_school_payroll_closure(
  _teacher_id uuid,
  _reference_month date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher RECORD;
  v_month_start date;
  v_month_end date;
  v_count integer;
  v_hours numeric;
  v_value numeric;
  v_closure_id uuid;
  v_existing RECORD;
BEGIN
  SELECT * INTO v_teacher FROM public.school_teachers WHERE id = _teacher_id;
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'Professor não encontrado';
  END IF;

  -- Authorization
  IF NOT (
    has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND v_teacher.company_id = get_user_company_id(auth.uid()))
    OR (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND v_teacher.unit_id = get_user_unit_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  v_month_start := date_trunc('month', _reference_month)::date;
  v_month_end := (v_month_start + interval '1 month')::date;

  -- Block re-generation if already PAID
  SELECT * INTO v_existing FROM public.school_payroll_closures
    WHERE teacher_id = _teacher_id AND reference_month = v_month_start;
  IF v_existing.id IS NOT NULL AND v_existing.status = 'PAID' THEN
    RAISE EXCEPTION 'Fechamento já está PAGO e não pode ser regerado';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(duration_hours),0), COALESCE(SUM(computed_value),0)
    INTO v_count, v_hours, v_value
    FROM public.school_lessons
    WHERE teacher_id = _teacher_id
      AND status = 'VALIDATED'
      AND starts_at >= v_month_start
      AND starts_at <  v_month_end
      AND (payroll_closure_id IS NULL OR payroll_closure_id = COALESCE(v_existing.id, '00000000-0000-0000-0000-000000000000'::uuid));

  IF v_existing.id IS NULL THEN
    INSERT INTO public.school_payroll_closures (
      company_id, unit_id, teacher_id, reference_month,
      lessons_count, total_hours, total_value, status, generated_by
    ) VALUES (
      v_teacher.company_id, v_teacher.unit_id, _teacher_id, v_month_start,
      v_count, v_hours, v_value, 'PENDING', auth.uid()
    ) RETURNING id INTO v_closure_id;
  ELSE
    UPDATE public.school_payroll_closures SET
      lessons_count = v_count,
      total_hours = v_hours,
      total_value = v_value,
      generated_by = auth.uid(),
      generated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_closure_id;
  END IF;

  -- Link lessons to this closure
  UPDATE public.school_lessons
    SET payroll_closure_id = v_closure_id
    WHERE teacher_id = _teacher_id
      AND status = 'VALIDATED'
      AND starts_at >= v_month_start
      AND starts_at <  v_month_end;

  RETURN v_closure_id;
END;
$$;

-- Mark closure as paid
CREATE OR REPLACE FUNCTION public.mark_school_payroll_paid(
  _closure_id uuid,
  _proof_url text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closure RECORD;
BEGIN
  SELECT * INTO v_closure FROM public.school_payroll_closures WHERE id = _closure_id;
  IF v_closure IS NULL THEN
    RAISE EXCEPTION 'Fechamento não encontrado';
  END IF;
  IF NOT (
    has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND v_closure.company_id = get_user_company_id(auth.uid()))
    OR (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND v_closure.unit_id = get_user_unit_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  UPDATE public.school_payroll_closures
    SET status = 'PAID',
        paid_at = now(),
        payment_proof_url = COALESCE(_proof_url, payment_proof_url),
        notes = COALESCE(_notes, notes)
    WHERE id = _closure_id;
END;
$$;
