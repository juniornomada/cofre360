
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS asset_class TEXT,
  ADD COLUMN IF NOT EXISTS asset_code TEXT,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS admin_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS yield_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS maturity_date DATE,
  ADD COLUMN IF NOT EXISTS current_price NUMERIC,
  ADD COLUMN IF NOT EXISTS last_quote_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS investments_asset_class_code_idx
  ON public.investments(asset_class, asset_code);
