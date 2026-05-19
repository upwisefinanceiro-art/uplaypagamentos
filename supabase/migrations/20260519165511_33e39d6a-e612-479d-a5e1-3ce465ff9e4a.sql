
-- 1) Configuração por unidade: dia de fechamento e dia de pagamento da folha
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS payroll_closing_day integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS payroll_payment_day integer NOT NULL DEFAULT 25;

-- 2) Função de fechamento automático (executada via cron, sem auth.uid())
CREATE OR REPLACE FUNCTION public.auto_generate_payroll_closures()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit RECORD;
  v_teacher RECORD;
  v_month_start date;
  v_month_end date;
  v_count integer;
  v_hours numeric;
  v_value numeric;
  v_closure_id uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_due date;
  v_pay date;
  v_today_day int := EXTRACT(DAY FROM CURRENT_DATE)::int;
  v_generated int := 0;
BEGIN
  FOR v_unit IN
    SELECT id, company_id, COALESCE(payroll_closing_day, 20) AS closing_day, COALESCE(payroll_payment_day, 25) AS payment_day
    FROM public.units
    WHERE COALESCE(active, true) = true
      AND COALESCE(payroll_closing_day, 20) = v_today_day
  LOOP
    v_month_start := date_trunc('month', CURRENT_DATE)::date;
    v_month_end := (v_month_start + interval '1 month')::date;
    v_due := make_date(
      EXTRACT(YEAR FROM CURRENT_DATE)::int,
      EXTRACT(MONTH FROM CURRENT_DATE)::int,
      LEAST(v_unit.payment_day, 28)
    );
    v_pay := v_due;

    FOR v_teacher IN
      SELECT id FROM public.school_teachers
      WHERE unit_id = v_unit.id AND active = true
    LOOP
      SELECT COUNT(*), COALESCE(SUM(duration_hours),0), COALESCE(SUM(computed_value),0)
        INTO v_count, v_hours, v_value
      FROM public.school_lessons
      WHERE teacher_id = v_teacher.id
        AND status = 'VALIDATED'
        AND starts_at >= v_month_start
        AND starts_at <  v_month_end;

      IF v_count = 0 THEN CONTINUE; END IF;

      SELECT id, status INTO v_existing_id, v_existing_status
      FROM public.school_payroll_closures
      WHERE teacher_id = v_teacher.id AND reference_month = v_month_start;

      IF v_existing_id IS NOT NULL AND v_existing_status = 'PAID' THEN CONTINUE; END IF;

      IF v_existing_id IS NULL THEN
        INSERT INTO public.school_payroll_closures(
          company_id, unit_id, teacher_id, reference_month,
          lessons_count, total_hours, total_value, status,
          due_date, scheduled_payment_date, generated_at
        ) VALUES (
          v_unit.company_id, v_unit.id, v_teacher.id, v_month_start,
          v_count, v_hours, v_value, 'PENDING',
          v_due, v_pay, now()
        ) RETURNING id INTO v_closure_id;
      ELSE
        UPDATE public.school_payroll_closures SET
          lessons_count = v_count,
          total_hours = v_hours,
          total_value = v_value,
          due_date = COALESCE(due_date, v_due),
          scheduled_payment_date = COALESCE(scheduled_payment_date, v_pay),
          generated_at = now(),
          updated_at = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_closure_id;
      END IF;

      UPDATE public.school_lessons
        SET payroll_closure_id = v_closure_id
      WHERE teacher_id = v_teacher.id
        AND status = 'VALIDATED'
        AND starts_at >= v_month_start
        AND starts_at <  v_month_end;

      v_generated := v_generated + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('generated', v_generated, 'date', CURRENT_DATE);
END;
$$;

-- 3) Agendamento diário às 03:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-payroll-closures-daily') THEN
    PERFORM cron.unschedule('auto-payroll-closures-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-payroll-closures-daily',
  '0 3 * * *',
  $cron$ SELECT public.auto_generate_payroll_closures(); $cron$
);

-- 4) Ajusta generate_school_payroll_closure para já preencher datas de vencimento/pagamento padrão
CREATE OR REPLACE FUNCTION public.generate_school_payroll_closure(_teacher_id uuid, _reference_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher RECORD;
  v_unit RECORD;
  v_month_start date;
  v_month_end date;
  v_count integer;
  v_hours numeric;
  v_value numeric;
  v_closure_id uuid;
  v_existing RECORD;
  v_due date;
  v_pay date;
BEGIN
  SELECT * INTO v_teacher FROM public.school_teachers WHERE id = _teacher_id;
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'Professor não encontrado';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND v_teacher.company_id = get_user_company_id(auth.uid()))
    OR (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND v_teacher.unit_id = get_user_unit_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT COALESCE(payroll_closing_day, 20) AS closing_day,
         COALESCE(payroll_payment_day, 25) AS payment_day
    INTO v_unit
  FROM public.units WHERE id = v_teacher.unit_id;

  v_month_start := date_trunc('month', _reference_month)::date;
  v_month_end := (v_month_start + interval '1 month')::date;
  v_due := make_date(EXTRACT(YEAR FROM v_month_start)::int, EXTRACT(MONTH FROM v_month_start)::int, LEAST(v_unit.payment_day, 28));
  v_pay := v_due;

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
      lessons_count, total_hours, total_value, status, generated_by,
      due_date, scheduled_payment_date
    ) VALUES (
      v_teacher.company_id, v_teacher.unit_id, _teacher_id, v_month_start,
      v_count, v_hours, v_value, 'PENDING', auth.uid(),
      v_due, v_pay
    ) RETURNING id INTO v_closure_id;
  ELSE
    UPDATE public.school_payroll_closures SET
      lessons_count = v_count,
      total_hours = v_hours,
      total_value = v_value,
      due_date = COALESCE(due_date, v_due),
      scheduled_payment_date = COALESCE(scheduled_payment_date, v_pay),
      generated_by = auth.uid(),
      generated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_closure_id;
  END IF;

  UPDATE public.school_lessons
    SET payroll_closure_id = v_closure_id
    WHERE teacher_id = _teacher_id
      AND status = 'VALIDATED'
      AND starts_at >= v_month_start
      AND starts_at <  v_month_end;

  RETURN v_closure_id;
END;
$function$;
