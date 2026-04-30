CREATE OR REPLACE FUNCTION public.register_uplay_transaction_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unit RECORD;
  v_responsible RECORD;
  v_paid_statuses TEXT[] := ARRAY['PAID','RECEIVED','CONFIRMED'];
  v_gross numeric;
  v_fee numeric := 0;
  v_net numeric;
  v_already_exists boolean;
BEGIN
  -- Só processa quando vai para status pago
  IF NOT (NEW.status = ANY(v_paid_statuses)) THEN
    RETURN NEW;
  END IF;
  IF OLD IS NOT NULL AND OLD.status = ANY(v_paid_statuses) THEN
    RETURN NEW;
  END IF;

  -- Busca configuração da unidade
  SELECT id, company_id, partnership_plan, uplay_fee_type, uplay_fee_value
  INTO v_unit
  FROM public.units
  WHERE id = NEW.unit_id;

  IF v_unit IS NULL OR v_unit.partnership_plan <> 'PLANO_UPLAY' THEN
    RETURN NEW;
  END IF;

  -- Evita duplicidade
  SELECT EXISTS(
    SELECT 1 FROM public.uplay_partner_transactions
    WHERE payment_id = NEW.id
  ) INTO v_already_exists;
  IF v_already_exists THEN
    RETURN NEW;
  END IF;

  v_gross := COALESCE(NEW.final_value, NEW.value, 0);

  IF v_unit.uplay_fee_type = 'PERCENT' THEN
    v_fee := ROUND((v_gross * COALESCE(v_unit.uplay_fee_value, 0) / 100)::numeric, 2);
  ELSE
    v_fee := COALESCE(v_unit.uplay_fee_value, 0);
  END IF;
  IF v_fee > v_gross THEN v_fee := v_gross; END IF;
  v_net := v_gross - v_fee;

  SELECT full_name INTO v_responsible
  FROM public.profiles WHERE id = NEW.responsible_id;

  INSERT INTO public.uplay_partner_transactions (
    unit_id, company_id, payment_id, responsible_id, responsible_name,
    description, gross_value, fee_type, fee_value, fee_amount, net_value,
    status, paid_at
  ) VALUES (
    v_unit.id, v_unit.company_id, NEW.id, NEW.responsible_id, v_responsible.full_name,
    NEW.description, v_gross, v_unit.uplay_fee_type, v_unit.uplay_fee_value, v_fee, v_net,
    'PENDENTE_REPASSE', COALESCE(NEW.paid_at, now())
  );

  -- Acumula saldo a repassar na unidade
  UPDATE public.units
  SET uplay_balance = COALESCE(uplay_balance, 0) + v_net
  WHERE id = v_unit.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_register_uplay_tx ON public.payments;
CREATE TRIGGER trg_register_uplay_tx
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.register_uplay_transaction_on_payment();