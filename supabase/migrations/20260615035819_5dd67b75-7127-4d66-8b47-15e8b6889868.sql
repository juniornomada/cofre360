-- 1) Delete orphan rows with NULL user_id (unattributable; publicly exposed)
DELETE FROM public.card_payments WHERE user_id IS NULL;
DELETE FROM public.budget_categories WHERE user_id IS NULL;
DELETE FROM public.cards WHERE user_id IS NULL;
DELETE FROM public.bank_accounts WHERE user_id IS NULL;
DELETE FROM public.transactions WHERE user_id IS NULL;
DELETE FROM public.goals WHERE user_id IS NULL;
DELETE FROM public.reminders WHERE user_id IS NULL;

-- 2) Replace permissive policies (remove OR user_id IS NULL; restrict to authenticated)
DROP POLICY IF EXISTS "Users can manage their own bank accounts" ON public.bank_accounts;
CREATE POLICY "Users can manage their own bank accounts" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own budget categories" ON public.budget_categories;
CREATE POLICY "Users can manage their own budget categories" ON public.budget_categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own card payments" ON public.card_payments;
CREATE POLICY "Users can manage their own card payments" ON public.card_payments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own cards" ON public.cards;
CREATE POLICY "Users can manage their own cards" ON public.cards
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own goals" ON public.goals;
CREATE POLICY "Users can manage their own goals" ON public.goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own reminders" ON public.reminders;
CREATE POLICY "Users can manage their own reminders" ON public.reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.transactions;
CREATE POLICY "Users can manage their own transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Enforce NOT NULL on user_id for these tables
ALTER TABLE public.bank_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.budget_categories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.card_payments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.cards ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.goals ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.reminders ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;

-- 4) ai_test_runs: restrict to admin reads only (revoke public access)
DROP POLICY IF EXISTS "Anyone can read test runs" ON public.ai_test_runs;
REVOKE ALL ON public.ai_test_runs FROM anon;
REVOKE ALL ON public.ai_test_runs FROM authenticated;
GRANT ALL ON public.ai_test_runs TO service_role;
-- No public read policy; only service_role (which bypasses RLS) can access.

-- 5) Lock down SECURITY DEFINER helper functions: revoke EXECUTE from anon/public
REVOKE EXECUTE ON FUNCTION public.get_bank_account_balances(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_card_invoice_totals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.safe_transfer_user_email(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(text, text) TO service_role;