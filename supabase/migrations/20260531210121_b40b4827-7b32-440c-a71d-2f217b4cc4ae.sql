CREATE OR REPLACE FUNCTION public.safe_transfer_user_email(old_email TEXT, new_email TEXT)
RETURNS TEXT AS $$
DECLARE
    source_user_id UUID;
    target_exists BOOLEAN;
BEGIN
    -- 1. Check if source user exists
    SELECT id INTO source_user_id FROM auth.users WHERE email = old_email;
    IF source_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário de origem (%) não encontrado.', old_email;
    END IF;

    -- 2. Check if target email already exists (The Validation)
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = new_email) INTO target_exists;
    IF target_exists THEN
        RAISE EXCEPTION 'O e-mail de destino (%) já existe. Operação cancelada para evitar conflitos.', new_email;
    END IF;

    -- 3. Perform the update in auth.users
    -- Updating the email in auth.users will automatically keep all public tables 
    -- (linked by user_id) associated with this account.
    UPDATE auth.users 
    SET email = new_email,
        email_confirmed_at = now(), -- Ensure it remains confirmed
        updated_at = now()
    WHERE id = source_user_id;

    RETURN 'Sucesso: O usuário ' || old_email || ' agora utiliza o e-mail ' || new_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO authenticated;
