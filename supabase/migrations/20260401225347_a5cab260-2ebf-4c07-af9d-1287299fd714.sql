
-- SaaS Subscriptions
CREATE TABLE public.saas_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'FREE',
  monthly_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone,
  next_billing_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to saas_subscriptions"
ON public.saas_subscriptions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'SUPER_ADMIN'))
WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'));

CREATE TRIGGER update_saas_subscriptions_updated_at
BEFORE UPDATE ON public.saas_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- SaaS Invoices
CREATE TABLE public.saas_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.saas_subscriptions(id) ON DELETE SET NULL,
  value numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  due_date date NOT NULL,
  paid_at timestamp with time zone,
  description text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to saas_invoices"
ON public.saas_invoices FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'SUPER_ADMIN'))
WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'));
