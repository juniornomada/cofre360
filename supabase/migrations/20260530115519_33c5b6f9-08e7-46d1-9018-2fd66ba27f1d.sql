DROP POLICY IF EXISTS "Anyone can insert test runs" ON public.ai_test_runs;
REVOKE INSERT ON public.ai_test_runs FROM authenticated, anon;