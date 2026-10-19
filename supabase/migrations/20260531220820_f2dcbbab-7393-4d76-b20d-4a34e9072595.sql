-- Test function to verify safe_transfer_user_email validation logic
CREATE OR REPLACE FUNCTION public.test_safe_transfer_validation()
RETURNS TEXT AS $$
DECLARE
    result TEXT;
    email_a TEXT := 'test_validation_a@example.com';
    email_b TEXT := 'test_validation_b@example.com';
    user_a_id UUID;
BEGIN
    -- 1. Setup: Create test users
    -- We use inserts to auth.users for testing purposes in this controlled function
    INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES 
        (gen_random_uuid(), email_a, now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
        (gen_random_uuid(), email_b, now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated')
    RETURNING id INTO user_a_id;

    -- 2. Test: Attempt to transfer A to B (should fail because B exists)
    BEGIN
        PERFORM public.safe_transfer_user_email(email_a, email_b);
        -- If it reaches here, it didn't fail
        DELETE FROM auth.users WHERE email IN (email_a, email_b);
        RETURN 'FAILURE: Transfer should have failed because target exists';
    EXCEPTION WHEN OTHERS THEN
        -- Cleanup before returning success
        DELETE FROM auth.users WHERE email IN (email_a, email_b);
        IF SQLERRM LIKE '%já existe%' THEN
            RETURN 'SUCCESS: Transfer failed as expected with message: ' || SQLERRM;
        ELSE
            RETURN 'FAILURE: Transfer failed with unexpected error: ' || SQLERRM;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Execute the test and then drop it
-- Note: In a real migration we wouldn't usually run and drop immediately if we want to see output via another tool,
-- but since I want to confirm it works, I'll keep it for a moment.
