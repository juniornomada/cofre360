-- Scheduled account/Pix transactions can exist before settlement without
-- affecting balances or realized monthly financial facts.

alter table public.transactions
  add column if not exists transaction_status text not null default 'posted',
  add column if not exists posted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_transaction_status_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_transaction_status_check
      check (transaction_status in ('posted', 'pending'));
  end if;
end
$$;

create index if not exists transactions_user_status_date_idx
  on public.transactions (user_id, transaction_status, transaction_date);


-- Existing Droga Raia 4x Pix schedule: one economic purchase on 2026-10-03
-- (R$ 712,60), with the remaining Pix installments acting only as cash
-- settlements. The first installment was already paid; the future ones must
-- wait for explicit posting and account selection.
update public.transactions
set
  installment_group_id = '85a36adc-fa2d-470d-8841-df66bc1d3694'::uuid,
  installment_number = case
    when name = 'Droga Raia 1/4' then 1
    when name = 'Droga Raia 2/4' then 2
    when name = 'Droga Raia 3/4' then 3
    when name = 'Droga Raia 4/4' then 4
  end,
  total_installments = 4,
  installment_source_amount = 712.60,
  installment_mode = 'divide',
  purchase_date = date '2026-10-03',
  transaction_status = case when name = 'Droga Raia 1/4' then 'posted' else 'pending' end,
  posted_at = case when name = 'Droga Raia 1/4' then posted_at else null end
where name in ('Droga Raia 1/4','Droga Raia 2/4','Droga Raia 3/4','Droga Raia 4/4')
  and amount = 178.15
  and coalesce(card,'') = '';


create or replace function public.get_bank_account_balances(user_id_param uuid)
returns table(account_id uuid, current_balance numeric)
language plpgsql
set search_path to ''
as $function$
begin
  if auth.uid() is null or auth.uid() <> user_id_param then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with tx_sums as (
    select
      bank_account_id,
      sum(case when type = 'income' then amount else -amount end) as tx_total
    from public.transactions
    where user_id = user_id_param
      and bank_account_id is not null
      and (is_visible is null or is_visible = true)
      and transaction_status = 'posted'
      and (
        case
          when posted_at is not null then posted_at::date <= current_date
          else coalesce(
            transaction_date,
            public.cofre_parse_legacy_date(date, created_at)
          ) <= current_date
        end
      )
    group by bank_account_id
  )
  select
    ba.id::uuid as account_id,
    (coalesce(ba.balance, 0) + coalesce(ts.tx_total, 0))::numeric as current_balance
  from public.bank_accounts ba
  left join tx_sums ts on ts.bank_account_id = ba.id
  where ba.user_id = user_id_param;
end;
$function$;

