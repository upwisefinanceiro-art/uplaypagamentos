ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS cancellation_date date,
  ADD COLUMN IF NOT EXISTS cancellation_penalty_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_installments_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_base_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_penalty_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;