UPDATE public.payment_inconsistencies pi
SET resolved_at = now(),
    resolution_action = 'AUTO_RESOLVED_NO_OPEN_CHARGE'
FROM public.payments p
WHERE pi.payment_id = p.id
  AND pi.unit_id = '9cf070e2-6604-4a3e-8962-440b5d233013'
  AND pi.error_type = 'MISSING_ASAAS_LINK'
  AND pi.resolved_at IS NULL
  AND p.status IN ('PAID','RECEIVED','CONFIRMED','CANCELLED');