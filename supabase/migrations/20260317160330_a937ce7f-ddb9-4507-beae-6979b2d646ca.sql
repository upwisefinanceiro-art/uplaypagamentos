
-- Add responsible/address fields and financial fields to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS responsible_name text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS proof_of_address_url text,
  ADD COLUMN IF NOT EXISTS first_due_date date,
  ADD COLUMN IF NOT EXISTS course_real_value numeric,
  ADD COLUMN IF NOT EXISTS punctuality_discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_value_with_discount numeric,
  ADD COLUMN IF NOT EXISTS due_day integer,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add discount/original value fields to payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS original_value numeric,
  ADD COLUMN IF NOT EXISTS punctuality_discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_value numeric;
