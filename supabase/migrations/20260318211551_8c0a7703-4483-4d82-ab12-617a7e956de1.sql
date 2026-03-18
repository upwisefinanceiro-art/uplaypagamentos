CREATE OR REPLACE FUNCTION public.validate_active_responsible_for_financial_records()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  responsible_is_active boolean;
BEGIN
  IF NEW.responsible_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.active
  INTO responsible_is_active
  FROM public.profiles p
  WHERE p.id = NEW.responsible_id;

  IF responsible_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Este registro está inativo e não pode ser usado em novas cobranças ou contratos.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_contracts_responsible_active ON public.contracts;
CREATE TRIGGER validate_contracts_responsible_active
BEFORE INSERT OR UPDATE OF responsible_id
ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_responsible_for_financial_records();

DROP TRIGGER IF EXISTS validate_payments_responsible_active ON public.payments;
CREATE TRIGGER validate_payments_responsible_active
BEFORE INSERT OR UPDATE OF responsible_id
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_responsible_for_financial_records();