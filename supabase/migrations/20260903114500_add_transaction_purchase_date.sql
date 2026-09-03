alter table public.transactions
  add column if not exists purchase_date text;

comment on column public.transactions.purchase_date is
  'Original economic purchase date used for category spending. transactions.date remains the installment/cash-flow date.';
