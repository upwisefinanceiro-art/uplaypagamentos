
-- 1) Índice único parcial em asaas_payment_id (impede duas linhas locais para a mesma cobrança Asaas)
CREATE UNIQUE INDEX IF NOT EXISTS payments_asaas_payment_id_unique
  ON public.payments (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

-- 2) Índice de apoio para reconciliação por (responsible_id, due_date, value)
CREATE INDEX IF NOT EXISTS payments_dedup_lookup
  ON public.payments (responsible_id, due_date, value);

-- 3) Registrar pagamentos órfãos (sem contract_id e sem payment_type='AVULSA') como inconsistências
INSERT INTO public.payment_inconsistencies (
  payment_id, unit_id, company_id, responsible_id, asaas_payment_id,
  responsible_name, error_type, severity, system_status, system_value, system_due_date,
  details
)
SELECT 
  p.id, p.unit_id, u.company_id, p.responsible_id, p.asaas_payment_id,
  prof.full_name, 'ORPHAN_NO_CONTRACT', 'MEDIUM', p.status, p.value, p.due_date,
  jsonb_build_object('reason','payment sem contract_id detectado em auditoria','description', p.description)
FROM public.payments p
LEFT JOIN public.units u ON u.id = p.unit_id
LEFT JOIN public.profiles prof ON prof.id = p.responsible_id
WHERE p.contract_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_inconsistencies pi
    WHERE pi.payment_id = p.id AND pi.error_type = 'ORPHAN_NO_CONTRACT' AND pi.resolved_at IS NULL
  );

-- 4) Registrar grupos de parcelas duplicadas como inconsistências (uma entry por linha duplicada)
WITH dups AS (
  SELECT id, responsible_id, due_date, value, unit_id, status, asaas_payment_id,
         row_number() OVER (PARTITION BY responsible_id, due_date, value ORDER BY 
           CASE WHEN status IN ('PAID','RECEIVED','CONFIRMED') THEN 0 ELSE 1 END,
           created_at ASC) AS rn,
         count(*) OVER (PARTITION BY responsible_id, due_date, value) AS grp_size
  FROM public.payments
)
INSERT INTO public.payment_inconsistencies (
  payment_id, unit_id, company_id, responsible_id, asaas_payment_id,
  responsible_name, error_type, severity, system_status, system_value, system_due_date,
  details
)
SELECT 
  d.id, d.unit_id, u.company_id, d.responsible_id, d.asaas_payment_id,
  prof.full_name, 'DUPLICATE_INSTALLMENT', 
  CASE WHEN d.status IN ('PAID','RECEIVED','CONFIRMED') THEN 'HIGH' ELSE 'MEDIUM' END,
  d.status, d.value, d.due_date,
  jsonb_build_object('reason','duplicidade detectada (mesmo cliente/data/valor)','grupo_tamanho', d.grp_size, 'posicao_no_grupo', d.rn)
FROM dups d
LEFT JOIN public.units u ON u.id = d.unit_id
LEFT JOIN public.profiles prof ON prof.id = d.responsible_id
WHERE d.grp_size > 1
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_inconsistencies pi
    WHERE pi.payment_id = d.id AND pi.error_type = 'DUPLICATE_INSTALLMENT' AND pi.resolved_at IS NULL
  );
