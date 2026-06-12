
-- Lock down SECURITY DEFINER functions: revoke broad EXECUTE and re-grant narrowly,
-- and enforce that callers can only request their own data.

-- Trigger functions: no API caller should execute these directly.
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Admin-only email transfer: keep callable only by service_role.
REVOKE EXECUTE ON FUNCTION public.safe_transfer_user_email(text, text) FROM PUBLIC, anon, authenticated;

-- Per-user RPCs: enforce auth.uid() = user_id_param, block anon.
REVOKE EXECUTE ON FUNCTION public.get_bank_account_balances(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_card_invoice_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_account_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_card_invoice_totals(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_bank_account_balances(user_id_param uuid)
 RETURNS TABLE(account_id uuid, current_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> user_id_param THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH tx_sums AS (
        SELECT 
            bank_account_id, 
            SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as tx_total
        FROM public.transactions
        WHERE user_id = user_id_param 
          AND bank_account_id IS NOT NULL 
          AND (is_visible IS NULL OR is_visible = true)
        GROUP BY bank_account_id
    )
    SELECT 
        ba.id as account_id,
        (COALESCE(ba.balance, 0) + COALESCE(ts.tx_total, 0))::NUMERIC as current_balance
    FROM public.bank_accounts ba
    LEFT JOIN tx_sums ts ON ts.bank_account_id = ba.id
    WHERE ba.user_id = user_id_param;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_card_invoice_totals(user_id_param uuid)
 RETURNS TABLE(card_id uuid, card_name text, total_spent numeric, total_paid numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> user_id_param THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH spent AS (
        SELECT card, SUM(CASE WHEN type = 'income' THEN -amount ELSE amount END) as total
        FROM public.transactions
        WHERE user_id = user_id_param AND card IS NOT NULL
        GROUP BY card
    ),
    paid AS (
        SELECT p.card_id, SUM(p.amount) as total
        FROM public.card_payments p
        WHERE p.user_id = user_id_param
        GROUP BY p.card_id
    )
    SELECT 
        c.id as card_id, 
        c.name as card_name, 
        COALESCE(s.total, 0)::NUMERIC as total_spent, 
        COALESCE(p.total, 0)::NUMERIC as total_paid
    FROM public.cards c
    LEFT JOIN spent s ON s.card = c.name
    LEFT JOIN paid p ON p.card_id = c.id
    WHERE c.user_id = user_id_param;
END;
$function$;
