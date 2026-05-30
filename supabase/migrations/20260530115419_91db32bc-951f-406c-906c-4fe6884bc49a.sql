CREATE TABLE public.ai_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  trigger text NOT NULL DEFAULT 'scheduled',
  total_tests int NOT NULL,
  passed int NOT NULL,
  failed int NOT NULL,
  avg_accuracy int NOT NULL,
  avg_consistency int NOT NULL,
  avg_duration_ms int NOT NULL,
  results jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_test_runs_run_at ON public.ai_test_runs(run_at DESC);
GRANT SELECT, INSERT ON public.ai_test_runs TO authenticated, anon;
GRANT ALL ON public.ai_test_runs TO service_role;
ALTER TABLE public.ai_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read test runs" ON public.ai_test_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert test runs" ON public.ai_test_runs FOR INSERT WITH CHECK (true);