UPDATE public.payment_inconsistencies pi
SET resolved_at = now(),
    resolution_action = 'AUTO_RESOLVED_CORA_PROVIDER'
FROM public.payments p
WHERE pi.payment_id = p.id
  AND pi.resolved_at IS NULL
  AND pi.error_type = 'MISSING_ASAAS_LINK'
  AND p.payment_provider = 'CORA';