-- Guardar snapshots das cotacoes antes de zerar a posicao e impedir
-- creditos desatualizados. Nenhum registro de investimento e alterado aqui.
alter table public.investment_redemptions
  add column if not exists gross_before numeric(14,2),
  add column if not exists net_before numeric(14,2);

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
  v_expected_total numeric(14,2);
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

  -- O credito precisa corresponder ao LIQUIDO salvo na carteira.
  -- A verificacao ocorre com o investimento bloqueado, impedindo resgate
  -- por cotacao antiga ou adulteracao dos valores calculados pelo navegador.
  if v_inv.current_net_value is null or v_inv.current_net_value <= 0 then
    raise exception 'Atualize o valor liquido do investimento antes de resgatar.'
      using errcode='22023';
  end if;
  if round(v_inv.current_net_value,2) < v_before then
    raise exception 'O resgate com prejuizo exige conciliacao especifica.'
      using errcode='22023';
  end if;
  v_expected_total := round(v_inv.current_net_value * v_ratio,2);
  if round(v_principal + v_yield,2) <> v_expected_total then
    raise exception 'Valor liquido da carteira mudou. Atualize a pagina e confira novamente.'
      using errcode='22023';
  end if;

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
     principal_transaction_id,yield_transaction_id,gross_before,net_before)
  values
    (p_request_id,v_uid,p_investment_id,p_bank_account_id,v_inv.name,p_redemption_date,
     v_principal,v_yield,v_tax,v_principal+v_yield,v_before,v_after,v_after=0,
     v_transaction_id,v_yield_transaction_id,
     v_inv.current_gross_value,v_inv.current_net_value);
  return p_request_id;
end;
$fn$;
