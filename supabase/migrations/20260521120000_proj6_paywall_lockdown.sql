-- PROJ-6 Paywall-Lockdown (Sicherheits-Blocker aus PROJ-1 BUG-2).
--
-- `projects.portal_access_expires_at` ist heute eine Spalte einer
-- Tabelle, die für project_members UPDATE-bar ist — jeder `co_author`
-- könnte sich via `UPDATE projects SET portal_access_expires_at = …`
-- unbegrenzten Portal-Zugang gewähren. Wir verschieben das Feld in
-- eine SEPARATE Tabelle `project_access`, deren RLS-Policies KEIN
-- INSERT/UPDATE/DELETE für authentifizierte Clients erlauben — nur
-- der Stripe-Webhook (service_role) darf schreiben.
--
-- Schritte:
--   1. CREATE TABLE project_access mit FK ON DELETE CASCADE.
--   2. Bestandsdaten aus projects.portal_access_expires_at migrieren.
--   3. ALTER TABLE projects DROP COLUMN portal_access_expires_at.
--   4. RLS: SELECT-Policy für Projekt-Mitglieder, KEINE Write-Policies.
--   5. Index für die häufige Middleware-Lookup.

CREATE TABLE IF NOT EXISTS public.project_access (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.project_access IS
  'Paywall-State pro Projekt. RLS strikt SELECT-only für Mitglieder. '
  'Nur service_role (Stripe-Webhook) schreibt — kein client-seitiger Bypass möglich.';

-- Bestandsdaten-Migration (idempotent: ON CONFLICT DO NOTHING)
INSERT INTO public.project_access (project_id, expires_at, updated_at)
SELECT id, portal_access_expires_at, NOW()
FROM public.projects
WHERE portal_access_expires_at IS NOT NULL
ON CONFLICT (project_id) DO NOTHING;

-- Source-Spalte entfernen — ab jetzt liest jeder Code-Pfad aus
-- project_access. Achtung: Code muss VOR diesem Schritt aktualisiert
-- werden, sonst Lese-Errors. (Wir deployen die Migration zusammen
-- mit dem Code-Update.)
ALTER TABLE public.projects DROP COLUMN IF EXISTS portal_access_expires_at;

-- RLS aktivieren + nur SELECT-Policy für Mitglieder.
ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_access_select_members"
  ON public.project_access
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_access.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- KEINE INSERT/UPDATE/DELETE-Policy → service_role bypassed RLS,
-- alle anderen Clients bekommen 0 Rows oder Fehler beim Schreibversuch.

-- Index für Middleware-Lookup: `SELECT expires_at FROM project_access
-- WHERE project_id IN (...)`. Primary Key deckt das ab, kein
-- zusätzlicher Index nötig.

-- Trigger: updated_at auto-pflegen bei UPDATEs (Webhook setzt
-- expires_at, updated_at folgt automatisch).
CREATE OR REPLACE FUNCTION public.set_project_access_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_access_updated_at_trigger
  BEFORE UPDATE ON public.project_access
  FOR EACH ROW EXECUTE FUNCTION public.set_project_access_updated_at();
