DO $$
DECLARE
    old_user_id UUID := 'c5c2adec-caad-4b80-9060-6923e245ed36'; -- wojr@live.com
    new_user_id UUID := '76290508-9ac5-4540-ae3f-d0efb6cf0060'; -- juniornomada@hotmail.com
BEGIN
    -- Update all related tables
    UPDATE public.transactions SET user_id = new_user_id WHERE user_id = old_user_id;
    UPDATE public.bank_accounts SET user_id = new_user_id WHERE user_id = old_user_id;
    UPDATE public.cards SET user_id = new_user_id WHERE user_id = old_user_id;
    UPDATE public.card_payments SET user_id = new_user_id WHERE user_id = old_user_id;
    UPDATE public.budget_categories SET user_id = new_user_id WHERE user_id = old_user_id;
    UPDATE public.goals SET user_id = new_user_id WHERE user_id = old_user_id;
    UPDATE public.reminders SET user_id = new_user_id WHERE user_id = old_user_id;

    -- Handle profile merge
    -- If juniornomada@hotmail.com already has a profile, delete it before moving the one from wojr@live.com
    DELETE FROM public.profiles WHERE user_id = new_user_id;
    UPDATE public.profiles SET user_id = new_user_id WHERE user_id = old_user_id;

    -- Optionally delete the old user from auth.users since it's now empty
    DELETE FROM auth.users WHERE id = old_user_id;
END $$;