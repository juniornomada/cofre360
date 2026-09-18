-- Make card invoice payments and their bank transaction mirrors atomic.
-- New payments keep a direct, unique link to the corresponding transaction.
-- Legacy payments are backfilled only when the match is unambiguous.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype in ('p','u')
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.transactions'::regclass and attname = 'id')
      ]::smallint[]
  ) then
    alter table public.transactions
      add constraint transactions_id_unique unique (id);
  end if;
end
$$;

alter table public.card_payments
  add column if not exists transaction_id text;

alter table public.card_payments
  drop constraint if exists card_payments_transaction_id_fkey;

alter table public.card_payments
  add constraint card_payments_transaction_id_fkey
  foreign key (transaction_id)
  references public.transactions(id)
  on delete set null;

create unique index if not exists card_payments_transaction_id_unique
  on public.card_payments(transaction_id)
  where transaction_id is not null;

with candidate as (
  select cp.id as payment_id, min(t.id) as transaction_id
  from public.card_payments cp
  join public.cards c
    on c.id = cp.card_id
   and c.user_id = cp.user_id
  join public.transactions t
    on t.user_id = cp.user_id
   and t.category = 'Pagamento de Cartão'
   and abs(t.amount - cp.amount::double precision) < 0.005
   and t.bank_account_id is not distinct from cp.bank_account_id
   and coalesce(
         t.transaction_date,
         public.cofre_parse_legacy_date(t.date, t.created_at)
       ) = (cp.paid_at at time zone 'America/Sao_Paulo')::date
   and t.name ilike '%' || c.name || '%'
  where cp.transaction_id is null
  group by cp.id
  having count(*) = 1
)
update public.card_payments cp
set transaction_id = candidate.transaction_id
from candidate
where cp.id = candidate.payment_id
  and not exists (
    select 1
    from public.card_payments other
    where other.transaction_id = candidate.transaction_id
      and other.id <> cp.id
  );

create or replace function public.create_card_payment_atomic(
  p_card_id text,
  p_lines jsonb,
  p_paid_at timestamptz,
  p_target_period date,
  p_payment_kind text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_card_name text;
  v_line jsonb;
  v_account_id text;
  v_amount numeric;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_payment_name text;
  v_transaction_date date;
  v_transaction_id text;
  v_payment_id text;
  v_created jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_payment_kind not in ('partial', 'total') then
    raise exception 'Invalid payment kind' using errcode = '22023';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one payment line is required' using errcode = '22023';
  end if;

  select c.name
    into v_card_name
  from public.cards c
  where c.id = p_card_id
    and c.user_id = v_user_id;

  if not found then
    raise exception 'Card not found' using errcode = 'P0002';
  end if;

  v_payment_name := case p_payment_kind
    when 'total' then 'Pagamento Total cartão ' || v_card_name
    else 'Pagamento Parcial cartão ' || v_card_name
  end;

  v_transaction_date := (v_paid_at at time zone 'America/Sao_Paulo')::date;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    v_account_id := nullif(btrim(v_line ->> 'account_id'), '');

    begin
      v_amount := nullif(v_line ->> 'amount', '')::numeric;
    exception when others then
      raise exception 'Invalid payment amount' using errcode = '22023';
    end;

    if v_account_id is null then
      raise exception 'Bank account is required' using errcode = '22023';
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Payment amount must be positive' using errcode = '22023';
    end if;

    if round(v_amount, 2) <> v_amount then
      raise exception 'Payment amount must have at most 2 decimal places' using errcode = '22023';
    end if;

    perform 1
    from public.bank_accounts ba
    where ba.id = v_account_id
      and ba.user_id = v_user_id;

    if not found then
      raise exception 'Bank account not found' using errcode = 'P0002';
    end if;

    insert into public.transactions (
      user_id,
      name,
      amount,
      type,
      category,
      icon,
      date,
      transaction_date,
      bank_account_id,
      transaction_kind,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      v_payment_name,
      v_amount::double precision,
      'expense',
      'Pagamento de Cartão',
      '💳',
      to_char(v_transaction_date, 'YYYY-MM-DD'),
      v_transaction_date,
      v_account_id,
      'card_payment',
      now(),
      now()
    )
    returning id into v_transaction_id;

    insert into public.card_payments (
      user_id,
      card_id,
      bank_account_id,
      amount,
      paid_at,
      target_period,
      transaction_id,
      created_at
    )
    values (
      v_user_id,
      p_card_id,
      v_account_id,
      v_amount,
      v_paid_at,
      p_target_period,
      v_transaction_id,
      now()
    )
    returning id into v_payment_id;

    v_count := v_count + 1;
    v_created := v_created || jsonb_build_array(
      jsonb_build_object(
        'payment_id', v_payment_id,
        'transaction_id', v_transaction_id
      )
    );
  end loop;

  return jsonb_build_object(
    'count', v_count,
    'records', v_created
  );
end;
$function$;

revoke all on function public.create_card_payment_atomic(text, jsonb, timestamptz, date, text) from public;
revoke all on function public.create_card_payment_atomic(text, jsonb, timestamptz, date, text) from anon;
grant execute on function public.create_card_payment_atomic(text, jsonb, timestamptz, date, text) to authenticated;

create or replace function public.delete_card_payment_atomic(
  p_payment_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_transaction_id text;
  v_card_name text;
  v_amount numeric;
  v_bank_account_id text;
  v_paid_at timestamptz;
  v_candidate_count integer := 0;
  v_candidate_id text;
begin
  if v_user_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select
    cp.transaction_id,
    c.name,
    cp.amount,
    cp.bank_account_id,
    cp.paid_at
  into
    v_transaction_id,
    v_card_name,
    v_amount,
    v_bank_account_id,
    v_paid_at
  from public.card_payments cp
  left join public.cards c
    on c.id = cp.card_id
   and c.user_id = cp.user_id
  where cp.id = p_payment_id
    and cp.user_id = v_user_id
  for update of cp;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  if v_transaction_id is not null then
    delete from public.transactions
    where id = v_transaction_id
      and user_id = v_user_id;
  else
    select count(*), min(t.id)
      into v_candidate_count, v_candidate_id
    from public.transactions t
    where t.user_id = v_user_id
      and t.category = 'Pagamento de Cartão'
      and abs(t.amount - v_amount::double precision) < 0.005
      and t.bank_account_id is not distinct from v_bank_account_id
      and coalesce(
            t.transaction_date,
            public.cofre_parse_legacy_date(t.date, t.created_at)
          ) = (v_paid_at at time zone 'America/Sao_Paulo')::date
      and (v_card_name is null or t.name ilike '%' || v_card_name || '%');

    if v_candidate_count = 1 then
      delete from public.transactions
      where id = v_candidate_id
        and user_id = v_user_id;
    elsif v_candidate_count > 1 then
      raise exception 'Legacy payment has multiple possible mirror transactions'
        using errcode = 'P0001';
    else
      raise exception 'Legacy payment mirror transaction could not be identified safely'
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.card_payments
  where id = p_payment_id
    and user_id = v_user_id;

  return true;
end;
$function$;

revoke all on function public.delete_card_payment_atomic(text) from public;
revoke all on function public.delete_card_payment_atomic(text) from anon;
grant execute on function public.delete_card_payment_atomic(text) to authenticated;
