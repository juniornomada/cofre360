ALTER TABLE public.transactions
  ADD COLUMN total_installments integer NOT NULL DEFAULT 1,
  ADD COLUMN installment_number integer NOT NULL DEFAULT 1,
  ADD COLUMN installment_group_id uuid DEFAULT NULL;