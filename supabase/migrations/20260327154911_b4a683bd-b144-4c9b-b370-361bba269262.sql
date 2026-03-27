
CREATE OR REPLACE FUNCTION public.get_email_by_cpf(_cpf text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles
  WHERE replace(replace(cpf, '.', ''), '-', '') = replace(replace(_cpf, '.', ''), '-', '')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_cpf(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_cpf(text) TO authenticated;
