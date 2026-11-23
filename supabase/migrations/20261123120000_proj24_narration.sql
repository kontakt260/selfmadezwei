-- PROJ-24: Erzaehl-Einstellungen und kurzlebige Kauf-Vorbereitung.
--
-- narration_settings
--   Eine Zeile pro Projekt, wenn Erzaehl-Impulse gewuenscht sind. Grundlage
--   fuer den Versand aus PROJ-12. Wird mit dem Projekt geloescht.
--
-- purchase_narration_drafts
--   Haelt Kontaktdaten nur, bis ein Kauf erfuellt ist. Stripe bekommt lediglich
--   die zufaellige Kennung, damit die Daten einer dritten Person nicht dauerhaft
--   bei Stripe liegen. Der taegliche Cron loescht alte Zeilen:
--     open             nach 2 Tagen
--     payment_pending  nach 21 Tagen
--     paid             nach 90 Tagen (Kauf ohne Konto, noch nicht eingeloest)
--
-- Beide Tabellen sind fuer Browser und angemeldete Nutzer komplett gesperrt.
-- Nur der Server greift mit der Service-Role darauf zu.

CREATE TABLE public.narration_settings (
  project_id     UUID        PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  narrator_name  TEXT        NOT NULL,
  channel        TEXT        NOT NULL,
  email          TEXT,
  phone          TEXT,
  weekday        SMALLINT    NOT NULL DEFAULT 0,
  rhythm_weeks   SMALLINT    NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT narration_settings_name_check
    CHECK (char_length(btrim(narrator_name)) BETWEEN 1 AND 120),
  CONSTRAINT narration_settings_channel_check
    CHECK (channel IN ('email', 'sms', 'both')),
  CONSTRAINT narration_settings_email_check
    CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT narration_settings_phone_check
    CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT narration_settings_contact_check CHECK (
    (channel = 'email' AND email IS NOT NULL AND phone IS NULL)
    OR (channel = 'sms' AND phone IS NOT NULL AND email IS NULL)
    OR (channel = 'both' AND email IS NOT NULL AND phone IS NOT NULL)
  ),
  CONSTRAINT narration_settings_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT narration_settings_rhythm_check CHECK (rhythm_weeks IN (1, 2))
);

COMMENT ON TABLE public.narration_settings IS
  'PROJ-24: Kontaktweg und Rhythmus der Erzaehl-Impulse pro Projekt. Keine Zeile bedeutet: nicht eingerichtet.';
COMMENT ON COLUMN public.narration_settings.weekday IS
  'Wochentag des Versands, 0 = Sonntag.';
COMMENT ON COLUMN public.narration_settings.rhythm_weeks IS
  'Abstand der Erzaehl-Impulse in Wochen.';

CREATE TRIGGER narration_settings_updated_at
  BEFORE UPDATE ON public.narration_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.purchase_narration_drafts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status               TEXT        NOT NULL DEFAULT 'open',
  narrator_name        TEXT        NOT NULL,
  channel              TEXT        NOT NULL,
  email                TEXT,
  phone                TEXT,
  uses_checkout_email  BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_narration_drafts_status_check
    CHECK (status IN ('open', 'payment_pending', 'paid')),
  CONSTRAINT purchase_narration_drafts_name_check
    CHECK (char_length(btrim(narrator_name)) BETWEEN 1 AND 120),
  CONSTRAINT purchase_narration_drafts_channel_check
    CHECK (channel IN ('email', 'sms', 'both')),
  CONSTRAINT purchase_narration_drafts_email_check
    CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT purchase_narration_drafts_phone_check
    CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT purchase_narration_drafts_contact_check CHECK (
    (channel = 'sms' AND phone IS NOT NULL AND email IS NULL AND NOT uses_checkout_email)
    OR (
      channel IN ('email', 'both')
      AND (channel = 'both') = (phone IS NOT NULL)
      AND (email IS NOT NULL) <> uses_checkout_email
    )
  )
);

COMMENT ON TABLE public.purchase_narration_drafts IS
  'PROJ-24: Kontaktdaten bis zur Erfuellung eines Kaufs. Wird danach oder per Frist im Cron geloescht.';
COMMENT ON COLUMN public.purchase_narration_drafts.uses_checkout_email IS
  'Gast kauft fuer sich selbst: Die E-Mail kommt nach der Zahlung aus dem Stripe-Checkout.';

CREATE INDEX idx_purchase_narration_drafts_cleanup
  ON public.purchase_narration_drafts (status, status_changed_at);

-- RLS-Lockdown: KEINE Policies bedeutet Default-DENY. Die Service-Role umgeht RLS.
ALTER TABLE public.narration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_narration_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.narration_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.purchase_narration_drafts FROM anon, authenticated;
