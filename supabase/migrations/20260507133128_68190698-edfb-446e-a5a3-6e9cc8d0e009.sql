
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS cora_fee_pix numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cora_fee_boleto numeric NOT NULL DEFAULT 2.50;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cora_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS cora_fee_source text;
