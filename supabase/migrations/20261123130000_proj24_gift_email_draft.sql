-- PROJ-24 BUG-3: Die E-Mail fuer die Geschenk-Einladung liegt nicht mehr bei
-- Stripe, sondern wie die Erzaehl-Kontakte in der kurzlebigen Kauf-Vorbereitung.
--
-- Eine Zeile kann jetzt drei Dinge enthalten:
--   - nur Erzaehl-Kontakte
--   - nur die Geschenk-Adresse (Weg "Auch am Computer", Erzaehl-Impulse: Nein)
--   - beides
--
-- RLS und Rechte bleiben unveraendert: Browser und angemeldete Nutzer haben
-- keinen Zugriff, nur der Server mit der Service-Role.

ALTER TABLE public.purchase_narration_drafts
  ADD COLUMN gift_recipient_email TEXT,
  ALTER COLUMN narrator_name DROP NOT NULL,
  ALTER COLUMN channel DROP NOT NULL;

ALTER TABLE public.purchase_narration_drafts
  DROP CONSTRAINT purchase_narration_drafts_contact_check;

ALTER TABLE public.purchase_narration_drafts
  ADD CONSTRAINT purchase_narration_drafts_gift_email_check
    CHECK (
      gift_recipient_email IS NULL
      OR char_length(gift_recipient_email) BETWEEN 3 AND 254
    ),
  ADD CONSTRAINT purchase_narration_drafts_contact_check CHECK (
    (
      narrator_name IS NULL
      AND channel IS NULL
      AND email IS NULL
      AND phone IS NULL
      AND NOT uses_checkout_email
      AND gift_recipient_email IS NOT NULL
    )
    OR (
      narrator_name IS NOT NULL
      AND channel IS NOT NULL
      AND (
        (channel = 'sms' AND phone IS NOT NULL AND email IS NULL AND NOT uses_checkout_email)
        OR (
          channel IN ('email', 'both')
          AND (channel = 'both') = (phone IS NOT NULL)
          AND (email IS NOT NULL) <> uses_checkout_email
        )
      )
    )
  );

COMMENT ON COLUMN public.purchase_narration_drafts.gift_recipient_email IS
  'Adresse fuer die Geschenk-Einladung bis zur Erfuellung des Kaufs.';
