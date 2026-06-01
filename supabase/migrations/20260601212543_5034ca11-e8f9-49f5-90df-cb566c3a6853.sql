-- Add extension for uuid generation if not exists
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Alter cards table to add default to id and ensure it uses gen_random_uuid()
-- Since it's text in the schema but likely meant to be UUID or at least unique,
-- we'll use gen_random_uuid()::text as default.
ALTER TABLE public.cards ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Ensure user_id has proper default
ALTER TABLE public.cards ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Re-apply grants just in case
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
