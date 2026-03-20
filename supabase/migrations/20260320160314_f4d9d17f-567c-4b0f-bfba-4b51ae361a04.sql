
ALTER TABLE public.contracts ADD COLUMN contract_number text;
CREATE INDEX idx_contracts_contract_number ON public.contracts(contract_number);
