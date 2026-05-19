ALTER TABLE public.transactions ADD COLUMN bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_bank_account_id ON public.transactions(bank_account_id);