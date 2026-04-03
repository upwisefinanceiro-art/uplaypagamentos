
-- Add fields to saas_subscriptions
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS due_day integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS block_deadline date,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text;

-- Add fields to saas_invoices
ALTER TABLE public.saas_invoices
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS invoice_url text,
  ADD COLUMN IF NOT EXISTS boleto_url text,
  ADD COLUMN IF NOT EXISTS pix_copy_paste text;

-- Allow ADMIN_MASTER to view their own company's subscription
CREATE POLICY "Admin Master can view own subscription"
  ON public.saas_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND company_id IN (
      SELECT u.company_id FROM units u WHERE u.id = get_user_unit_id(auth.uid())
    )
  );

-- Allow ADMIN_MASTER to view their own company's invoices
CREATE POLICY "Admin Master can view own invoices"
  ON public.saas_invoices
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND company_id IN (
      SELECT u.company_id FROM units u WHERE u.id = get_user_unit_id(auth.uid())
    )
  );

-- Allow ADMIN_MASTER to view/update own company (for blocking screen)
CREATE POLICY "Admin Master can update own company"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND id IN (
      SELECT u.company_id FROM units u WHERE u.id = get_user_unit_id(auth.uid())
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
    AND id IN (
      SELECT u.company_id FROM units u WHERE u.id = get_user_unit_id(auth.uid())
    )
  );
