-- Flag per unit
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS school_module_enabled boolean NOT NULL DEFAULT false;

-- Teachers
CREATE TABLE IF NOT EXISTS public.school_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  company_id uuid NOT NULL,
  profile_id uuid NULL,
  full_name text NOT NULL,
  cpf text NULL,
  email text NULL,
  phone text NULL,
  hourly_rate numeric NOT NULL DEFAULT 0,
  pix_key text NULL,
  payment_type text NULL,
  subjects text[] NOT NULL DEFAULT '{}',
  notes text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_teachers_unit ON public.school_teachers(unit_id);
CREATE INDEX IF NOT EXISTS idx_school_teachers_profile ON public.school_teachers(profile_id);

CREATE TABLE IF NOT EXISTS public.school_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  company_id uuid NOT NULL,
  course_id uuid NULL,
  name text NOT NULL,
  notes text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_classes_unit ON public.school_classes(unit_id);

CREATE TABLE IF NOT EXISTS public.school_lesson_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  company_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  class_id uuid NULL,
  course_id uuid NULL,
  weekdays smallint[] NOT NULL DEFAULT '{}',
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_recurrences_unit ON public.school_lesson_recurrences(unit_id);

CREATE TABLE IF NOT EXISTS public.school_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  company_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  class_id uuid NULL,
  course_id uuid NULL,
  recurrence_id uuid NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED',
  duration_hours numeric NOT NULL DEFAULT 0,
  computed_value numeric NOT NULL DEFAULT 0,
  hourly_rate_snapshot numeric NOT NULL DEFAULT 0,
  teacher_confirmed_at timestamptz NULL,
  validated_at timestamptz NULL,
  validated_by uuid NULL,
  canceled_at timestamptz NULL,
  cancel_reason text NULL,
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_school_lessons_unit_starts ON public.school_lessons(unit_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_school_lessons_teacher_starts ON public.school_lessons(teacher_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_school_lessons_status ON public.school_lessons(status);

CREATE OR REPLACE FUNCTION public.school_lessons_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  NEW.duration_hours := ROUND((EXTRACT(EPOCH FROM (NEW.ends_at - NEW.starts_at))/3600.0)::numeric, 4);
  IF NEW.hourly_rate_snapshot IS NULL OR NEW.hourly_rate_snapshot = 0 THEN
    SELECT hourly_rate INTO v_rate FROM public.school_teachers WHERE id = NEW.teacher_id;
    NEW.hourly_rate_snapshot := COALESCE(v_rate, 0);
  END IF;
  NEW.computed_value := ROUND((NEW.duration_hours * NEW.hourly_rate_snapshot)::numeric, 2);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_lessons_before_write ON public.school_lessons;
CREATE TRIGGER trg_school_lessons_before_write
BEFORE INSERT OR UPDATE ON public.school_lessons
FOR EACH ROW EXECUTE FUNCTION public.school_lessons_before_write();

DROP TRIGGER IF EXISTS trg_school_teachers_updated ON public.school_teachers;
CREATE TRIGGER trg_school_teachers_updated BEFORE UPDATE ON public.school_teachers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_school_classes_updated ON public.school_classes;
CREATE TRIGGER trg_school_classes_updated BEFORE UPDATE ON public.school_classes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_school_recurrences_updated ON public.school_lesson_recurrences;
CREATE TRIGGER trg_school_recurrences_updated BEFORE UPDATE ON public.school_lesson_recurrences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.school_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_lesson_recurrences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_teacher_id_for(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.school_teachers WHERE profile_id = _user_id LIMIT 1;
$$;

CREATE POLICY "Super Admin full access school_teachers" ON public.school_teachers
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company school_teachers" ON public.school_teachers
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin Unidade manage unit school_teachers" ON public.school_teachers
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Teacher can view self" ON public.school_teachers
FOR SELECT TO authenticated
USING (profile_id = auth.uid());

CREATE POLICY "Super Admin full access school_classes" ON public.school_classes
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company school_classes" ON public.school_classes
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin Unidade manage unit school_classes" ON public.school_classes
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Teacher can view classes of own unit" ON public.school_classes
FOR SELECT TO authenticated
USING (unit_id IN (SELECT unit_id FROM public.school_teachers WHERE profile_id = auth.uid()));

CREATE POLICY "Super Admin full access school_lessons" ON public.school_lessons
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company school_lessons" ON public.school_lessons
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin Unidade manage unit school_lessons" ON public.school_lessons
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE POLICY "Teacher can view own lessons" ON public.school_lessons
FOR SELECT TO authenticated
USING (teacher_id = get_teacher_id_for(auth.uid()));

CREATE POLICY "Teacher can update own lessons" ON public.school_lessons
FOR UPDATE TO authenticated
USING (teacher_id = get_teacher_id_for(auth.uid()))
WITH CHECK (teacher_id = get_teacher_id_for(auth.uid()));

CREATE POLICY "Super Admin full access school_recurrences" ON public.school_lesson_recurrences
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master manage company school_recurrences" ON public.school_lesson_recurrences
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin Unidade manage unit school_recurrences" ON public.school_lesson_recurrences
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

-- Enable module on Serra Verde & Morro Alto
UPDATE public.units
SET school_module_enabled = true
WHERE lower(name) LIKE '%serra verde%' OR lower(name) LIKE '%morro alto%';