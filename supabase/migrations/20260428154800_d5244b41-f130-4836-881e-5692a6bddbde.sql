ALTER TABLE public.payments ALTER COLUMN stock_quantity DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN stock_quantity SET DEFAULT 0;