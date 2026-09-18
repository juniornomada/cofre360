-- Safely delete legacy card payments that predate mirror transactions.
-- If any plausible mirror exists but cannot be identified uniquely, abort.

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
  v_broad_candidate_count integer := 0;
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
      select count(*)
        into v_broad_candidate_count
      from public.transactions t
      where t.user_id = v_user_id
        and abs(t.amount - v_amount::double precision) < 0.005
        and t.bank_account_id is not distinct from v_bank_account_id
        and (v_card_name is null or t.name ilike '%' || v_card_name || '%')
        and (
          t.transaction_kind = 'card_payment'
          or lower(coalesce(t.category, '')) like '%pagamento%cart%'
          or lower(t.name) like '%pagamento%cart%'
          or lower(t.name) like '%pagamento%fatura%'
        );

      if v_broad_candidate_count > 0 then
        raise exception 'Legacy payment has a possible mirror transaction that cannot be identified safely'
          using errcode = 'P0001';
      end if;
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
