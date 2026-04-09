
-- Fix 1: Remove sensitive tables from Realtime publication safely
DO $$
BEGIN
  -- Remove units if published
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'units'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.units;
  END IF;

  -- Remove companies if published
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'companies'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.companies;
  END IF;

  -- Remove payments if published
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.payments;
  END IF;

  -- Remove saas_invoices if published
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'saas_invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.saas_invoices;
  END IF;

  -- Remove saas_subscriptions if published
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'saas_subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.saas_subscriptions;
  END IF;
END $$;

-- Fix 2: Add RESPONSAVEL SELECT policy on delivery_notifications
CREATE POLICY "Responsavel can view own deliveries"
ON public.delivery_notifications
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'RESPONSAVEL'::app_role)
  AND responsible_id = auth.uid()
);
