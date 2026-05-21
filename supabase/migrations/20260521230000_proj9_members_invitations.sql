-- ==========================================
-- PROJ-9: Projekt-Mitglieder + Einladungen
-- ==========================================
--
-- 4 Bausteine in einer Migration:
--   A) project_members RLS — komplettes CRUD-Policy-Set
--   B) invitations RLS — Lock-Down auf PL-only + Server-Action-Pfad
--   C) Last-PL-Trigger — DB-seitige Verteidigung gegen 0-PL-Projekte
--   D) lookup_invitation_by_token — SECURITY DEFINER für Accept-Page
--   E) invitations.created_by — Inviter-Tracking für Accept-Vorschau
--   F) pg_cron Retention-Job — 30-Tage-Cleanup abgelaufener Invitations
--
-- Helper-Function:
--   am_i_pl_of(project_id) — SECURITY DEFINER, vermeidet RLS-Rekursion
--                            in Policies, die selbst auf project_members joinen.

-- ──────────────────────────────────────────────────────────────────────
-- E. invitations.created_by — Inviter-Tracking
-- ──────────────────────────────────────────────────────────────────────
-- Spec-AC: Accept-Page zeigt „Name des einladenden Projektleiters".
-- ON DELETE SET NULL: wenn der Inviter seinen Account löscht, bleibt die
-- Einladung gültig (sie ist projekt-, nicht inviter-scoped — Edge-Case 91).

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────
-- Helper-Function: am_i_pl_of(project_id)
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.am_i_pl_of(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role = 'projektleiter'
  );
$func$;

-- Defense-in-Depth: nur authenticated/service_role darf die Function rufen.
REVOKE EXECUTE ON FUNCTION public.am_i_pl_of(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_pl_of(UUID) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- A. project_members — komplettes CRUD-Policy-Set
-- ──────────────────────────────────────────────────────────────────────
-- Alte schmale SELECT-Policy ersetzen.

DROP POLICY IF EXISTS "project_members: select own" ON project_members;
DROP POLICY IF EXISTS "project_members select members" ON project_members;
DROP POLICY IF EXISTS "project_members insert by pl" ON project_members;
DROP POLICY IF EXISTS "project_members update by pl" ON project_members;
DROP POLICY IF EXISTS "project_members delete by pl or self" ON project_members;

-- SELECT: jedes Mitglied eines Projekts sieht alle Mitglieder dieses Projekts.
CREATE POLICY "project_members select members" ON project_members
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT get_my_project_ids()));

-- INSERT: nur PL des jeweiligen Projekts.
CREATE POLICY "project_members insert by pl" ON project_members
  FOR INSERT TO authenticated
  WITH CHECK (am_i_pl_of(project_id));

-- UPDATE: nur PL; Trigger blockt Last-PL-Degrade separat.
CREATE POLICY "project_members update by pl" ON project_members
  FOR UPDATE TO authenticated
  USING (am_i_pl_of(project_id))
  WITH CHECK (am_i_pl_of(project_id));

-- DELETE: PL darf jede Reihe; jeder darf eigene Reihe (Self-Leave).
-- Trigger blockt Last-PL-Delete separat.
CREATE POLICY "project_members delete by pl or self" ON project_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR am_i_pl_of(project_id)
  );

-- ──────────────────────────────────────────────────────────────────────
-- B. invitations — Lock-Down
-- ──────────────────────────────────────────────────────────────────────
-- Alte permissive SELECT-Policy ersetzen.

DROP POLICY IF EXISTS "invitations: select as member or recipient" ON invitations;
DROP POLICY IF EXISTS "invitations select pl" ON invitations;
DROP POLICY IF EXISTS "invitations insert by pl" ON invitations;
DROP POLICY IF EXISTS "invitations update via security_definer" ON invitations;
DROP POLICY IF EXISTS "invitations delete service_role" ON invitations;

-- SELECT: nur PL des Projekts darf invitations sehen (für künftige
-- Pending-Einladungs-UI). Token-Lookup für den Eingeladenen läuft über
-- lookup_invitation_by_token (SECURITY DEFINER, siehe D).
CREATE POLICY "invitations select pl" ON invitations
  FOR SELECT TO authenticated
  USING (am_i_pl_of(project_id));

-- INSERT: nur PL.
CREATE POLICY "invitations insert by pl" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (am_i_pl_of(project_id));

