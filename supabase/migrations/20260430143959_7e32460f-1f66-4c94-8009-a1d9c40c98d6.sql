-- 1) Remover trigger antigo que debitava estoque no pagamento
DROP TRIGGER IF EXISTS process_stock_on_payment_trigger ON public.payments;
DROP TRIGGER IF EXISTS trg_process_stock_on_payment ON public.payments;
DROP TRIGGER IF EXISTS process_stock_on_payment ON public.payments;

-- 2) Nova função: debita estoque quando entrega é confirmada
CREATE OR REPLACE FUNCTION public.process_stock_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already_processed boolean;
BEGIN
  -- Só processa quando o status muda para DELIVERED
  IF NEW.status <> 'DELIVERED' THEN
    RETURN NEW;
  END IF;

  IF OLD IS NOT NULL AND OLD.status = 'DELIVERED' THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guarda contra duplicidade: se já existe movimento EXIT vinculado a esta entrega, ignora
  SELECT EXISTS(
    SELECT 1 FROM public.stock_movements
    WHERE item_id = NEW.stock_item_id
      AND payment_id = NEW.payment_id
      AND movement_type = 'EXIT'
      AND reason ILIKE 'Baixa por entrega%'
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN NEW;
  END IF;

  -- Debita do estoque (não permite negativo)
  UPDATE public.stock_items
  SET quantity = GREATEST(quantity - COALESCE(NEW.quantity, 1), 0)
  WHERE id = NEW.stock_item_id;

  -- Registra movimento
  INSERT INTO public.stock_movements (
    item_id, unit_id, movement_type, quantity, reason, responsible_id, payment_id
  ) VALUES (
    NEW.stock_item_id,
    NEW.unit_id,
    'EXIT',
    COALESCE(NEW.quantity, 1),
    'Baixa por entrega confirmada',
    NEW.responsible_id,
    NEW.payment_id
  );

  RETURN NEW;
END;
$$;

-- 3) Trigger na tabela delivery_notifications
DROP TRIGGER IF EXISTS process_stock_on_delivery_trigger ON public.delivery_notifications;

CREATE TRIGGER process_stock_on_delivery_trigger
AFTER UPDATE OF status ON public.delivery_notifications
FOR EACH ROW
EXECUTE FUNCTION public.process_stock_on_delivery();