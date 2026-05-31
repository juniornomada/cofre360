-- Fix security issues for the safe_transfer_user_email function
ALTER FUNCTION public.safe_transfer_user_email(TEXT, TEXT) 
SET search_path = public, auth;

-- Revoke permissions from public and authenticated to make it admin-only
REVOKE EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) FROM authenticated;

-- Ensure service_role still has access
GRANT EXECUTE ON FUNCTION public.safe_transfer_user_email(TEXT, TEXT) TO service_role;
