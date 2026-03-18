-- Prevent inactive responsibles from being used in new contracts and charges
DROP TRIGGER IF EXISTS validate_active_responsible_on_contracts ON public.contracts;
CREATE TRIGGER validate_active_responsible_on_contracts
BEFORE INSERT OR UPDATE OF responsible_id
ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_responsible_for_financial_records();

DROP TRIGGER IF EXISTS validate_active_responsible_on_payments ON public.payments;
CREATE TRIGGER validate_active_responsible_on_payments
BEFORE INSERT OR UPDATE OF responsible_id
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_responsible_for_financial_records();