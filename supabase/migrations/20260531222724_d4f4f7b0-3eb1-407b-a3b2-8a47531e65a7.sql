CREATE OR REPLACE FUNCTION public.safe_transfer_user_email(old_email TEXT, new_email TEXT)
RETURNS TEXT AS $$
DECLARE
    target_user_id UUID;
    source_user_id UUID;
BEGIN
    -- 1. EARLY CHECK: Check if the target email already exists before anything else
    SELECT id INTO target_user_id FROM auth.users WHERE email = new_email LIMIT 1;
    
    IF target_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'Campo: e-mail de destino. O e-mail % já está em uso por outra conta.', new_email;
    END IF;

    -- 2. Check if the source email exists
    SELECT id INTO source_user_id FROM auth.users WHERE email = old_email LIMIT 1;
    
    IF source_user_id IS NULL THEN
        RAISE EXCEPTION 'Campo: e-mail de origem. O e-mail % não foi encontrado.', old_email;
    END IF;

    -- 3. Perform the update
    UPDATE auth.users SET email = new_email WHERE id = source_user_id;
    
    RETURN 'Sucesso: Dados transferidos de ' || old_email || ' para ' || new_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Ensure strictly administrative access
REVOKE ALL ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;
