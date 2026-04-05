
-- Add status column to units
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ATIVO';

-- Sync existing data
UPDATE public.units SET status = 'INATIVO' WHERE active = false;

-- Create trigger to keep active in sync with status
CREATE OR REPLACE FUNCTION public.sync_unit_active_from_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ATIVO' THEN
    NEW.active = true;
  ELSE
    NEW.active = false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_unit_status_active
BEFORE INSERT OR UPDATE OF status ON public.units
FOR EACH ROW
EXECUTE FUNCTION public.sync_unit_active_from_status();
