
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  category TEXT NOT NULL DEFAULT 'Outros',
  icon TEXT NOT NULL DEFAULT '🔔',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read reminders" ON public.reminders FOR SELECT USING (true);
CREATE POLICY "Allow public insert reminders" ON public.reminders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update reminders" ON public.reminders FOR UPDATE USING (true);
CREATE POLICY "Allow public delete reminders" ON public.reminders FOR DELETE USING (true);

CREATE TRIGGER update_reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
