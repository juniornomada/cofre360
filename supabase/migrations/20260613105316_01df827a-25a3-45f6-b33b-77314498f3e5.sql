-- Corrige a coluna id da tabela card_payments:
-- 1) Backfill de IDs nulos com UUIDs novos
-- 2) Define default gen_random_uuid()
-- 3) Torna NOT NULL e adiciona PRIMARY KEY

UPDATE public.card_payments
SET id = gen_random_uuid()::text
WHERE id IS NULL OR id = '';

ALTER TABLE public.card_payments
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN id SET NOT NULL;

-- Adiciona PRIMARY KEY caso ainda não exista
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.card_payments'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.card_payments ADD CONSTRAINT card_payments_pkey PRIMARY KEY (id);
  END IF;
END $$;