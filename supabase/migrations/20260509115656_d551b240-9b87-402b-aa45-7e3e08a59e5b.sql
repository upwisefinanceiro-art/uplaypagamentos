
-- 1) Adiciona campo payment_provider
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_provider TEXT;

-- 2) Backfill: deduzir provider a partir dos dados existentes
UPDATE public.payments
SET payment_provider = CASE
  WHEN cora_invoice_id IS NOT NULL THEN 'CORA'
  WHEN asaas_payment_id IS NOT NULL THEN 'ASAAS'
  WHEN UPPER(COALESCE(gateway, '')) = 'CORA' THEN 'CORA'
  ELSE 'ASAAS'
END
WHERE payment_provider IS NULL;

-- 3) NOT NULL + default + check
ALTER TABLE public.payments
  ALTER COLUMN payment_provider SET DEFAULT 'ASAAS',
  ALTER COLUMN payment_provider SET NOT NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_provider_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_provider_check
  CHECK (payment_provider IN ('ASAAS','CORA'));

-- 4) Trigger anti-mistura + sincroniza gateway legado
CREATE OR REPLACE FUNCTION public.payments_enforce_provider_isolation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  old_had_both boolean := false;
BEGIN
  -- Normaliza
  IF NEW.payment_provider IS NULL OR NEW.payment_provider = '' THEN
    NEW.payment_provider := COALESCE(UPPER(NEW.gateway), 'ASAAS');
  END IF;
  NEW.payment_provider := UPPER(NEW.payment_provider);

  IF NEW.payment_provider NOT IN ('ASAAS','CORA') THEN
    RAISE EXCEPTION 'payment_provider inválido: %', NEW.payment_provider;
  END IF;

  -- Permite histórico antigo (já tinha ambos)
  IF TG_OP = 'UPDATE' AND OLD.asaas_payment_id IS NOT NULL AND OLD.cora_invoice_id IS NOT NULL THEN
    old_had_both := true;
  END IF;

  IF NOT old_had_both THEN
    IF NEW.payment_provider = 'ASAAS' AND NEW.cora_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Parcela marcada como ASAAS não pode ter cora_invoice_id (payment_id=%)', NEW.id;
    END IF;
    IF NEW.payment_provider = 'CORA' AND NEW.asaas_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'Parcela marcada como CORA não pode ter asaas_payment_id (payment_id=%)', NEW.id;
    END IF;
  END IF;

  -- Espelha no campo legado gateway (compat)
  NEW.gateway := NEW.payment_provider;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_enforce_provider_isolation ON public.payments;
CREATE TRIGGER trg_payments_enforce_provider_isolation
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_enforce_provider_isolation();

CREATE INDEX IF NOT EXISTS idx_payments_payment_provider
  ON public.payments(payment_provider);
