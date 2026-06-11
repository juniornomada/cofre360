CREATE OR REPLACE FUNCTION public.get_card_invoice_totals(user_id_param UUID)
RETURNS TABLE (
    card_id UUID,
    card_name TEXT,
    total_spent NUMERIC,
    total_paid NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.get_bank_account_balances(user_id_param UUID)
RETURNS TABLE (
    account_id UUID,
    current_balance NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.get_card_invoice_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_account_balances(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_card_invoice_totals(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bank_account_balances(UUID) TO service_role;