-- UPDATE/DELETE: kein authenticated-Pfad. Service-Role greift weiterhin
-- (umgeht RLS), für accept-Server-Action und Retention-Job.
-- → keine Policy ⇒ jeder authenticated-Versuch wird silent abgelehnt.

-- ──────────────────────────────────────────────────────────────────────
-- C. Last-PL-Trigger
-- ──────────────────────────────────────────────────────────────────────
-- BEFORE DELETE + BEFORE UPDATE auf project_members. Wirft Exception
-- 23514, wenn die Operation das Projekt mit 0 PLs zurücklassen würde.
-- Drei Verteidigungs-Ebenen (UI + Server-Action + Trigger) — Trigger ist
-- der letzte unverhandelbare Stopper.

CREATE OR REPLACE FUNCTION public.enforce_last_projektleiter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  remaining_pl_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'projektleiter' THEN
      RETURN OLD;
    END IF;
    SELECT count(*) INTO remaining_pl_count
    FROM project_members
    WHERE project_id = OLD.project_id
      AND role = 'projektleiter'
      AND id <> OLD.id;
    IF remaining_pl_count = 0 THEN
      RAISE EXCEPTION 'Letzter Projektleiter kann nicht entfernt werden'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'projektleiter' AND NEW.role <> 'projektleiter' THEN
      SELECT count(*) INTO remaining_pl_count
      FROM project_members
      WHERE project_id = OLD.project_id
        AND role = 'projektleiter'
        AND id <> OLD.id;
      IF remaining_pl_count = 0 THEN
        RAISE EXCEPTION 'Letzter Projektleiter kann nicht degradiert werden'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS project_members_enforce_last_pl_del ON project_members;
CREATE TRIGGER project_members_enforce_last_pl_del
  BEFORE DELETE ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_last_projektleiter();

DROP TRIGGER IF EXISTS project_members_enforce_last_pl_upd ON project_members;
CREATE TRIGGER project_members_enforce_last_pl_upd
  BEFORE UPDATE OF role ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_last_projektleiter();

-- ──────────────────────────────────────────────────────────────────────
-- D. lookup_invitation_by_token — Accept-Page-Read
-- ──────────────────────────────────────────────────────────────────────
-- Nicht-Mitglieder haben per RLS keinen Lese-Zugriff auf invitations.
-- Diese SECURITY DEFINER-Funktion ist der einzige Pfad für die Accept-
-- Page, um Token-basiert die Vorschau-Daten zu lesen. Whitelist-Felder:
-- Projektname, Rolle, Inviter-Name, Email, Ablaufdaten — kein Token-
-- Echo, kein Body-Leak.

CREATE OR REPLACE FUNCTION public.lookup_invitation_by_token(p_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  project_id UUID,
  project_title TEXT,
  email TEXT,
  role member_role,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  inviter_full_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
  SELECT
    i.id,
    i.project_id,
    p.title,
    i.email,
    i.role,
    i.expires_at,
    i.accepted_at,
    COALESCE(pr.full_name, '') AS inviter_full_name
  FROM invitations i
  LEFT JOIN projects p  ON p.id = i.project_id
  LEFT JOIN profiles pr ON pr.id = i.created_by
  WHERE i.token = p_token
  LIMIT 1;
$func$;

-- Funktions-Rechte: jeder (auch anon) darf die Lookup aufrufen, denn
-- der Token IST die Authentifizierung. Brute-Force ist bei ≥128 Bit
-- Entropie praktisch ausgeschlossen.
REVOKE EXECUTE ON FUNCTION public.lookup_invitation_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invitation_by_token(TEXT)
  TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- F. pg_cron Retention-Job — DSGVO-konformer 30-Tage-Cleanup
-- ──────────────────────────────────────────────────────────────────────
-- Aktiviert pg_cron (falls noch nicht aktiv) und schedulet einen
-- täglichen Job um 03:00 UTC: löscht alle invitations mit expires_at
-- älter als 30 Tage (= Spec-AC). Service-Role-Pfad, RLS umgangen.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule idempotent erzeugen: erst unschedule (falls Vorgänger), dann neu.
DO $cron$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job
   WHERE jobname = 'invitations-retention-30days';
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'invitations-retention-30days',
    '0 3 * * *',
    'DELETE FROM public.invitations WHERE expires_at < (now() - INTERVAL ''30 days'')'
  );
END
$cron$;
