CREATE TABLE IF NOT EXISTS public.teacher_app_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  teacher_id uuid NULL,
  unit_id uuid NULL,
  company_id uuid NULL,
  event text NOT NULL,
  route text NULL,
  status text NOT NULL DEFAULT 'INFO',
  message text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.teacher_app_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can create own app logs" ON public.teacher_app_logs;
CREATE POLICY "Teachers can create own app logs"
ON public.teacher_app_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can view own app logs" ON public.teacher_app_logs;
CREATE POLICY "Teachers can view own app logs"
ON public.teacher_app_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin Master can view company teacher logs" ON public.teacher_app_logs;
CREATE POLICY "Admin Master can view company teacher logs"
ON public.teacher_app_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND company_id = public.get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Admin Unidade can view unit teacher logs" ON public.teacher_app_logs;
CREATE POLICY "Admin Unidade can view unit teacher logs"
ON public.teacher_app_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = public.get_user_unit_id(auth.uid())
);

DROP POLICY IF EXISTS "Super Admin full access to teacher logs" ON public.teacher_app_logs;
CREATE POLICY "Super Admin full access to teacher logs"
ON public.teacher_app_logs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

DROP POLICY IF EXISTS "Teacher can view own payroll_closures" ON public.school_payroll_closures;
DROP POLICY IF EXISTS "Teacher can view own school_teacher_payments" ON public.school_teacher_payments;

CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_user_created ON public.teacher_app_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_teacher_created ON public.teacher_app_logs(teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_unit_created ON public.teacher_app_logs(unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_teachers_profile_active ON public.school_teachers(profile_id, active) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_school_lessons_teacher_starts ON public.school_lessons(teacher_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_lessons_teacher_status ON public.school_lessons(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_school_lessons_unit_starts ON public.school_lessons(unit_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_payroll_closures_teacher_month ON public.school_payroll_closures(teacher_id, reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_school_teacher_payments_teacher_date ON public.school_teacher_payments(teacher_id, payment_date DESC);