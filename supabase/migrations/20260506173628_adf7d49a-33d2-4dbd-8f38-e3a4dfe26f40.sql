CREATE OR REPLACE FUNCTION public.find_duplicate_cpf(_cpf text, _exclude_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE regexp_replace(coalesce(p.cpf,''), '\D', '', 'g') = regexp_replace(coalesce(_cpf,''), '\D', '', 'g')
    AND length(regexp_replace(coalesce(_cpf,''), '\D', '', 'g')) = 11
    AND (_exclude_id IS NULL OR p.id <> _exclude_id)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_cpf(text, uuid) TO authenticated, anon;