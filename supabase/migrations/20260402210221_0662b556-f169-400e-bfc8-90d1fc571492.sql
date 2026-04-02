
-- Function to get user's company_id from their unit
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.company_id 
  FROM public.units u
  JOIN public.profiles p ON p.unit_id = u.id
  WHERE p.id = _user_id
  LIMIT 1
$$;

-- Drop the unique constraint on cpf to allow multiple admins
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cpf_key;

-- Create a partial unique index instead (unique only for non-empty CPFs)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique_nonempty 
ON public.profiles (cpf) WHERE cpf IS NOT NULL AND cpf != '';

-- ============ Update ADMIN_MASTER RLS policies to filter by company ============

-- PROFILES
DROP POLICY IF EXISTS "Admin Master can manage all profiles" ON public.profiles;
CREATE POLICY "Admin Master can manage company profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND (
      unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
      OR id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND (
      unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
      OR id = auth.uid()
    )
  );

-- SUPER_ADMIN full access to profiles
CREATE POLICY "Super Admin full access to profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- UNITS
DROP POLICY IF EXISTS "Admin Master full access to units" ON public.units;
CREATE POLICY "Admin Master can manage company units" ON public.units
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    company_id = get_user_company_id(auth.uid())
  );

-- SUPER_ADMIN full access to units
CREATE POLICY "Super Admin full access to units" ON public.units
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- STUDENTS
DROP POLICY IF EXISTS "Admin Master can manage all students" ON public.students;
CREATE POLICY "Admin Master can manage company students" ON public.students
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  );

-- SUPER_ADMIN full access to students
CREATE POLICY "Super Admin full access to students" ON public.students
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- CONTRACTS
DROP POLICY IF EXISTS "Admin Master can manage all contracts" ON public.contracts;
CREATE POLICY "Admin Master can manage company contracts" ON public.contracts
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  );

-- SUPER_ADMIN full access to contracts
CREATE POLICY "Super Admin full access to contracts" ON public.contracts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- PAYMENTS
DROP POLICY IF EXISTS "Admin Master can manage all payments" ON public.payments;
CREATE POLICY "Admin Master can manage company payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND 
    unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
  );

-- SUPER_ADMIN full access to payments
CREATE POLICY "Super Admin full access to payments" ON public.payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- USER_ROLES
DROP POLICY IF EXISTS "Admin Master can manage roles" ON public.user_roles;
CREATE POLICY "Admin Master can manage company roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND (
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = user_roles.user_id 
        AND p.unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
      )
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND (
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = user_roles.user_id 
        AND p.unit_id IN (SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid()))
      )
    )
  );

-- SUPER_ADMIN full access to user_roles
CREATE POLICY "Super Admin full access to user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- AUDIT_LOGS
DROP POLICY IF EXISTS "Admin Master can manage all audit logs" ON public.audit_logs;
CREATE POLICY "Admin Master can manage company audit logs" ON public.audit_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role));

-- SUPER_ADMIN full access to audit_logs
CREATE POLICY "Super Admin full access to audit_logs" ON public.audit_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- WHATSAPP_MESSAGE_LOGS
DROP POLICY IF EXISTS "Admin Master can manage all logs" ON public.whatsapp_message_logs;
CREATE POLICY "Admin Master can manage company whatsapp logs" ON public.whatsapp_message_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role));

-- SUPER_ADMIN full access to whatsapp logs
CREATE POLICY "Super Admin full access to whatsapp_message_logs" ON public.whatsapp_message_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

-- WEBHOOK_LOGS
DROP POLICY IF EXISTS "Admin Master can manage webhook logs" ON public.webhook_logs;
CREATE POLICY "Admin Master can manage company webhook logs" ON public.webhook_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role));

-- SUPER_ADMIN full access to webhook logs
CREATE POLICY "Super Admin full access to webhook_logs" ON public.webhook_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));
