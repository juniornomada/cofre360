
-- Create cards table
CREATE TABLE public.cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  last_four TEXT NOT NULL DEFAULT '0000',
  brand TEXT NOT NULL DEFAULT 'Mastercard',
  card_limit NUMERIC NOT NULL DEFAULT 0,
  used NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'from-purple-600 to-purple-900',
  emoji TEXT NOT NULL DEFAULT '💳',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read cards" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Allow public insert cards" ON public.cards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update cards" ON public.cards FOR UPDATE USING (true);
CREATE POLICY "Allow public delete cards" ON public.cards FOR DELETE USING (true);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  icon TEXT NOT NULL DEFAULT '💰',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Alimentação',
  date TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  card TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public insert transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update transactions" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete transactions" ON public.transactions FOR DELETE USING (true);

-- Create goals table
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎯',
  current_amount NUMERIC NOT NULL DEFAULT 0,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  deadline TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read goals" ON public.goals FOR SELECT USING (true);
CREATE POLICY "Allow public insert goals" ON public.goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update goals" ON public.goals FOR UPDATE USING (true);
CREATE POLICY "Allow public delete goals" ON public.goals FOR DELETE USING (true);

-- Create budget_categories table
CREATE TABLE public.budget_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📊',
  spent NUMERIC NOT NULL DEFAULT 0,
  budget_limit NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'bg-primary',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read budget_categories" ON public.budget_categories FOR SELECT USING (true);
CREATE POLICY "Allow public insert budget_categories" ON public.budget_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update budget_categories" ON public.budget_categories FOR UPDATE USING (true);
CREATE POLICY "Allow public delete budget_categories" ON public.budget_categories FOR DELETE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budget_categories_updated_at BEFORE UPDATE ON public.budget_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
