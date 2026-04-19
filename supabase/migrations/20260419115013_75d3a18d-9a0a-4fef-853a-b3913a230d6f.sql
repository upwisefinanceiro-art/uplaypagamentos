
CREATE UNIQUE INDEX IF NOT EXISTS contracts_unique_active_per_responsible_unit
ON public.contracts (responsible_id, unit_id)
WHERE status = 'ACTIVE';
