ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS descricao_item text;