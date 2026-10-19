-- The auth.users table already has a UNIQUE constraint on email by default in Supabase.
-- However, we can update our function to explicitly handle concurrency/race conditions 
-- by relying on the database's atomic update and capturing any unique violation.

CREATE OR REPLACE FUNCTION public.safe_transfer_user_email(old_email TEXT, new_email TEXT)
RETURNS TEXT AS $$
DECLARE
    source_user_id UUID;
BEGIN
    -- 1. Check if the source email exists
    SELECT id INTO source_user_id FROM auth.users WHERE email = old_email LIMIT 1;
    
    IF source_user_id IS NULL THEN
        RAISE EXCEPTION 'Campo: e-mail de origem. O e-mail % não foi encontrado.', old_email;
    END IF;

    -- 2. Attempt the update. 
    -- If another process inserted the new_email between our check and this update, 
    -- the database-level UNIQUE constraint on auth.users(email) will trigger a 'unique_violation' (23505).
    BEGIN
        UPDATE auth.users SET email = new_email WHERE id = source_user_id;
    EXCEPTION 
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Campo: e-mail de destino. O e-mail % já está em uso por outra conta (conflito de concorrência).', new_email;
    END;
    
    -- 3. Verify if any row was actually updated (in case source_user_id was deleted/changed simultaneously)
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Erro: A atualização não alterou nenhum registro. O usuário de origem pode ter sido removido.';
    END IF;

    RETURN 'Sucesso: Dados transferidos de ' || old_email || ' para ' || new_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Admin access only
REVOKE ALL ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;
