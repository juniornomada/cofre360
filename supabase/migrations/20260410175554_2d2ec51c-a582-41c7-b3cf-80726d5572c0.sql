
-- Bank accounts (contas correntes)
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT '🏦',
  color TEXT NOT NULL DEFAULT 'from-blue-500 to-blue-800',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read bank_accounts" ON public.bank_accounts FOR SELECT USING (true);
CREATE POLICY "Allow public insert bank_accounts" ON public.bank_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update bank_accounts" ON public.bank_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete bank_accounts" ON public.bank_accounts FOR DELETE USING (true);

-- Card payments (pagamentos de fatura)
CREATE TABLE public.card_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.card_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read card_payments" ON public.card_payments FOR SELECT USING (true);
CREATE POLICY "Allow public insert card_payments" ON public.card_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update card_payments" ON public.card_payments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete card_payments" ON public.card_payments FOR DELETE USING (true);
