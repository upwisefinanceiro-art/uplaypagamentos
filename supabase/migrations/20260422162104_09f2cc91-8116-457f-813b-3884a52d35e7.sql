
-- 1) Reescreve a trigger de estoque/entregas:
--    - Só processa APOSTILA / MATRICULA (jamais MENSALIDADE / AVULSA)
--    - Usa stock_item_id explícito; senão tenta match EXATO/forte do nome
--      do item dentro da descrição (sem fallback amplo por categoria)
--    - Se nada bater, não cria entrega nem movimenta estoque
CREATE OR REPLACE FUNCTION public.process_stock_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_item_id uuid;
  v_stock_qty integer;
  v_stock_item RECORD;
  v_student RECORD;
  v_responsible RECORD;
  v_paid_statuses TEXT[] := ARRAY['PAID', 'RECEIVED', 'CONFIRMED'];
  v_already_processed boolean;
  v_norm_desc text;
BEGIN
  IF NOT (NEW.status = ANY(v_paid_statuses)) THEN
    RETURN NEW;
  END IF;

  IF OLD IS NOT NULL AND OLD.status = ANY(v_paid_statuses) THEN
    RETURN NEW;
  END IF;

  -- Restrição rígida: só processa apostilas/matrículas
  IF NEW.payment_type NOT IN ('APOSTILA','MATRICULA') THEN
    RETURN NEW;
  END IF;

  v_stock_item_id := NEW.stock_item_id;
  v_stock_qty := COALESCE(NULLIF(NEW.stock_quantity, 0), 1);

  IF v_stock_item_id IS NULL THEN
    -- Match estrito pelo nome do item dentro da descrição.
    -- Exige nome com pelo menos 4 caracteres para evitar falsos-positivos.
    v_norm_desc := LOWER(COALESCE(NEW.description, ''));
    SELECT id INTO v_stock_item_id
    FROM public.stock_items
    WHERE unit_id = NEW.unit_id
      AND active = true
      AND char_length(name) >= 4
      AND v_norm_desc LIKE '%' || LOWER(name) || '%'
    ORDER BY char_length(name) DESC
    LIMIT 1;
  END IF;

  -- Sem item identificado => não cria entrega nem mexe no estoque.
  IF v_stock_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stock_movements 
    WHERE payment_id = NEW.id AND movement_type = 'EXIT'
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_stock_item FROM public.stock_items WHERE id = v_stock_item_id;
  IF v_stock_item IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.stock_items
  SET quantity = GREATEST(quantity - v_stock_qty, 0)
  WHERE id = v_stock_item_id;

  INSERT INTO public.stock_movements (item_id, unit_id, movement_type, quantity, reason, responsible_id, payment_id)
  VALUES (v_stock_item_id, NEW.unit_id, 'EXIT', v_stock_qty, 'Baixa automática - pagamento confirmado', NEW.responsible_id, NEW.id);

  SELECT full_name, enrollment_id INTO v_student
  FROM public.students WHERE id = NEW.student_id;

  SELECT full_name INTO v_responsible
  FROM public.profiles WHERE id = NEW.responsible_id;

  INSERT INTO public.delivery_notifications (
    unit_id, payment_id, stock_item_id, student_id, responsible_id,
    student_name, responsible_name, enrollment_id, item_name, quantity
  ) VALUES (
    NEW.unit_id, NEW.id, v_stock_item_id, NEW.student_id, NEW.responsible_id,
    v_student.full_name, v_responsible.full_name, v_student.enrollment_id, v_stock_item.name, v_stock_qty
  );

  RETURN NEW;
END;
$function$;

-- 2) Garante a trigger conectada (caso tenha sido removida)
DROP TRIGGER IF EXISTS process_stock_on_payment_trigger ON public.payments;
CREATE TRIGGER process_stock_on_payment_trigger
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.process_stock_on_payment();

-- 3) Limpa entregas PENDING geradas erroneamente para MENSALIDADE / AVULSA
DELETE FROM public.delivery_notifications dn
USING public.payments p
WHERE dn.payment_id = p.id
  AND dn.status = 'PENDING'
  AND p.payment_type NOT IN ('APOSTILA','MATRICULA');

-- 4) Reverte movimentações de estoque associadas a esses pagamentos errados
--    (devolve a quantidade ao saldo) e remove os registros.
WITH bad AS (
  SELECT sm.id, sm.item_id, sm.quantity
  FROM public.stock_movements sm
  JOIN public.payments p ON p.id = sm.payment_id
  WHERE sm.movement_type = 'EXIT'
    AND p.payment_type NOT IN ('APOSTILA','MATRICULA')
)
UPDATE public.stock_items si
SET quantity = si.quantity + bad_sum.qty
FROM (
  SELECT item_id, SUM(quantity) AS qty FROM bad GROUP BY item_id
) bad_sum
WHERE si.id = bad_sum.item_id;

DELETE FROM public.stock_movements sm
USING public.payments p
WHERE sm.payment_id = p.id
  AND sm.movement_type = 'EXIT'
  AND p.payment_type NOT IN ('APOSTILA','MATRICULA');

-- 5) Re-vincula entregas APOSTILA pendentes ao item correto pelo nome
--    presente na descrição do pagamento (match estrito por nome ≥4).
WITH matches AS (
  SELECT
    dn.id AS dn_id,
    si.id AS item_id,
    si.name AS item_name,
    ROW_NUMBER() OVER (
      PARTITION BY dn.id
      ORDER BY char_length(si.name) DESC
    ) AS rn
  FROM public.delivery_notifications dn
  JOIN public.payments p ON p.id = dn.payment_id
  JOIN public.stock_items si
    ON si.unit_id = dn.unit_id
   AND si.active = true
   AND char_length(si.name) >= 4
   AND LOWER(COALESCE(p.description,'')) LIKE '%' || LOWER(si.name) || '%'
  WHERE dn.status = 'PENDING'
    AND p.payment_type IN ('APOSTILA','MATRICULA')
)
UPDATE public.delivery_notifications dn
SET stock_item_id = m.item_id,
    item_name     = m.item_name,
    updated_at    = now()
FROM matches m
WHERE m.dn_id = dn.id AND m.rn = 1;
