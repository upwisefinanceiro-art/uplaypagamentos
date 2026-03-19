
-- Add apostila fields to contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS apostilas_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apostilas_qty integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apostilas_total_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apostilas_interval_months integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS apostilas_start_date date;
