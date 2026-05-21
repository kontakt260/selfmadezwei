-- ==========================================
-- Cross-PROJ Hotfix — Cross-Member-Sichtbarkeit
-- ==========================================
--
-- Anlass: Bug-Reports nach PROJ-9-Roll-out.
--
-- 1. „Anonym"-Bug: PL sah Co-Author's full_name/email nicht, weil die
--    profiles-SELECT-Policy nur das eigene Profil zuließ. → Co-Members
--    eines gemeinsamen Projekts dürfen sich gegenseitig profile lesen.
--
-- 2. Paywall-Stats für alle Mitglieder: Co-Authors konnten in der
--    Projektübersicht weder die Telefonzeit noch das Ablaufdatum sehen,
--    weil payments + voice_sessions auf eigene Reihen begrenzt waren.
--    User-Story: „muss jedem im Projekt angezeigt werden". → Mitglieder
--    eines Projekts sehen ALLE payments + voice_sessions dieses Projekts.
--
-- Helper-Function `is_member_of(project_id)` analog zu `am_i_pl_of`,
-- SECURITY DEFINER, vermeidet RLS-Rekursion.

CREATE OR REPLACE FUNCTION public.is_member_of(p_project_id UUID)
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
  );
$func$;

REVOKE EXECUTE ON FUNCTION public.is_member_of(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of(UUID) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- profiles — Co-Members sichtbar
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles: select own" ON profiles;
DROP POLICY IF EXISTS "profiles: select co-members" ON profiles;

CREATE POLICY "profiles: select co-members" ON profiles
  FOR SELECT TO authenticated
  USING (
    -- Eigene Profil-Reihe immer sichtbar
    auth.uid() = id
    OR
    -- ODER: User ist mit profiles.id in mindestens einem gemeinsamen Projekt
    EXISTS (
      SELECT 1
      FROM project_members pm_self
      JOIN project_members pm_other ON pm_self.project_id = pm_other.project_id
      WHERE pm_self.user_id = auth.uid()
        AND pm_other.user_id = profiles.id
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- payments — Mitglieder sehen alle payments des Projekts
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payments: select own" ON payments;
DROP POLICY IF EXISTS "payments select project members" ON payments;

CREATE POLICY "payments select project members" ON payments
  FOR SELECT TO authenticated
  USING (
    -- Eigene payment-Reihen (z. B. payments ohne project_id, Edge-Case)
    user_id = auth.uid()
    OR
    -- ODER: Mitglied des Projekts, zu dem die payment gehört
    (project_id IS NOT NULL AND is_member_of(project_id))
  );

-- ──────────────────────────────────────────────────────────────────────
-- voice_sessions — Mitglieder sehen alle voice_sessions des Projekts
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "voice_sessions: select own" ON voice_sessions;
DROP POLICY IF EXISTS "voice_sessions select project members" ON voice_sessions;

CREATE POLICY "voice_sessions select project members" ON voice_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR
    (project_id IS NOT NULL AND is_member_of(project_id))
  );
