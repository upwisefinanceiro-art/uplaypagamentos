
-- 1) resolve_auth_email: also consider school_teachers.cpf/email (multiunidade, sem profile)
CREATE OR REPLACE FUNCTION public.resolve_auth_email(_login text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input AS (
    SELECT
      lower(trim(_login)) AS raw,
      regexp_replace(coalesce(_login,''), '\D', '', 'g') AS digits
  ),
  matches AS (
    -- via profiles
    SELECT u.email, 1 AS priority
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    CROSS JOIN input i
    WHERE
      (i.raw LIKE '%@%' AND (lower(p.email) = i.raw OR lower(u.email) = i.raw))
      OR (length(i.digits) = 11 AND regexp_replace(coalesce(p.cpf,''), '\D', '', 'g') = i.digits)
    UNION ALL
    -- via school_teachers (professor multiunidade pode existir sem profile vinculado)
    SELECT u.email, 2 AS priority
    FROM public.school_teachers st
    JOIN auth.users u ON u.id = st.profile_id
    CROSS JOIN input i
    WHERE st.active = true
      AND (
        (i.raw LIKE '%@%' AND (lower(st.email) = i.raw OR lower(u.email) = i.raw))
        OR (length(i.digits) = 11 AND regexp_replace(coalesce(st.cpf,''), '\D', '', 'g') = i.digits)
      )
    UNION ALL
    -- fallback direto pelo e-mail no auth.users
    SELECT u.email, 3 AS priority
    FROM auth.users u
    CROSS JOIN input i
    WHERE i.raw LIKE '%@%' AND lower(u.email) = i.raw
  )
  SELECT email FROM matches ORDER BY priority LIMIT 1;
$$;

-- 2) Índices em teacher_app_logs
CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_user_created
  ON public.teacher_app_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_status_created
  ON public.teacher_app_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_unit_created
  ON public.teacher_app_logs (unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_app_logs_event_created
  ON public.teacher_app_logs (event, created_at DESC);
