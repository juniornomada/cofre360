-- Ensure service_role can execute the function for testing
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;

DO $$
DECLARE
    source_email TEXT := 'source_test_' || gen_random_uuid() || '@example.com';
    dest_email TEXT := 'dest_test_' || gen_random_uuid() || '@example.com';
    error_msg TEXT;
BEGIN
    -- 1. Create source user
    INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, email_confirmed_at)
    VALUES (gen_random_uuid(), source_email, '{}', '{}', 'authenticated', 'authenticated', now());

    -- 2. Create destination user (to block)
    INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, email_confirmed_at)
    VALUES (gen_random_uuid(), dest_email, '{}', '{}', 'authenticated', 'authenticated', now());

    -- 3. Attempt transfer and catch error
    BEGIN
        PERFORM public.safe_transfer_user_email(source_email, dest_email);
        RAISE EXCEPTION 'Transfer should have failed with DESTINATION_EMAIL_IN_USE';
    EXCEPTION WHEN OTHERS THEN
        error_msg := SQLERRM;
        IF error_msg NOT LIKE '%[DESTINATION_EMAIL_IN_USE]%' THEN
            RAISE EXCEPTION 'Incorrect error message. Expected [DESTINATION_EMAIL_IN_USE], got: %', error_msg;
        END IF;
    END;

    -- 4. Verify no changes occurred (source user still has old email)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = source_email) THEN
        RAISE EXCEPTION 'Source user email was changed despite failure!';
    END IF;

    -- Cleanup
    DELETE FROM auth.users WHERE email IN (source_email, dest_email);
END;
$$;
