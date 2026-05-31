-- Cleanup test function that had a bug
DROP FUNCTION IF EXISTS public.test_safe_transfer_validation();

-- Ensure safe_transfer_user_email is strictly service_role only to fix linter warnings
REVOKE ALL ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;
