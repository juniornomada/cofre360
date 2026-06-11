ALTER FUNCTION public.get_card_invoice_totals(UUID) SET search_path = public;
ALTER FUNCTION public.get_bank_account_balances(UUID) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_card_invoice_totals(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_bank_account_balances(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_card_invoice_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_account_balances(UUID) TO authenticated;