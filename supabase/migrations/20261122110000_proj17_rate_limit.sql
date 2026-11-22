-- PROJ-17: counters for rate limiting (login, password reset, registration,
-- checkout, invitations).
--
-- IP and e-mail addresses are never stored in clear text: the app sends a keyed
-- hash. Counting happens atomically in rate_limit_hit, so parallel requests
-- cannot slip past a limit.
--
-- Access: service role only. RLS is on and there are no policies.
-- Production: run this migration BEFORE the code deploy. The auth actions are
-- fail-closed, so without these functions nobody can log in.

CREATE TABLE public.rate_limit_counters (
  scope            TEXT NOT NULL,
  identifier_hash  TEXT NOT NULL,
  hits             INTEGER NOT NULL DEFAULT 0,
  window_ends_at   TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (scope, identifier_hash),
  CONSTRAINT rate_limit_counters_hits_check CHECK (hits >= 0),
  CONSTRAINT rate_limit_counters_scope_check CHECK (char_length(scope) BETWEEN 1 AND 40),
  CONSTRAINT rate_limit_counters_hash_check CHECK (char_length(identifier_hash) = 64)
);

COMMENT ON TABLE public.rate_limit_counters IS
  'PROJ-17: rate limit counters per scope and hashed identifier. Service role only.';
COMMENT ON COLUMN public.rate_limit_counters.identifier_hash IS
  'Keyed hash of an IP, e-mail, account or project. Never clear text.';

CREATE INDEX idx_rate_limit_counters_window
  ON public.rate_limit_counters (window_ends_at);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_counters TO service_role;

-- Counts one attempt and reports whether it is within the limit.
CREATE FUNCTION public.rate_limit_hit(
  p_scope TEXT,
  p_identifier_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (is_allowed BOOLEAN, current_hits INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now  TIMESTAMPTZ := clock_timestamp();
  v_hits INTEGER;
  v_ends TIMESTAMPTZ;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate_limit_hit: invalid limit or window';
  END IF;

  INSERT INTO public.rate_limit_counters AS c (scope, identifier_hash, hits, window_ends_at)
  VALUES (p_scope, p_identifier_hash, 1, v_now + make_interval(secs => p_window_seconds))
  ON CONFLICT (scope, identifier_hash) DO UPDATE
    SET hits = CASE WHEN c.window_ends_at <= v_now THEN 1 ELSE c.hits + 1 END,
        window_ends_at = CASE
          WHEN c.window_ends_at <= v_now THEN EXCLUDED.window_ends_at
          ELSE c.window_ends_at
        END
  RETURNING c.hits, c.window_ends_at INTO v_hits, v_ends;

  RETURN QUERY SELECT
    v_hits <= p_limit,
    v_hits,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM v_ends - v_now))::INTEGER);
END;
$$;

-- Takes back one attempt, for example after a successful login.
CREATE FUNCTION public.rate_limit_undo(
  p_scope TEXT,
  p_identifier_hash TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.rate_limit_counters
     SET hits = GREATEST(hits - 1, 0)
   WHERE scope = p_scope
     AND identifier_hash = p_identifier_hash;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_undo(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_undo(TEXT, TEXT) TO service_role;

-- Daily cleanup of expired counters.
DO $cron$
DECLARE
  existing_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO existing_job_id FROM cron.job
     WHERE jobname = 'rate-limit-counters-cleanup';
    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
      'rate-limit-counters-cleanup',
      '15 3 * * *',
      'DELETE FROM public.rate_limit_counters WHERE window_ends_at < (now() - INTERVAL ''1 day'')'
    );
  END IF;
END
$cron$;
