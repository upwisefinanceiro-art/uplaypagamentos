
-- Multi-unit teacher: allow same profile linked to school_teachers in multiple units
-- Add helper that returns ANY teacher row owned by user (for RLS)

CREATE OR REPLACE FUNCTION public.is_teacher_of(_user_id uuid, _teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.school_teachers
    WHERE id = _teacher_id AND profile_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_ids_for(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.school_teachers WHERE profile_id = _user_id AND active = true;
$$;

-- Recreate policies that previously used single get_teacher_id_for() to support multiple teacher rows per profile

DROP POLICY IF EXISTS "Teacher can view own lessons" ON public.school_lessons;
CREATE POLICY "Teacher can view own lessons" ON public.school_lessons
  FOR SELECT TO authenticated
  USING (public.is_teacher_of(auth.uid(), teacher_id));

DROP POLICY IF EXISTS "Teacher can update own lessons" ON public.school_lessons;
DROP POLICY IF EXISTS "Teacher can confirm or cancel own lessons" ON public.school_lessons;
CREATE POLICY "Teacher can confirm or cancel own lessons" ON public.school_lessons
  FOR UPDATE TO authenticated
  USING (public.is_teacher_of(auth.uid(), teacher_id))
  WITH CHECK (
    public.is_teacher_of(auth.uid(), teacher_id)
    AND status IN ('SCHEDULED','CONFIRMED','CANCELED')
  );

DROP POLICY IF EXISTS "Teacher can view own taught classes" ON public.school_classes;
CREATE POLICY "Teacher can view own taught classes" ON public.school_classes
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT DISTINCT sl.class_id FROM public.school_lessons sl
      WHERE sl.class_id IS NOT NULL
        AND sl.teacher_id IN (SELECT public.get_teacher_ids_for(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Teacher can view own taught courses" ON public.courses;
CREATE POLICY "Teacher can view own taught courses" ON public.courses
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT DISTINCT sl.course_id FROM public.school_lessons sl
      WHERE sl.course_id IS NOT NULL
        AND sl.teacher_id IN (SELECT public.get_teacher_ids_for(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Teacher can view own payroll closures" ON public.school_payroll_closures;
CREATE POLICY "Teacher can view own payroll closures" ON public.school_payroll_closures
  FOR SELECT TO authenticated
  USING (public.is_teacher_of(auth.uid(), teacher_id));

DROP POLICY IF EXISTS "Teacher can view own payments" ON public.school_teacher_payments;
CREATE POLICY "Teacher can view own payments" ON public.school_teacher_payments
  FOR SELECT TO authenticated
  USING (public.is_teacher_of(auth.uid(), teacher_id));

-- Allow teacher to see units they teach in
DROP POLICY IF EXISTS "Teacher can view own units" ON public.units;
CREATE POLICY "Teacher can view own units" ON public.units
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT st.unit_id FROM public.school_teachers st WHERE st.profile_id = auth.uid())
  );
