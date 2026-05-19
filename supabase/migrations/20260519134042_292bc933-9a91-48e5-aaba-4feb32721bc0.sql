CREATE OR REPLACE FUNCTION public.school_teachers_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Service role (edge functions) sem auth.uid() bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin :=
       public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    OR public.has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role);

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cadastro de professor';
  END IF;

  RETURN NEW;
END;
$function$;