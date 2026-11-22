-- PROJ-17 BUG-4: the login may say that an e-mail has no account yet
-- (decision by Jakob, 2026-11-22; replaces the PROJ-2 rule for the login only).
--
-- auth.users is the source of truth. profiles.email is only a snapshot from
-- signup and goes stale when support changes an address.
--
-- Access: service role only. The app calls this after Supabase accepted the
-- CAPTCHA, and the attempt counts against the login limits.
-- Production: run before the code deploy. Without this function the login
-- still works and falls back to the neutral error message.

CREATE OR REPLACE FUNCTION public.account_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM auth.users AS users
     WHERE users.email = lower(trim(p_email))
       AND users.is_sso_user = false
       AND users.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.account_exists(TEXT) IS
  'PROJ-17: true if an account exists for this e-mail. Service role only.';

REVOKE ALL ON FUNCTION public.account_exists(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_exists(TEXT) TO service_role;
