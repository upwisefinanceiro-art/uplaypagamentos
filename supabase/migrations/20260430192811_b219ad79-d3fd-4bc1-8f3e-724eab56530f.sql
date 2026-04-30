ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS cora_client_id text,
  ADD COLUMN IF NOT EXISTS cora_certificate text,
  ADD COLUMN IF NOT EXISTS cora_private_key text,
  ADD COLUMN IF NOT EXISTS cora_environment text DEFAULT 'stage',
  ADD COLUMN IF NOT EXISTS preferred_bank text NOT NULL DEFAULT 'asaas';