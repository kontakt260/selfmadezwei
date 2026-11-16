-- PROJ-6 — Kauf ohne Konto (Checkout vor Login/Registrierung)
--
-- purchase_claims: bezahlte Erstkäufe, die noch keinem Konto zugeordnet
-- sind. Der Stripe-Webhook legt die Zeile an, sobald ein Gast (ohne
-- Anmeldung) bezahlt hat. Das Projekt entsteht erst, wenn der Käufer ein
-- Konto hat und den Kauf einlöst.
--
-- Einlösen darf, wer
--   (a) mit der bestätigten E-Mail-Adresse angemeldet ist, die im Checkout
--       angegeben wurde (buyer_email), oder
--   (b) das Einlöse-Geheimnis aus dem Browser vorlegt, in dem gekauft
--       wurde (Cookie). Gespeichert ist nur dessen SHA-256-Hash.
--
-- Alle Prüfungen laufen serverseitig über die Service-Role; die Tabelle
-- ist für anon/authenticated komplett gesperrt (RLS ohne Policies).

CREATE TABLE public.purchase_claims (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id  TEXT        NOT NULL UNIQUE,
  buyer_email        TEXT,
  claim_token_hash   TEXT        NOT NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  amount_cents       INTEGER     NOT NULL,
  currency           TEXT        NOT NULL DEFAULT 'eur',
  paid_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_by         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at         TIMESTAMPTZ,
  project_id         UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.purchase_claims IS
  'PROJ-6: bezahlte Erstkäufe ohne Konto. Webhook legt an, /kauf-einloesen ordnet sie einem Konto zu. Nur service_role.';
COMMENT ON COLUMN public.purchase_claims.buyer_email IS
  'E-Mail aus dem Stripe-Checkout, kleingeschrieben. Einlösen per bestätigter Konto-E-Mail.';
COMMENT ON COLUMN public.purchase_claims.claim_token_hash IS
  'SHA-256 (hex) des Einlöse-Geheimnisses aus dem Käufer-Browser. Das Geheimnis selbst wird nie gespeichert.';
COMMENT ON COLUMN public.purchase_claims.metadata IS
  'Angaben aus dem Kauf-Assistenten (Name, Geschenk-Variante, Empfänger) — Kopie der Stripe-Metadata.';
COMMENT ON COLUMN public.purchase_claims.claimed_at IS
  'NULL = noch nicht eingelöst. Wird beim Einlösen atomar gesetzt (Sperre gegen doppeltes Einlösen).';
COMMENT ON COLUMN public.purchase_claims.project_id IS
  'Projekt, das beim Einlösen entstanden ist.';

-- Offene Käufe per E-Mail bzw. Geheimnis finden (Login, /kauf-einloesen).
CREATE INDEX idx_purchase_claims_open_email
  ON public.purchase_claims (buyer_email)
  WHERE claimed_at IS NULL;
CREATE INDEX idx_purchase_claims_open_token
  ON public.purchase_claims (claim_token_hash)
  WHERE claimed_at IS NULL;
-- Fremdschlüssel-Indizes.
CREATE INDEX idx_purchase_claims_claimed_by ON public.purchase_claims (claimed_by);
CREATE INDEX idx_purchase_claims_project_id ON public.purchase_claims (project_id);

-- RLS-Lockdown: kein direkter Zugriff für anon/authenticated. Die Tabelle
-- enthält Zahlungsbezug und E-Mail-Adressen von Personen ohne Konto.
ALTER TABLE public.purchase_claims ENABLE ROW LEVEL SECURITY;

-- KEINE Policies → Default-DENY. Service-Role umgeht RLS.
