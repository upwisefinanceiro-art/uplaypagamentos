
-- =============================================
-- 1. FIX CROSS-TENANT RLS ON audit_logs
-- =============================================

-- Drop old policies
DROP POLICY IF EXISTS "Admin Unidade can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admin Master can manage company audit logs" ON public.audit_logs;

-- Admin Unidade: can only see audit logs performed by users in their unit
CREATE POLICY "Admin Unidade can view unit audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND performed_by IN (
    SELECT id FROM public.profiles WHERE unit_id = get_user_unit_id(auth.uid())
  )
);

-- Admin Master: can only see/manage audit logs performed by users in their company
CREATE POLICY "Admin Master can manage company audit logs"
ON public.audit_logs
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND performed_by IN (
    SELECT p.id FROM public.profiles p
    JOIN public.units u ON p.unit_id = u.id
    WHERE u.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND performed_by IN (
    SELECT p.id FROM public.profiles p
    JOIN public.units u ON p.unit_id = u.id
    WHERE u.company_id = get_user_company_id(auth.uid())
  )
);

-- =============================================
-- 2. FIX CROSS-TENANT RLS ON webhook_logs + REMOVE ANON INSERT
-- =============================================

DROP POLICY IF EXISTS "Admin Unidade can view webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Admin Master can manage company webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Service can insert webhook logs" ON public.webhook_logs;

-- Admin Unidade: scoped to their unit
CREATE POLICY "Admin Unidade can view unit webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND unit_id = get_user_unit_id(auth.uid())
);

-- Admin Master: scoped to their company
CREATE POLICY "Admin Master can manage company webhook logs"
ON public.webhook_logs
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (
    SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND unit_id IN (
    SELECT id FROM public.units WHERE company_id = get_user_company_id(auth.uid())
  )
);

-- =============================================
-- 3. FIX CROSS-TENANT RLS ON whatsapp_message_logs
-- =============================================

DROP POLICY IF EXISTS "Admin Unidade can view logs" ON public.whatsapp_message_logs;
DROP POLICY IF EXISTS "Admin Master can manage company whatsapp logs" ON public.whatsapp_message_logs;

-- Admin Unidade: scoped to responsible users in their unit
CREATE POLICY "Admin Unidade can view unit whatsapp logs"
ON public.whatsapp_message_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role)
  AND responsible_id IN (
    SELECT id FROM public.profiles WHERE unit_id = get_user_unit_id(auth.uid())
  )
);

-- Admin Master: scoped to their company
CREATE POLICY "Admin Master can manage company whatsapp logs"
ON public.whatsapp_message_logs
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND responsible_id IN (
    SELECT p.id FROM public.profiles p
    JOIN public.units u ON p.unit_id = u.id
    WHERE u.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND responsible_id IN (
    SELECT p.id FROM public.profiles p
    JOIN public.units u ON p.unit_id = u.id
    WHERE u.company_id = get_user_company_id(auth.uid())
  )
);

-- =============================================
-- 4. FIX PRIVILEGE ESCALATION IN user_roles
-- =============================================

DROP POLICY IF EXISTS "Admin Master can manage company roles" ON public.user_roles;

-- Admin Master can manage roles ONLY for users in their company, and CANNOT assign SUPER_ADMIN
CREATE POLICY "Admin Master can manage company roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM public.units
      WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
  AND role != 'SUPER_ADMIN'::app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND p.unit_id IN (
      SELECT units.id FROM public.units
      WHERE units.company_id = get_user_company_id(auth.uid())
    )
  )
);
