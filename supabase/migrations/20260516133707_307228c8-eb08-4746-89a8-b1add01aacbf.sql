UPDATE public.payments
SET status = 'PENDING'
WHERE contract_id = '0dc7b322-5b0c-4985-b0ba-fcc55164d77e'
  AND installment_number BETWEEN 3 AND 10
  AND status = 'CANCELLED';