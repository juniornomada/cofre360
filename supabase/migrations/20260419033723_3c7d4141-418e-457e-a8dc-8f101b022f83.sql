ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order based on creation date for existing cards
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn
  FROM public.cards
)
UPDATE public.cards c
SET sort_order = o.rn
FROM ordered o
WHERE c.id = o.id;

CREATE INDEX IF NOT EXISTS idx_cards_sort_order ON public.cards(sort_order);