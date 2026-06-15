-- Explicit deny-all policy on ai_test_runs (service_role bypasses RLS and remains the only writer/reader).
CREATE POLICY "Deny all client access" ON public.ai_test_runs
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);