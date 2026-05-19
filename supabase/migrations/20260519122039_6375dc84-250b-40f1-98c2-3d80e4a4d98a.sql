
-- 1) school_classes: professor só vê turmas onde ele dá aulas
DROP POLICY IF EXISTS "Teacher can view classes of own unit" ON public.school_classes;

CREATE POLICY "Teacher can view own taught classes"
  ON public.school_classes FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT DISTINCT class_id FROM public.school_lessons
      WHERE teacher_id = public.get_teacher_id_for(auth.uid())
        AND class_id IS NOT NULL
    )
  );

-- 2) courses: professor pode ver nome dos cursos que ele leciona
CREATE POLICY "Teacher can view own taught courses"
  ON public.courses FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT DISTINCT course_id FROM public.school_lessons
      WHERE teacher_id = public.get_teacher_id_for(auth.uid())
        AND course_id IS NOT NULL
    )
  );

-- 3) school_lessons: professor só pode mudar status para CONFIRMED ou CANCELED
--    (não pode auto-validar, não pode alterar valores/hora-aula/teacher_id)
DROP POLICY IF EXISTS "Teacher can update own lessons" ON public.school_lessons;

CREATE POLICY "Teacher can confirm or cancel own lessons"
  ON public.school_lessons FOR UPDATE TO authenticated
  USING (teacher_id = public.get_teacher_id_for(auth.uid()))
  WITH CHECK (
    teacher_id = public.get_teacher_id_for(auth.uid())
    AND status IN ('SCHEDULED','CONFIRMED','CANCELED')
  );

-- Trigger para impedir que o professor altere campos sensíveis em suas próprias aulas
CREATE OR REPLACE FUNCTION public.school_lessons_teacher_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin :=
       public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role);

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Professor: bloquear alterações em campos financeiros / estruturais
  IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
     OR NEW.hourly_rate_snapshot IS DISTINCT FROM OLD.hourly_rate_snapshot
     OR NEW.computed_value IS DISTINCT FROM OLD.computed_value
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.course_id IS DISTINCT FROM OLD.course_id
     OR NEW.payroll_closure_id IS DISTINCT FROM OLD.payroll_closure_id
     OR NEW.validated_at IS DISTINCT FROM OLD.validated_at
     OR NEW.validated_by IS DISTINCT FROM OLD.validated_by THEN
    RAISE EXCEPTION 'Professor não pode alterar dados financeiros/estruturais da aula';
  END IF;

  -- Professor só pode mudar status para CONFIRMED ou CANCELED
  IF NEW.status NOT IN ('SCHEDULED','CONFIRMED','CANCELED') THEN
    RAISE EXCEPTION 'Professor só pode confirmar ou cancelar aulas';
  END IF;

  -- Não pode reverter de VALIDATED
  IF OLD.status = 'VALIDATED' THEN
    RAISE EXCEPTION 'Aula já validada não pode ser alterada pelo professor';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_school_lessons_teacher_guard ON public.school_lessons;
CREATE TRIGGER tg_school_lessons_teacher_guard
  BEFORE UPDATE ON public.school_lessons
  FOR EACH ROW EXECUTE FUNCTION public.school_lessons_teacher_guard();

-- 4) school_teachers: professor já só vê a si mesmo (política existente).
--    Garante que ele NÃO pode editar o próprio cadastro (hora-aula, PIX, etc.)
--    Não criamos política de UPDATE para teacher → RLS bloqueia por padrão.
--    Apenas reforçamos via trigger para o caso de alguém criar política futura por engano.
CREATE OR REPLACE FUNCTION public.school_teachers_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin :=
       public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role);

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cadastro de professor';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_school_teachers_guard ON public.school_teachers;
CREATE TRIGGER tg_school_teachers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.school_teachers
  FOR EACH ROW EXECUTE FUNCTION public.school_teachers_guard();
