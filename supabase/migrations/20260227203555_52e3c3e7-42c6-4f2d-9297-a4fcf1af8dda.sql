
-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('ADMIN_MASTER', 'ADMIN_UNIDADE', 'RESPONSAVEL');

-- Units table (each school unit with independent Asaas credentials)
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  asaas_api_key TEXT,
  asaas_base_url TEXT DEFAULT 'https://api.asaas.com/v3',
  asaas_webhook_token TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cpf TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  unit_id UUID REFERENCES public.units(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id),
  responsible_id UUID NOT NULL REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  birth_date DATE,
  enrollment_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contracts table
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  responsible_id UUID NOT NULL REFERENCES auth.users(id),
  description TEXT NOT NULL,
  total_value NUMERIC(10,2) NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  asaas_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id),
  contract_id UUID NOT NULL REFERENCES public.contracts(id),
  responsible_id UUID NOT NULL REFERENCES auth.users(id),
  installment_number INTEGER NOT NULL DEFAULT 1,
  due_date DATE NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payment_method TEXT,
  asaas_payment_id TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  boleto_url TEXT,
  boleto_barcode TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's unit_id
CREATE OR REPLACE FUNCTION public.get_user_unit_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id FROM public.profiles WHERE id = _user_id
$$;

-- Create a public view for units without sensitive fields
CREATE VIEW public.units_public
WITH (security_invoker = on) AS
  SELECT id, name, cnpj, address, phone, active, created_at, updated_at
  FROM public.units;

-- ============ RLS POLICIES ============

-- UNITS: Admin Master can do everything, Admin Unidade can see their own unit
CREATE POLICY "Admin Master full access to units"
  ON public.units FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_MASTER'));

CREATE POLICY "Admin Unidade can view own unit"
  ON public.units FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND id = public.get_user_unit_id(auth.uid())
  );

-- PROFILES: Users can view own profile, admins can manage
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admin Master can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_MASTER'));

CREATE POLICY "Admin Unidade can view unit profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  );

-- USER_ROLES: Only readable via security definer function, admin master can manage
CREATE POLICY "Admin Master can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_MASTER'));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- STUDENTS: unit isolation
CREATE POLICY "Admin Master can manage all students"
  ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_MASTER'));

CREATE POLICY "Admin Unidade can manage unit students"
  ON public.students FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  );

CREATE POLICY "Responsavel can view own students"
  ON public.students FOR SELECT TO authenticated
  USING (responsible_id = auth.uid());

-- CONTRACTS: unit isolation
CREATE POLICY "Admin Master can manage all contracts"
  ON public.contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_MASTER'));

CREATE POLICY "Admin Unidade can manage unit contracts"
  ON public.contracts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  );

CREATE POLICY "Responsavel can view own contracts"
  ON public.contracts FOR SELECT TO authenticated
  USING (responsible_id = auth.uid());

-- PAYMENTS: unit isolation
CREATE POLICY "Admin Master can manage all payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_MASTER'));

CREATE POLICY "Admin Unidade can manage unit payments"
  ON public.payments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN_UNIDADE')
    AND unit_id = public.get_user_unit_id(auth.uid())
  );

CREATE POLICY "Responsavel can view own payments"
  ON public.payments FOR SELECT TO authenticated
  USING (responsible_id = auth.uid());

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, cpf, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
