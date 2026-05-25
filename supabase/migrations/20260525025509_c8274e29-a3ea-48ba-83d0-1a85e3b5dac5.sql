ALTER TABLE public.transactions ADD COLUMN is_visible BOOLEAN DEFAULT true;

-- Update existing transactions to be visible
UPDATE public.transactions SET is_visible = true WHERE is_visible IS NULL;