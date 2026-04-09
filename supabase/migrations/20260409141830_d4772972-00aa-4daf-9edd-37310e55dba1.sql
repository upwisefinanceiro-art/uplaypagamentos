
-- Fix 1: Remove RESPONSAVEL direct access to units table (they should use units_public view only)
DROP POLICY IF EXISTS "Responsavel can view own unit via view" ON public.units;

-- Fix 2: Remove remaining tables from Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stock_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.stock_items;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.delivery_notifications;
  END IF;
END $$;
