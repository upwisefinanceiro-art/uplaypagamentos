
-- 1. Add unit_id to saas_subscriptions
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE;

-- 2. Drop unique constraint on company_id, add unique on unit_id
ALTER TABLE public.saas_subscriptions
  DROP CONSTRAINT IF EXISTS saas_subscriptions_company_id_key;

ALTER TABLE public.saas_subscriptions
  ADD CONSTRAINT saas_subscriptions_unit_id_key UNIQUE (unit_id);

-- 3. Add unit_id to saas_invoices
ALTER TABLE public.saas_invoices
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE;

-- 4. Backfill unit_id from company_id for existing records
UPDATE public.saas_subscriptions ss
SET unit_id = (
  SELECT u.id FROM public.units u WHERE u.company_id = ss.company_id LIMIT 1
)
WHERE ss.unit_id IS NULL AND ss.company_id IS NOT NULL;

UPDATE public.saas_invoices si
SET unit_id = (
  SELECT u.id FROM public.units u WHERE u.company_id = si.company_id LIMIT 1
)
WHERE si.unit_id IS NULL AND si.company_id IS NOT NULL;

-- 5. RLS policies for ADMIN_MASTER to manage saas_subscriptions
CREATE POLICY "Admin Master can manage company saas_subscriptions"
ON public.saas_subscriptions
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND company_id IN (
    SELECT u.company_id FROM public.units u WHERE u.id = get_user_unit_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND company_id IN (
    SELECT u.company_id FROM public.units u WHERE u.id = get_user_unit_id(auth.uid())
  )
);

-- 6. RLS policy for ADMIN_MASTER to manage saas_invoices (insert/update/delete)
CREATE POLICY "Admin Master can manage company saas_invoices"
ON public.saas_invoices
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND company_id IN (
    SELECT u.company_id FROM public.units u WHERE u.id = get_user_unit_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND company_id IN (
    SELECT u.company_id FROM public.units u WHERE u.id = get_user_unit_id(auth.uid())
  )
);

-- 7. Add units to realtime publication (ignore if already there)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'units'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.units;
  END IF;
END $$;
