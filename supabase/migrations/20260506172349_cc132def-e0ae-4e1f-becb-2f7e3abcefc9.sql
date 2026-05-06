CREATE OR REPLACE FUNCTION public.resolve_auth_email(_login text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input AS (
    SELECT
      lower(trim(_login)) AS raw,
      regexp_replace(coalesce(_login,''), '\D', '', 'g') AS digits
  )
  SELECT u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  CROSS JOIN input i
  WHERE
    (i.raw LIKE '%@%' AND (lower(p.email) = i.raw OR lower(u.email) = i.raw))
    OR (length(i.digits) = 11 AND regexp_replace(coalesce(p.cpf,''), '\D', '', 'g') = i.digits)
  ORDER BY (lower(u.email) = i.raw) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_auth_email(text) TO anon, authenticated;