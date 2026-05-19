ALTER TABLE public.cards ADD COLUMN closing_day integer NOT NULL DEFAULT 1;
ALTER TABLE public.cards ADD COLUMN due_day integer NOT NULL DEFAULT 10;