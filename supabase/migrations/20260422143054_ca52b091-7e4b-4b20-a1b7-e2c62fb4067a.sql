-- Habilitar Realtime para a tabela payments
ALTER TABLE public.payments REPLICA IDENTITY FULL;

-- Adicionar à publicação realtime (com guarda para não falhar se já estiver)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;