create or replace function public.financial_month_facts(p_month date)
returns jsonb
language sql
stable
set search_path to ''
as $function$
with params as (
  select date_trunc('month', p_month)::date as month_start,
         (date_trunc('month', p_month) + interval '1 month')::date as month_end,
         auth.uid() as uid
),
base as (
  select t.*,
         coalesce(t.transaction_date, public.cofre_parse_legacy_date(t.date, t.created_at)) as canon_date,
         coalesce(t.transaction_kind, public.cofre_infer_transaction_kind(t.type, t.category)) as kind,
         c.closing_day,
         case
           when t.card_id is not null or t.card is not null then public.cofre_card_cycle_month(
             coalesce(t.transaction_date, public.cofre_parse_legacy_date(t.date, t.created_at)),
             c.closing_day
           )
           else date_trunc('month', coalesce(t.transaction_date, public.cofre_parse_legacy_date(t.date, t.created_at)))::date
         end as expense_month
  from public.transactions t
  left join lateral (
    select c.id, c.name, c.closing_day
    from public.cards c
    where c.user_id = t.user_id
      and (c.id = t.card_id or (t.card_id is null and t.card is not null and lower(trim(c.name)) = lower(trim(t.card))))
    order by case when c.id = t.card_id then 0 else 1 end, c.created_at asc
    limit 1
  ) c on true
  cross join params p
  where t.user_id = p.uid
    and coalesce(t.is_visible, true)
    and t.transaction_status = 'posted'
),
month_rows as (
  select b.* from base b cross join params p where b.expense_month = p.month_start
),
installment_groups as (
  select installment_group_id,
    max(total_installments) as total_no,
    max(installment_source_amount) filter (where installment_source_amount > 0) as source_amount,
    sum(amount) as loaded_sum,
    count(distinct installment_number) as loaded_parts
  from base
  where installment_group_id is not null and coalesce(total_installments,1) > 1 and kind = 'expense'
  group by installment_group_id
),
economic_rows as (
  select b.id, b.user_id, b.name, b.category, b.card, b.card_id, b.created_at,
    case
      when b.installment_group_id is not null and coalesce(b.total_installments,1) > 1 then
        coalesce(g.source_amount,
          case when g.loaded_parts >= greatest(coalesce(g.total_no,1),1) then g.loaded_sum
               else b.amount * greatest(coalesce(g.total_no,1),1) end)
      else b.amount
    end::numeric as economic_amount,
    coalesce(
      b.purchase_date,
      case when b.installment_group_id is not null and coalesce(b.installment_number,1) > 1
        then (b.canon_date - make_interval(months => (coalesce(b.installment_number,1)-1)::int))::date
        else b.canon_date end
    )::date as economic_date,
    row_number() over (
      partition by coalesce(b.installment_group_id, b.id)
      order by coalesce(b.installment_number,1), b.created_at, b.id
    ) as economic_rank
  from base b
  left join installment_groups g on g.installment_group_id = b.installment_group_id
  where b.kind = 'expense'
),
economic_month_rows as (
  select e.*
  from economic_rows e cross join params p
  where e.economic_rank = 1
    and e.economic_date >= p.month_start
    and e.economic_date < p.month_end
),
refund_rows as (
  select b.*
  from base b cross join params p
  where b.kind = 'refund'
    and b.canon_date >= p.month_start
    and b.canon_date < p.month_end
),
income_rows as (
  select b.*
  from base b cross join params p
  where b.kind in ('income','yield')
    and b.canon_date >= p.month_start
    and b.canon_date < p.month_end
),
summary as (
  select
    coalesce((select sum(amount) from income_rows),0)::numeric as income,
    (
      coalesce((select sum(economic_amount) from economic_month_rows),0)
      - coalesce((select sum(amount) from refund_rows),0)
    )::numeric as expense,
    (
      coalesce((select sum(economic_amount) from economic_month_rows where card_id is not null or card is not null),0)
      - coalesce((select sum(amount) from refund_rows where card_id is not null or card is not null),0)
    )::numeric as card_expense_component
),
expense_breakdown as (
  select label, round(sum(signed_amount)::numeric,2) as amount
  from (
    select
      trim(split_part(coalesce(nullif(trim(e.category),''),'Sem categoria'), '>', 1)) as label,
      e.economic_amount as signed_amount
    from economic_month_rows e
    union all
    select 'Reembolsos (abatimento)' as label, -r.amount as signed_amount
    from refund_rows r
  ) q
  group by label
  having abs(sum(signed_amount)) >= 0.005
),
category_rows as (
  select trim(split_part(coalesce(nullif(trim(category),''),'Sem categoria'), '>', 1)) as category,
         round(sum(economic_amount)::numeric,2) as amount
  from economic_month_rows
  group by 1
),
card_rows as (
  select card_name, round(sum(signed_amount)::numeric,2) as amount
  from (
    select coalesce(c.name, e.card, 'Cartão') as card_name,
           e.economic_amount as signed_amount
    from economic_month_rows e
    left join public.cards c on c.id = e.card_id and c.user_id = e.user_id
    where e.card_id is not null or e.card is not null
    union all
    select coalesce(c.name, r.card, 'Cartão') as card_name,
           -r.amount as signed_amount
    from refund_rows r
    left join public.cards c on c.id = r.card_id and c.user_id = r.user_id
    where r.card_id is not null or r.card is not null
  ) q
  group by card_name
  having abs(sum(signed_amount)) >= 0.005
),
old_installment_rows as (
  select m.*,
    coalesce(m.purchase_date,
      case when coalesce(m.installment_number,1)>1
        then (m.canon_date - make_interval(months => (coalesce(m.installment_number,1)-1)::int))::date
        else m.canon_date end) as inferred_purchase_date
  from month_rows m cross join params p
  where m.kind='expense' and (m.card_id is not null or m.card is not null) and coalesce(m.total_installments,1) > 1
),
old_installments as (
  select count(*)::int as count, round(coalesce(sum(o.amount),0)::numeric,2) as amount
  from old_installment_rows o cross join params p
  where o.inferred_purchase_date < p.month_start
),
old_installment_categories as (
  select trim(split_part(coalesce(nullif(trim(o.category),''),'Sem categoria'), '>', 1)) as category,
         round(sum(o.amount)::numeric,2) as amount
  from old_installment_rows o cross join params p
  where o.inferred_purchase_date < p.month_start
  group by 1
)
select jsonb_build_object(
  'month', to_char((select month_start from params), 'YYYY-MM'),
  'income', round((select income from summary),2),
  'expense', round((select expense from summary),2),
  'result', round((select income-expense from summary),2),
  'cardExpenseComponent', round((select card_expense_component from summary),2),
  'expenseBreakdown', coalesce((select jsonb_agg(jsonb_build_object('category',label,'amount',amount) order by abs(amount) desc) from expense_breakdown), '[]'::jsonb),
  'categories', coalesce((select jsonb_agg(jsonb_build_object('category',category,'amount',amount) order by amount desc) from category_rows), '[]'::jsonb),
  'cards', coalesce((select jsonb_agg(jsonb_build_object('card',card_name,'amount',amount) order by amount desc) from card_rows), '[]'::jsonb),
  'oldInstallments', jsonb_build_object('count',(select count from old_installments),'amount',(select amount from old_installments)),
  'oldInstallmentCategories', coalesce((select jsonb_agg(jsonb_build_object('category',category,'amount',amount) order by amount desc) from old_installment_categories), '[]'::jsonb)
);
$function$;
