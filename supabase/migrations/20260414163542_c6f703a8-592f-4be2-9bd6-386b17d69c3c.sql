
-- Fix existing imported payments: set punctuality_discount from raw_response discount
-- and recalculate final_value properly
UPDATE payments
SET 
  punctuality_discount = COALESCE(
    CASE 
      WHEN raw_response->'discount'->>'type' = 'FIXED' 
      THEN (raw_response->'discount'->>'value')::numeric
      WHEN raw_response->'discount'->>'type' = 'PERCENTAGE'
      THEN ROUND(value * (raw_response->'discount'->>'value')::numeric / 100, 2)
      ELSE 0
    END, 0
  ),
  final_value = CASE 
    WHEN status IN ('PAID', 'RECEIVED', 'CONFIRMED') 
    THEN COALESCE((raw_response->>'netValue')::numeric, value)
    ELSE value
  END
WHERE asaas_payment_id IS NOT NULL
AND raw_response IS NOT NULL;
