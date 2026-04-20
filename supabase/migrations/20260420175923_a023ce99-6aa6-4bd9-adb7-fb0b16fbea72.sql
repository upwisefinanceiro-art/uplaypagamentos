UPDATE public.payments
SET final_value = CASE
    WHEN status = 'PAID'
      AND paid_at IS NOT NULL
      AND due_date IS NOT NULL
      AND paid_at::date <= due_date
      THEN COALESCE(
        CASE
          WHEN jsonb_typeof(raw_response::jsonb -> 'netValue') = 'number'
            THEN (raw_response::jsonb ->> 'netValue')::numeric
          ELSE NULL
        END,
        CASE
          WHEN jsonb_typeof(raw_response::jsonb -> 'value') = 'number'
            THEN (raw_response::jsonb ->> 'value')::numeric
          ELSE NULL
        END,
        final_value,
        value
      )
    WHEN status = 'PAID'
      AND paid_at IS NOT NULL
      AND due_date IS NOT NULL
      AND paid_at::date > due_date
      THEN COALESCE(
        CASE
          WHEN jsonb_typeof(raw_response::jsonb -> 'value') = 'number'
            THEN (raw_response::jsonb ->> 'value')::numeric
          ELSE NULL
        END,
        original_value,
        value
      )
    ELSE final_value
  END,
  updated_at = now()
WHERE status = 'PAID'
  AND paid_at IS NOT NULL
  AND due_date IS NOT NULL
  AND raw_response IS NOT NULL;