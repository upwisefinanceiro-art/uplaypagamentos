
-- Add asaas_customer_id to profiles for customer tracking per responsible
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- Add checkout_url and raw_response to payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_url text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS raw_response jsonb;
