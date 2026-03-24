ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS whatsapp_financeiro text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS usar_whatsapp_padrao boolean NOT NULL DEFAULT true;