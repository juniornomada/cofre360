ALTER TABLE public.transactions 
ADD COLUMN installment_mode TEXT DEFAULT 'divide',
ADD COLUMN installment_source_amount NUMERIC;

-- Update existing rows to have 'divide' as default if they have installments
UPDATE public.transactions 
SET installment_mode = 'divide'
WHERE total_installments > 1;