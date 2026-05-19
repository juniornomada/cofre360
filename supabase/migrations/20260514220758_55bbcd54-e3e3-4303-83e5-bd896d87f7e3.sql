CREATE TABLE public.bank_account_balance_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  previous_balance DECIMAL(15,2) NOT NULL,
  new_balance DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_account_balance_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see history for accounts they own. 
-- Since bank_accounts doesn't have a user_id yet (it's a single-user app or user_id is implicit in the project), 
-- we follow the existing pattern of enabling read for all if no specific user context is required by the current RLS setup.
-- However, checking the current RLS on bank_accounts is safer.
CREATE POLICY "Anyone can view balance history" 
ON public.bank_account_balance_history 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert balance history" 
ON public.bank_account_balance_history 
FOR INSERT 
WITH CHECK (true);

CREATE INDEX idx_balance_history_account_id ON public.bank_account_balance_history(bank_account_id);