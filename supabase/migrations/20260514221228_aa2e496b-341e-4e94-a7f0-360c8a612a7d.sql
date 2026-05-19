-- Add user_id to bank_accounts if not exists (for proper RLS/Audit)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'user_id') THEN
        ALTER TABLE public.bank_accounts ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
    END IF;
END $$;

-- Add user_id to history if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_account_balance_history' AND column_name = 'user_id') THEN
        ALTER TABLE public.bank_account_balance_history ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
    END IF;
END $$;

-- Update RLS policies for history to be more secure (owner only)
DROP POLICY IF EXISTS "Anyone can view balance history" ON public.bank_account_balance_history;
DROP POLICY IF EXISTS "Anyone can insert balance history" ON public.bank_account_balance_history;

CREATE POLICY "Users can view their own balance history" 
ON public.bank_account_balance_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own balance history" 
ON public.bank_account_balance_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);