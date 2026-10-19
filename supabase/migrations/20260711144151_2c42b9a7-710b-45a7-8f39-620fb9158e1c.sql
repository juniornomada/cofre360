
-- =========================================================================
-- reconciliation_rules
-- =========================================================================
CREATE TABLE public.reconciliation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('bank_account','card','invoice','budget')),
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('equality','sum','zero')),
  tolerance_kind TEXT NOT NULL DEFAULT 'abs' CHECK (tolerance_kind IN ('abs','pct')),
  tolerance_value NUMERIC NOT NULL DEFAULT 0 CHECK (tolerance_value >= 0),
  target_ids UUID[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_rules TO authenticated;
GRANT ALL ON public.reconciliation_rules TO service_role;

ALTER TABLE public.reconciliation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reconciliation_rules"
  ON public.reconciliation_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_reconciliation_rules_user ON public.reconciliation_rules(user_id, enabled);

-- =========================================================================
-- reconciliation_runs
-- =========================================================================
CREATE TABLE public.reconciliation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual','scheduled')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  divergences_count INT NOT NULL DEFAULT 0,
  total_divergence_amount NUMERIC NOT NULL DEFAULT 0,
  payload JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_runs TO authenticated;
GRANT ALL ON public.reconciliation_runs TO service_role;

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reconciliation_runs"
  ON public.reconciliation_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_reconciliation_runs_user_started ON public.reconciliation_runs(user_id, started_at DESC);

-- =========================================================================
-- reconciliation_divergences
-- =========================================================================
CREATE TABLE public.reconciliation_divergences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.reconciliation_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('bank_account','card','invoice','budget')),
  entity_id UUID,
  entity_label TEXT NOT NULL,
  expected NUMERIC NOT NULL DEFAULT 0,
  actual NUMERIC NOT NULL DEFAULT 0,
  delta NUMERIC NOT NULL DEFAULT 0,
  rule_id UUID REFERENCES public.reconciliation_rules(id) ON DELETE SET NULL,
  investigated BOOLEAN NOT NULL DEFAULT false,
  investigated_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_divergences TO authenticated;
GRANT ALL ON public.reconciliation_divergences TO service_role;

ALTER TABLE public.reconciliation_divergences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reconciliation_divergences"
  ON public.reconciliation_divergences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_reconciliation_divergences_user_open
  ON public.reconciliation_divergences(user_id, investigated, created_at DESC);
CREATE INDEX idx_reconciliation_divergences_run ON public.reconciliation_divergences(run_id);

-- =========================================================================
-- updated_at triggers (reuse public.handle_updated_at)
-- =========================================================================
CREATE TRIGGER trg_reconciliation_rules_updated_at
  BEFORE UPDATE ON public.reconciliation_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_reconciliation_runs_updated_at
  BEFORE UPDATE ON public.reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_reconciliation_divergences_updated_at
  BEFORE UPDATE ON public.reconciliation_divergences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
