-- PROJ-11 BUG-13: queue for transactional mails that could not be sent.
--
-- If Resend fails at the moment of a purchase, the Stripe webhook still has to
-- answer 200 because the purchase is fulfilled. Without this table the mail
-- would be lost. The daily cron (/api/cron/reminders) retries open rows up to
-- three times, then sets gave_up_at and alerts the support address.
--
-- The payload holds recipient, name and mail details. It never holds the claim
-- secret of a guest purchase: a retry creates a new one and stores its hash.
--
-- Access: service role only. RLS is on and there are no policies.
-- Production: run this migration BEFORE the code deploy.

CREATE TABLE public.mail_retry_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_error  TEXT,
  gave_up_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mail_retry_queue_kind_check CHECK (kind IN (
    'invitation',
    'portal_purchase',
    'guest_purchase',
    'renewal',
    'renewal_info'
  )),
  CONSTRAINT mail_retry_queue_attempts_check CHECK (attempts >= 0)
);

COMMENT ON TABLE public.mail_retry_queue IS
  'PROJ-11 BUG-13: mails that failed to send. Retried by the daily cron, removed after success. Service role only.';
COMMENT ON COLUMN public.mail_retry_queue.payload IS
  'Input of the send helper. Personal data, never a guest claim secret.';
COMMENT ON COLUMN public.mail_retry_queue.gave_up_at IS
  'Set after the last failed attempt. Such rows are deleted automatically after 30 days.';

CREATE INDEX idx_mail_retry_queue_open
  ON public.mail_retry_queue (created_at)
  WHERE gave_up_at IS NULL;

CREATE INDEX idx_mail_retry_queue_gave_up
  ON public.mail_retry_queue (gave_up_at)
  WHERE gave_up_at IS NOT NULL;

ALTER TABLE public.mail_retry_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mail_retry_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mail_retry_queue TO service_role;
