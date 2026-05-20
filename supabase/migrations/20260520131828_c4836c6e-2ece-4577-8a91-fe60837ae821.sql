DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_lessons'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_lessons;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_teachers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_teachers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_payroll_closures'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_payroll_closures;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_teacher_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_teacher_payments;
  END IF;
END $$;