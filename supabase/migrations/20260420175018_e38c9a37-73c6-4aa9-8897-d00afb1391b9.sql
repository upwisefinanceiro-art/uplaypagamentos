-- Recompute final_value for all existing PAID payments based on punctuality rule
-- Rule: if paid on or before due_date → keep discounted final_value
--       if paid after due_date → final_value should equal original_value (full price, no discount)
UPDATE public.payments
SET final_value = COALESCE(original_value, value),
    updated_at = now()
WHERE status = 'PAID'
  AND paid_at IS NOT NULL
  AND due_date IS NOT NULL
  AND (paid_at::date) > due_date
  AND COALESCE(punctuality_discount, 0) > 0
  AND final_value IS DISTINCT FROM COALESCE(original_value, value);

-- For payments paid on time, ensure final_value reflects the discounted amount
-- (only if discount existed and original_value is set)
UPDATE public.payments
SET final_value = COALESCE(final_value, value - COALESCE(punctuality_discount, 0), value),
    updated_at = now()
WHERE status = 'PAID'
  AND paid_at IS NOT NULL
  AND due_date IS NOT NULL
  AND (paid_at::date) <= due_date
  AND final_value IS NULL;