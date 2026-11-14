-- Classificacao patrimonial do principal dos emprestimos sem alterar lancamentos anteriores.
-- Entradas e devolucoes alteram o saldo da conta, mas nao sao receita/despesa economica.
CREATE OR REPLACE FUNCTION public.cofre_infer_transaction_kind(p_type text, p_category text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  full_norm text := lower(translate(coalesce(trim(p_category), ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
  root_norm text;
begin
  root_norm := trim(split_part(full_norm, '>', 1));
  if root_norm in ('transferencia', 'transferencias') then return 'transfer'; end if;
  if root_norm in ('pagamento de cartao', 'pagamento do cartao', 'pagamento cartao') then return 'card_payment'; end if;
  if root_norm = 'ajustes' then return 'adjustment'; end if;
  if full_norm = 'receita > reembolso' or full_norm like 'receita > reembolso >%' then return 'refund'; end if;
  if full_norm = 'receita > juros' or full_norm like 'receita > juros >%' then return 'yield'; end if;
  if root_norm in ('investimento', 'investimentos') then return 'investment_movement'; end if;
  if root_norm in ('emprestimos recebidos', 'devolucao de emprestimos') then return 'loan_movement'; end if;
  if lower(coalesce(p_type, 'expense')) = 'income' then return 'income'; end if;
  return 'expense';
end; $function$

