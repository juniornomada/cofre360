-- Resgates atomicos de investimentos de renda fixa.
-- Nenhum investimento/transacao anterior e modificado por esta migracao.
alter table public.investments
  add column if not exists position_status text not null default 'active',
  add column if not exists redeemed_at date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.investments'::regclass
      and conname = 'investments_position_status_check'
  ) then
    alter table public.investments add constraint investments_position_status_check
      check (position_status in ('active', 'redeemed'));
  end if;
end
$$;

create table if not exists public.investment_redemptions (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  investment_id uuid not null references public.investments(id) on delete restrict,
  bank_account_id text not null references public.bank_accounts(id) on delete restrict,
  asset_name text not null,
  redemption_date date not null,
  principal numeric(14,2) not null check (principal > 0),
  net_yield numeric(14,2) not null default 0 check (net_yield >= 0),
  withheld_tax numeric(14,2) not null default 0 check (withheld_tax >= 0),
  received_total numeric(14,2) not null check (received_total > 0),
  principal_before numeric(14,2) not null check (principal_before > 0),
  principal_after numeric(14,2) not null check (principal_after >= 0),
  is_full boolean not null,
  principal_transaction_id text not null unique references public.transactions(id) on delete restrict,
  yield_transaction_id text unique references public.transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint investment_redemptions_balance_check
    check (round(principal_before - principal,2) = principal_after),
  constraint investment_redemptions_received_check
    check (round(principal + net_yield,2) = received_total),
  constraint investment_redemptions_full_check
    check (is_full = (principal_after = 0))
);

create index if not exists investment_redemptions_owner_asset_idx
  on public.investment_redemptions(user_id,investment_id,redemption_date desc);

alter table public.investment_redemptions enable row level security;
create policy "Owner may view investment redemptions" on public.investment_redemptions
  for select to authenticated using ((select auth.uid()) = user_id and private.mfa_access_allowed());
create policy "Owner may create investment redemptions" on public.investment_redemptions
  for insert to authenticated with check (
    (select auth.uid()) = user_id and private.mfa_access_allowed()
    and exists (
      select 1 from public.investments i where i.id = investment_id and i.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.bank_accounts a where a.id = bank_account_id and a.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.transactions t where t.id = principal_transaction_id and t.user_id = (select auth.uid())
    )
    and (
      yield_transaction_id is null
      or exists (
        select 1 from public.transactions t where t.id = yield_transaction_id and t.user_id = (select auth.uid())
      )
    )
  );
revoke all on public.investment_redemptions from public, anon;
grant select,insert on public.investment_redemptions to authenticated;

