DROP POLICY IF EXISTS "Users can view bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can view cards" ON public.cards;
DROP POLICY IF EXISTS "Users can view transactions" ON public.transactions;

CREATE POLICY "Users can view their own goals"
ON public.goals
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);