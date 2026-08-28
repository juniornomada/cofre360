alter table public.bank_accounts
  add column if not exists parent_account_id text null;

-- parent_account_id is intentionally text because older Cofre360 environments
-- use text IDs while newer preview schemas may expose bank_accounts.id as uuid.
-- Referential ownership is enforced by the trigger below using id::text,
-- which keeps the migration compatible with both schemas.
alter table public.bank_accounts
  drop constraint if exists bank_accounts_parent_account_id_fkey;

alter table public.bank_accounts
  drop constraint if exists bank_accounts_parent_not_self;

alter table public.bank_accounts
  add constraint bank_accounts_parent_not_self
  check (parent_account_id is null or parent_account_id <> id::text);

create index if not exists bank_accounts_parent_account_id_idx
  on public.bank_accounts(parent_account_id);

create or replace function public.validate_bank_account_parent()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent_user_id uuid;
  parent_parent_id text;
begin
  if new.parent_account_id is null then
    return new;
  end if;

  select user_id, parent_account_id
    into parent_user_id, parent_parent_id
  from public.bank_accounts
  where id::text = new.parent_account_id;

  if parent_user_id is null then
    raise exception 'Conta principal não encontrada';
  end if;

  if parent_user_id <> new.user_id then
    raise exception 'A subconta deve pertencer ao mesmo usuário da conta principal';
  end if;

  if parent_parent_id is not null then
    raise exception 'Não é permitido criar subconta dentro de outra subconta';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_bank_account_parent() from public, anon, authenticated;

drop trigger if exists validate_bank_account_parent_trigger on public.bank_accounts;
create trigger validate_bank_account_parent_trigger
before insert or update of parent_account_id, user_id
on public.bank_accounts
for each row
execute function public.validate_bank_account_parent();