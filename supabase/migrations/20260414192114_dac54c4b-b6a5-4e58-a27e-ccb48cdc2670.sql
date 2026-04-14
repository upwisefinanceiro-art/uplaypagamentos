
-- Fix payment values: use Asaas 'value' (client-paid amount) instead of 'netValue' (after Asaas fees)
UPDATE payments
SET 
  value = COALESCE((raw_response->>'originalValue')::numeric, (raw_response->>'value')::numeric),
  original_value = COALESCE((raw_response->>'originalValue')::numeric, (raw_response->>'value')::numeric),
  final_value = (raw_response->>'value')::numeric,
  punctuality_discount = COALESCE((raw_response->>'originalValue')::numeric, (raw_response->>'value')::numeric) - (raw_response->>'value')::numeric
WHERE status = 'PAID'
  AND raw_response IS NOT NULL
  AND raw_response->>'value' IS NOT NULL;
