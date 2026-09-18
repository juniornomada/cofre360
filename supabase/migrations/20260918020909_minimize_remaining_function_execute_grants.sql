-- Remove anonymous/public EXECUTE from remaining financial helper functions.
-- Trigger-only functions are internal; authenticated users keep access only to
-- pure helpers needed by authenticated financial RPCs.

revoke execute on function public.cofre_card_cycle_month(date,bigint) from public, anon;
revoke execute on function public.cofre_infer_transaction_kind(text,text) from public, anon;
revoke execute on function public.cofre_parse_legacy_date(text,timestamptz) from public, anon;
revoke execute on function public.infer_card_logo_url(text) from public, anon;

grant execute on function public.cofre_card_cycle_month(date,bigint) to authenticated, service_role;
grant execute on function public.cofre_infer_transaction_kind(text,text) to authenticated, service_role;
grant execute on function public.cofre_parse_legacy_date(text,timestamptz) to authenticated, service_role;
grant execute on function public.infer_card_logo_url(text) to authenticated, service_role;

revoke execute on function public.require_card_on_debit_to_credit() from public, anon, authenticated;
revoke execute on function public.set_card_logo_url_from_name() from public, anon, authenticated;
revoke execute on function public.set_card_refund_purchase_date() from public, anon, authenticated;

grant execute on function public.require_card_on_debit_to_credit() to service_role;
grant execute on function public.set_card_logo_url_from_name() to service_role;
grant execute on function public.set_card_refund_purchase_date() to service_role;

revoke execute on function public.financial_month_facts(date) from public, anon;
grant execute on function public.financial_month_facts(date) to authenticated, service_role;
alter function public.financial_month_facts(date) set search_path = '';
