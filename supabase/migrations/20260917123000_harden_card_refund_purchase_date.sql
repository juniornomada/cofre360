-- Evita cast implícito de texto legado (ex.: "17 set") para PostgreSQL DATE.
-- Reembolsos de cartão passam a usar primeiro a data canônica da transação e,
-- como fallback, o parser legado seguro já utilizado pelas transações.

create or replace function public.set_card_refund_purchase_date()
returns trigger
language plpgsql
as $function$
begin
  if new.purchase_date is null
     and new.type = 'income'
     and new.category = 'Receita > Reembolso'
     and nullif(trim(new.card), '') is not null then
    new.purchase_date := coalesce(
      new.transaction_date,
      public.cofre_parse_legacy_date(new.date, coalesce(new.created_at, now()))
    );
  end if;
  return new;
end;
$function$;
