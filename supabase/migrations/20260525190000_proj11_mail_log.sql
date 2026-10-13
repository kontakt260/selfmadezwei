-- PROJ-11 — Resend-Transaktionsmails
--
-- mail_log Tabelle: zentrale Idempotenz für Welcome- und Reminder-Mails.
-- Stripe-getriggerte Mails brauchen keinen extra Marker, weil der Stripe-
-- Webhook bereits idempotent ist (payments.stripe_session_id UNIQUE).
--
-- Eindeutigkeit per UNIQUE NULLS NOT DISTINCT auf (user_id, project_id,
-- mail_type) — Postgres 15+ behandelt NULL-Werte hier wie reguläre Werte,
-- d. h. eine Welcome-Mail (project_id = NULL) wird ebenfalls genau einmal
-- pro user_id eingetragen.

CREATE TABLE public.mail_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id            UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  mail_type             TEXT NOT NULL,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_message_id     TEXT,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mail_log_mail_type_check CHECK (mail_type IN (
    'welcome',
    'invitation',
    'portal_purchase',
    'vapi_package',
    'renewal',
    'reminder_30',
    'reminder_7'
  )),

  -- NULLS NOT DISTINCT: NULL-project_id-Werte gelten gleich → Welcome
  -- (user_id, NULL, 'welcome') bleibt eindeutig pro user.
  CONSTRAINT mail_log_idempotency_uq UNIQUE NULLS NOT DISTINCT (
    user_id, project_id, mail_type
  )
);

COMMENT ON TABLE public.mail_log IS
  'PROJ-11: zentrale Idempotenz für Welcome- und Reminder-Mails. Stripe-Mails brauchen keinen Marker (Webhook ist bereits idempotent).';
COMMENT ON COLUMN public.mail_log.user_id IS 'Empfänger; NULL für Mails ohne User-Bezug.';
COMMENT ON COLUMN public.mail_log.project_id IS 'Zugehöriges Projekt; NULL für Welcome.';
COMMENT ON COLUMN public.mail_log.mail_type IS 'Slug aus check-constraint, z. B. welcome, reminder_30.';
COMMENT ON COLUMN public.mail_log.resend_message_id IS
  'ID aus der Resend-API-Antwort. Nur zu Debugging-Zwecken.';
COMMENT ON COLUMN public.mail_log.error IS
  'Fehlerbeschreibung, falls Versand fehlschlug. Marker bleibt trotzdem stehen → kein automatischer Retry.';

-- Indizes:
--   - (mail_type, sent_at) für schnelle Reminder-Idempotenz-Lookups im Cron
CREATE INDEX idx_mail_log_type_sent_at ON public.mail_log (mail_type, sent_at);

-- RLS-Lockdown: kein User darf direkt schreiben/lesen. Nur Service-Role
-- bekommt Zugriff (Send-Helper + Cron-Route laufen serverseitig).
ALTER TABLE public.mail_log ENABLE ROW LEVEL SECURITY;

-- KEINE Policies für reguläre Rollen → alles Default-DENY für authenticated/anon.
-- Service-Role bypasst RLS ohnehin, braucht keine explizite Policy.
