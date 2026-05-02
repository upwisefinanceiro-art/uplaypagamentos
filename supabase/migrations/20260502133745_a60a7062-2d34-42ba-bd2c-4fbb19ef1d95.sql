ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gateway TEXT;
COMMENT ON COLUMN public.payments.gateway IS 'Gateway de pagamento escolhido: ASAAS ou CORA. Usado quando payment_method = BOLETO.';