
ALTER TABLE public.reconciliation_divergences
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved')),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Backfill status from legacy investigated flag
UPDATE public.reconciliation_divergences
   SET status = CASE WHEN investigated THEN 'investigating' ELSE 'open' END
 WHERE status = 'open' AND investigated = true;

CREATE INDEX IF NOT EXISTS idx_reconciliation_divergences_user_status
  ON public.reconciliation_divergences(user_id, status, created_at DESC);
