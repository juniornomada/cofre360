ALTER TABLE public.card_payments
  ALTER COLUMN amount TYPE numeric(14,2) USING amount::numeric;