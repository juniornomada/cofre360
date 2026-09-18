-- Prevent cross-user/fabricated references in financial rows while preserving
-- legacy orphan references unless those reference columns are changed.

create or replace function public.enforce_owned_financial_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_column text := tg_argv[0];
  reference_kind text := tg_argv[1];
  new_ref text;
  old_ref text;
  owner_id uuid;
  old_owner_id uuid;
  reference_ok boolean := false;
begin
  owner_id := new.user_id;
  new_ref := to_jsonb(new) ->> source_column;

  if tg_op = 'UPDATE' then
    old_owner_id := old.user_id;
    old_ref := to_jsonb(old) ->> source_column;

    if new_ref is not distinct from old_ref
       and owner_id is not distinct from old_owner_id then
      return new;
    end if;
  end if;

  if new_ref is null or btrim(new_ref) = '' then
    return new;
  end if;

  case reference_kind
    when 'bank_account' then
      select exists (
        select 1 from public.bank_accounts a
        where a.id = new_ref and a.user_id = owner_id
      ) into reference_ok;
    when 'card' then
      select exists (
        select 1 from public.cards c
        where c.id = new_ref and c.user_id = owner_id
      ) into reference_ok;
    when 'transaction' then
      select exists (
        select 1 from public.transactions t
        where t.id = new_ref and t.user_id = owner_id
      ) into reference_ok;
    else
      raise exception 'Unsupported financial reference kind'
        using errcode = '22023';
  end case;

  if not reference_ok then
    raise exception 'Invalid or unauthorized financial reference'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_owned_financial_reference() from public, anon, authenticated;

alter table public.cards
  add constraint cards_pkey primary key (id);

create trigger bank_accounts_enforce_parent_owner
before insert or update of parent_account_id, user_id on public.bank_accounts
for each row execute function public.enforce_owned_financial_reference('parent_account_id', 'bank_account');

create trigger transactions_enforce_bank_owner
before insert or update of bank_account_id, user_id on public.transactions
for each row execute function public.enforce_owned_financial_reference('bank_account_id', 'bank_account');

create trigger transactions_enforce_card_owner
before insert or update of card_id, user_id on public.transactions
for each row execute function public.enforce_owned_financial_reference('card_id', 'card');

create trigger reminders_enforce_bank_owner
before insert or update of bank_account_id, user_id on public.reminders
for each row execute function public.enforce_owned_financial_reference('bank_account_id', 'bank_account');

create trigger reminders_enforce_card_owner
before insert or update of card_id, user_id on public.reminders
for each row execute function public.enforce_owned_financial_reference('card_id', 'card');

create trigger templates_enforce_bank_owner
before insert or update of bank_account_id, user_id on public.transaction_templates
for each row execute function public.enforce_owned_financial_reference('bank_account_id', 'bank_account');

create trigger templates_enforce_card_owner
before insert or update of card_id, user_id on public.transaction_templates
for each row execute function public.enforce_owned_financial_reference('card_id', 'card');

create trigger card_payments_enforce_bank_owner
before insert or update of bank_account_id, user_id on public.card_payments
for each row execute function public.enforce_owned_financial_reference('bank_account_id', 'bank_account');

create trigger card_payments_enforce_card_owner
before insert or update of card_id, user_id on public.card_payments
for each row execute function public.enforce_owned_financial_reference('card_id', 'card');

create trigger card_payments_enforce_transaction_owner
before insert or update of transaction_id, user_id on public.card_payments
for each row execute function public.enforce_owned_financial_reference('transaction_id', 'transaction');

create trigger card_refunds_enforce_original_transaction_owner
before insert or update of transaction_id, user_id on public.card_refunds
for each row execute function public.enforce_owned_financial_reference('transaction_id', 'transaction');

create trigger card_refunds_enforce_refund_transaction_owner
before insert or update of refund_transaction_id, user_id on public.card_refunds
for each row execute function public.enforce_owned_financial_reference('refund_transaction_id', 'transaction');
