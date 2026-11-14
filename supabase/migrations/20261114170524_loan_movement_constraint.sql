-- Fix: canonical inference added loan_movement, but transactions check constraint
-- still accepted only the previous eight kinds. Preserve all existing kinds.
alter table public.transactions
  drop constraint if exists transactions_transaction_kind_check;

alter table public.transactions
  add constraint transactions_transaction_kind_check
  check (
    transaction_kind = any (array[
      'expense'::text, 'income'::text, 'transfer'::text,
      'card_payment'::text, 'refund'::text, 'adjustment'::text,
      'investment_movement'::text, 'yield'::text, 'loan_movement'::text
    ])
  );
