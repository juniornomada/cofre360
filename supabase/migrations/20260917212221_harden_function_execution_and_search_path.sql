-- Security hardening applied to production on 2026-09-17.
--
-- Goals:
-- 1) Pin search_path on database helper/trigger functions.
-- 2) Prevent clients from invoking SECURITY DEFINER trigger functions via RPC.
-- 3) Run read-only user RPCs as SECURITY INVOKER so RLS remains authoritative.
-- 4) Make profile ownership immutable across UPDATEs.

alter function public.require_card_on_debit_to_credit() set search_path = '';
alter function public.infer_card_logo_url(text) set search_path = '';
alter function public.set_card_logo_url_from_name() set search_path = '';
alter function public.set_card_refund_purchase_date() set search_path = '';
alter function public.cofre_parse_legacy_date(text, timestamptz) set search_path = '';
alter function public.cofre_infer_transaction_kind(text, text) set search_path = '';
alter function public.cofre_card_cycle_month(date, bigint) set search_path = '';

alter function public.cofre_sync_card_name_from_id() set search_path = '';
alter function public.cofre_sync_transaction_canonical() set search_path = '';
alter function public.collapse_installment_group_when_single() set search_path = '';

revoke all on function public.cofre_sync_card_name_from_id() from public, anon, authenticated;
revoke all on function public.cofre_sync_transaction_canonical() from public, anon, authenticated;
revoke all on function public.collapse_installment_group_when_single() from public, anon, authenticated;

alter function public.get_bank_account_balances(uuid) security invoker;
alter function public.get_bank_account_balances(uuid) set search_path = '';
revoke all on function public.get_bank_account_balances(uuid) from public, anon;
grant execute on function public.get_bank_account_balances(uuid) to authenticated;

alter function public.get_card_invoice_totals(uuid) security invoker;
alter function public.get_card_invoice_totals(uuid) set search_path = '';
revoke all on function public.get_card_invoice_totals(uuid) from public, anon;
grant execute on function public.get_card_invoice_totals(uuid) to authenticated;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
