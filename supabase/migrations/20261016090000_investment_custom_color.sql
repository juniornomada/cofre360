-- Optional color swatch for each investment/fund.
-- Existing rows keep NULL and retain their asset-class color.
-- No changes to user data, valuation logic, RLS policies or grants.
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS color text;

-- Restrict to a safe CSS hex color, so user-controlled strings cannot
-- become arbitrary CSS values when shown as card accents.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'investments_color_hex_check'
      AND conrelid = 'public.investments'::regclass
  ) THEN
    ALTER TABLE public.investments
      ADD CONSTRAINT investments_color_hex_check
      CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END
$$;
