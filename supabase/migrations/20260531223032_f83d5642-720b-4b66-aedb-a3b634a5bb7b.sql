-- Fix and rerun the test for early return
CREATE OR REPLACE FUNCTION public.test_safe_transfer_early_return()
RETURNS TEXT AS $$
DECLARE
    email_source TEXT := 'test_source_early@example.com';
    email_target TEXT := 'test_target_exists@example.com';
    u_source_id UUID;
    u_target_id UUID;
    test_result TEXT;
BEGIN
    -- 1. Setup: Create test users one by one to avoid RETURNING ambiguity
    INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (gen_random_uuid(), email_source, now(), '{"provider":"email"}', '{}', 'authenticated', 'authenticated')
    RETURNING id INTO u_source_id;

    INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (gen_random_uuid(), email_target, now(), '{"provider":"email"}', '{}', 'authenticated', 'authenticated')
    RETURNING id INTO u_target_id;

    -- 2. Test: Attempt to transfer source to target (should fail early)
    BEGIN
        PERFORM public.safe_transfer_user_email(email_source, email_target);
        test_result := 'FAILURE: Function did not return early or raise exception.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%e-mail de destino%' THEN
            -- Verify source record is unchanged
            IF EXISTS (SELECT 1 FROM auth.users WHERE id = u_source_id AND email = email_source) THEN
                test_result := 'SUCCESS: Returned early and records are intact.';
            ELSE
                test_result := 'FAILURE: Exception raised but record was altered.';
            END IF;
        ELSE
            test_result := 'FAILURE: Wrong error message - ' || SQLERRM;
        END IF;
    END;

    -- 3. Cleanup
    DELETE FROM auth.users WHERE id IN (u_source_id, u_target_id);
    
    RETURN test_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Admin execution only
REVOKE ALL ON FUNCTION public.test_safe_transfer_early_return() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_safe_transfer_early_return() TO service_role;

-- Verification
DO $$
DECLARE
    final_res TEXT;
BEGIN
    SELECT public.test_safe_transfer_early_return() INTO final_res;
    IF final_res NOT LIKE 'SUCCESS%' THEN
        RAISE EXCEPTION 'Test failed: %', final_res;
    END IF;
END $$;

-- Final Cleanup
DROP FUNCTION IF EXISTS public.test_safe_transfer_early_return();
