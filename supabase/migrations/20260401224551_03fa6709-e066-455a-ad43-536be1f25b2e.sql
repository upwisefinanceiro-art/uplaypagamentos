
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  system_name text NOT NULL DEFAULT 'Sistema',
  logo_url text,
  primary_color text DEFAULT '#3B82F6',
  secondary_color text DEFAULT '#1E40AF',
  whatsapp_financeiro text,
  plan text NOT NULL DEFAULT 'FREE',
  status text NOT NULL DEFAULT 'ATIVO',
  max_units integer NOT NULL DEFAULT 1,
  max_users integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Add company_id to units BEFORE creating policies that reference it
ALTER TABLE public.units ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3. Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 4. RLS: SUPER_ADMIN full access
CREATE POLICY "Super Admin full access to companies"
ON public.companies FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'SUPER_ADMIN'))
WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'));

-- 5. RLS: ADMIN_MASTER can view own company
CREATE POLICY "Admin Master can view own company"
ON public.companies FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ADMIN_MASTER') AND
  id IN (
    SELECT u.company_id FROM public.units u
    WHERE u.id = public.get_user_unit_id(auth.uid())
  )
);

-- 6. Trigger for updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();
