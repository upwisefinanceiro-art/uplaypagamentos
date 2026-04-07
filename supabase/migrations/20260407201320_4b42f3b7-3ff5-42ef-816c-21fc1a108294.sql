
-- Add SaaS contract fields to saas_subscriptions
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'UNDEFINED',
  ADD COLUMN IF NOT EXISTS punctuality_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_installments integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS first_due_date date;

-- Add WhatsApp master to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp_master text;

-- Add billing details to saas_invoices
ALTER TABLE public.saas_invoices
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'UNDEFINED',
  ADD COLUMN IF NOT EXISTS punctuality_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_value numeric;
