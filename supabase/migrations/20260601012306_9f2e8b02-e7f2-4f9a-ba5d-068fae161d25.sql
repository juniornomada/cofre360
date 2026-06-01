CREATE OR REPLACE FUNCTION public.safe_transfer_user_email(old_email TEXT, new_email TEXT)
RETURNS TEXT AS $$
DECLARE
    source_user_id UUID;
BEGIN
    -- 1. Check if the source email exists
    SELECT id INTO source_user_id FROM auth.users WHERE email = old_email LIMIT 1;
    
    IF source_user_id IS NULL THEN
        RAISE EXCEPTION '[SOURCE_EMAIL_NOT_FOUND] Campo: e-mail de origem. O e-mail % não foi encontrado.', old_email;
    END IF;

    -- 2. Attempt the update. 
    -- The database-level UNIQUE constraint on auth.users(email) handles concurrency.
    BEGIN
        UPDATE auth.users SET email = new_email WHERE id = source_user_id;
    EXCEPTION 
        WHEN unique_violation THEN
            RAISE EXCEPTION '[DESTINATION_EMAIL_IN_USE] Campo: e-mail de destino. O e-mail % já está em uso por outra conta.', new_email;
    END;
    
    -- 3. Verify if any row was actually updated
    IF NOT FOUND THEN
        RAISE EXCEPTION '[UPDATE_FAILED] Erro: A atualização não alterou nenhum registro. O usuário de origem pode ter sido removido ou alterado simultaneamente.';
    END IF;

    RETURN 'Sucesso: Dados transferidos de ' || old_email || ' para ' || new_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Admin access only
REVOKE ALL ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;
