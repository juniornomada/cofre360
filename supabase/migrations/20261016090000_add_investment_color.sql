-- Optional visual identification for each user's investment / fund.
-- Existing investments retain NULL and are not recolored or recalculated.
-- RLS, ownership and monetary columns are unchanged.
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.investments.color IS
  'Optional card-palette gradient classes for identifying a fund in the portfolio.';
