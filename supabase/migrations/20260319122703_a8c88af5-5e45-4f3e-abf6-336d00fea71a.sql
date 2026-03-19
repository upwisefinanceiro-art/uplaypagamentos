-- Estrutura mínima para gestão real de parcelas/cobranças
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS student_id uuid,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'AVULSA';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND constraint_name = 'payments_student_id_fkey'
  ) THEN
    ALTER TABLE public.payments
    ADD CONSTRAINT payments_student_id_fkey
    FOREIGN KEY (student_id)
    REFERENCES public.students(id)
    ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.payments p
SET
  student_id = COALESCE(p.student_id, c.student_id),
  description = COALESCE(NULLIF(p.description, ''), c.description, 'Parcela ' || p.installment_number::text),
  payment_type = CASE
    WHEN p.contract_id IS NULL THEN COALESCE(NULLIF(p.payment_type, ''), 'AVULSA')
    WHEN COALESCE(c.description, '') ILIKE '%apostila%' THEN 'APOSTILA'
    ELSE 'MENSALIDADE'
  END
FROM public.contracts c
WHERE p.contract_id = c.id;

UPDATE public.payments p
SET
  description = COALESCE(NULLIF(p.description, ''), 'Parcela ' || p.installment_number::text),
  payment_type = COALESCE(NULLIF(p.payment_type, ''), 'AVULSA')
WHERE p.contract_id IS NULL;

ALTER TABLE public.payments
ALTER COLUMN description SET DEFAULT '';

UPDATE public.payments
SET description = COALESCE(description, '')
WHERE description IS NULL;

ALTER TABLE public.payments
ALTER COLUMN description SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_responsible_due_date
  ON public.payments (responsible_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_contract_due_date
  ON public.payments (contract_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_student_due_date
  ON public.payments (student_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_unit_status_due_date
  ON public.payments (unit_id, status, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_payment_type
  ON public.payments (payment_type);