-- SECURITY INVOKER: todos os SELECT/INSERT/UPDATE passam pelo RLS existente.
-- O Postgres executa toda a operacao em uma unica transacao. Em qualquer erro,
-- nao fica credito na conta sem o correspondente debito de investimento.
create or replace function public.redeem_investment(
  p_request_id uuid,
  p_investment_id uuid,
  p_bank_account_id text,
  p_redemption_date date,
  p_principal numeric,
  p_net_yield numeric default 0,
  p_withheld_tax numeric default 0,
  p_is_full boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_inv public.investments%rowtype;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_principal numeric(14,2);
  v_yield numeric(14,2);
  v_tax numeric(14,2);
  v_ratio numeric;
  v_transaction_id text;
  v_yield_transaction_id text;
  v_existing public.investment_redemptions%rowtype;
begin
  if v_uid is null then raise exception 'Sessao expirada. Entre novamente.' using errcode='28000'; end if;
  if p_request_id is null or p_investment_id is null or p_bank_account_id is null or p_redemption_date is null then
    raise exception 'Preencha investimento, conta e data.' using errcode='22023';
  end if;
  if p_redemption_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do credito nao pode estar no futuro.' using errcode='22023';
  end if;
  if p_principal is null or p_net_yield is null or p_withheld_tax is null
    or p_principal <= 0 or p_net_yield < 0 or p_withheld_tax < 0
    or p_principal > 999999999999 or p_net_yield > 999999999999 or p_withheld_tax > 999999999999
    or round(p_principal,2) <> p_principal or round(p_net_yield,2) <> p_net_yield
    or round(p_withheld_tax,2) <> p_withheld_tax then
    raise exception 'Valores invalidos: use reais com no maximo 2 casas decimais.' using errcode='22023';
  end if;

  -- Bloqueio por investimento impede resgates simultaneos acima do saldo.
  select * into v_inv from public.investments
  where id = p_investment_id and user_id = v_uid for update;
  if not found then raise exception 'Investimento nao encontrado ou sem permissao.' using errcode='22023'; end if;

  -- Repetir o mesmo request_id nao cria um segundo credito.
  select * into v_existing from public.investment_redemptions
  where id = p_request_id and user_id = v_uid;
  if found then
    if v_existing.investment_id <> p_investment_id
      or v_existing.bank_account_id <> p_bank_account_id
      or v_existing.redemption_date <> p_redemption_date
      or v_existing.principal <> p_principal
      or v_existing.net_yield <> p_net_yield
      or v_existing.withheld_tax <> p_withheld_tax
      or v_existing.is_full <> p_is_full then
      raise exception 'Solicitacao de resgate ja utilizada com outros valores.' using errcode='23505';
    end if;
    return v_existing.id;
  end if;

  if coalesce(v_inv.position_status,'active') <> 'active' then
    raise exception 'Investimento ja resgatado.' using errcode='22023';
  end if;
  if coalesce(v_inv.asset_class,'') not in ('cdb','tesouro','pos_fixado') then
    raise exception 'Resgate automatico disponivel somente para renda fixa e pos-fixados.' using errcode='22023';
  end if;
  if v_inv.purchase_date is not null and p_redemption_date < v_inv.purchase_date then
    raise exception 'Data de credito anterior a compra do titulo.' using errcode='22023';
  end if;
  if exists (
    select 1 from public.investment_redemptions
    where investment_id=p_investment_id and user_id=v_uid and redemption_date>p_redemption_date
  ) then
    raise exception 'A data deve ser igual ou posterior ao ultimo resgate registrado.' using errcode='22023';
  end if;
  perform 1 from public.bank_accounts
    where id=p_bank_account_id and user_id=v_uid;
  if not found then raise exception 'Conta de destino nao encontrada.' using errcode='22023'; end if;

  v_before := round(coalesce(v_inv.invested_amount,v_inv.value,0),2);
  v_principal := p_principal;
  v_yield := p_net_yield;
  v_tax := p_withheld_tax;
  if v_before <= 0 or v_principal > v_before then
    raise exception 'Capital do resgate excede o capital disponivel.' using errcode='22023';
  end if;
  v_after := v_before-v_principal;
  if p_is_full is distinct from (v_after=0) then
    raise exception 'Resgate total precisa abranger todo o capital restante.' using errcode='22023';
  end if;
  v_ratio := v_after / v_before;

  -- Credito do capital: entra no saldo, mas NAO em receita.
  insert into public.transactions
    (user_id,name,category,icon,type,transaction_kind,date,purchase_date,transaction_date,
     amount,bank_account_id,card,transaction_status,is_visible)
  values
    (v_uid,'Resgate de capital - '||v_inv.name,'Investimentos > Resgate','🏦',
     'income','investment_movement',to_char(p_redemption_date,'DD-MM-YYYY'),
     p_redemption_date,p_redemption_date,v_principal::double precision,p_bank_account_id,
     null,'posted',true)
  returning id into v_transaction_id;

  -- Credito do ganho LIQUIDO: somente este valor conta como receita.
  -- IR/IOF retido na fonte e detalhado no historico, nao cobrado de novo.
  if v_yield > 0 then
    insert into public.transactions
      (user_id,name,category,icon,type,transaction_kind,date,purchase_date,transaction_date,
       amount,bank_account_id,card,transaction_status,is_visible)
    values
      (v_uid,'Rendimento de resgate - '||v_inv.name,'Receita > Juros','📈',
       'income','yield',to_char(p_redemption_date,'DD-MM-YYYY'),
       p_redemption_date,p_redemption_date,v_yield::double precision,p_bank_account_id,
       null,'posted',true)
    returning id into v_yield_transaction_id;
  end if;

  update public.investments
  set invested_amount=v_after, value=v_after,
      current_gross_value=case when current_gross_value is null then null
        else round(current_gross_value*v_ratio,2) end,
      current_net_value=case when current_net_value is null then null
        else round(current_net_value*v_ratio,2) end,
      quantity=case when quantity is null then null else round(quantity*v_ratio,8) end,
      position_status=case when v_after=0 then 'redeemed' else 'active' end,
      redeemed_at=case when v_after=0 then p_redemption_date else null end,
      last_manual_update=now()
  where id=p_investment_id and user_id=v_uid;
  if not found then raise exception 'Falha ao atualizar a posicao.' using errcode='22023'; end if;

  insert into public.investment_redemptions
    (id,user_id,investment_id,bank_account_id,asset_name,redemption_date,
     principal,net_yield,withheld_tax,received_total,principal_before,principal_after,is_full,
     principal_transaction_id,yield_transaction_id)
  values
    (p_request_id,v_uid,p_investment_id,p_bank_account_id,v_inv.name,p_redemption_date,
     v_principal,v_yield,v_tax,v_principal+v_yield,v_before,v_after,v_after=0,
     v_transaction_id,v_yield_transaction_id);
  return p_request_id;
end;
$fn$;

revoke all on function public.redeem_investment(uuid,uuid,text,date,numeric,numeric,numeric,boolean)
  from public, anon;
grant execute on function public.redeem_investment(uuid,uuid,text,date,numeric,numeric,numeric,boolean)
  to authenticated;


-- Impede alterar posteriormente os creditos vinculados ao resgate auditavel.
-- A UI deve orientar a corrigir um erro via conciliacao, nunca corromper a trilha.
create or replace function public.cofre_protect_redemption_transactions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if exists (
    select 1 from public.investment_redemptions r
    where r.principal_transaction_id = old.id
       or r.yield_transaction_id = old.id
  ) then
    raise exception 'Lancamento vinculado a resgate. Corrija pelo fluxo de conciliacao, nao editando o credito.'
      using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$guard$;

create trigger trg_cofre_protect_redemption_transactions
before update or delete on public.transactions
for each row execute function public.cofre_protect_redemption_transactions();

revoke all on function public.cofre_protect_redemption_transactions() from public, anon;
