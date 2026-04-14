
-- First delete referencing rows in dependent tables for duplicate payments
DELETE FROM stock_movements
WHERE payment_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY asaas_payment_id, unit_id ORDER BY created_at ASC, id ASC) as rn
    FROM payments
    WHERE asaas_payment_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

DELETE FROM delivery_notifications
WHERE payment_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY asaas_payment_id, unit_id ORDER BY created_at ASC, id ASC) as rn
    FROM payments
    WHERE asaas_payment_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

DELETE FROM whatsapp_message_logs
WHERE payment_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY asaas_payment_id, unit_id ORDER BY created_at ASC, id ASC) as rn
    FROM payments
    WHERE asaas_payment_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

DELETE FROM webhook_logs
WHERE local_payment_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY asaas_payment_id, unit_id ORDER BY created_at ASC, id ASC) as rn
    FROM payments
    WHERE asaas_payment_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Now remove duplicate payments keeping the oldest record
DELETE FROM payments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY asaas_payment_id, unit_id ORDER BY created_at ASC, id ASC) as rn
    FROM payments
    WHERE asaas_payment_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_asaas_payment_id_unit_id 
ON payments (asaas_payment_id, unit_id) 
WHERE asaas_payment_id IS NOT NULL;
