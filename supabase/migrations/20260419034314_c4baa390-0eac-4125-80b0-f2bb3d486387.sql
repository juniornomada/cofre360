ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn
  FROM public.bank_accounts
)
UPDATE public.bank_accounts a
SET sort_order = o.rn
FROM ordered o
WHERE a.id = o.id;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_sort_order ON public.bank_accounts(sort_order);