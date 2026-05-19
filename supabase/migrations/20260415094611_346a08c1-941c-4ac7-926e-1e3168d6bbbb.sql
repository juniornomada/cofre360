create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_transaction_dedup_text(input text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select lower(trim(regexp_replace(extensions.unaccent(coalesce(input, '')), '\s+', ' ', 'g')))
$$;

create unique index if not exists transactions_import_dedup_idx
on public.transactions (
  coalesce(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  date,
  public.normalize_transaction_dedup_text(name),
  round(amount::numeric, 2),
  type
);