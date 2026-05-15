-- ==========================================
-- PROJ-1: RLS Policies
-- Enable RLS on all tables + define access policies
-- ==========================================

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_covers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE impulse_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations      ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- PROFILES — self-only read/write
-- ==========================================

CREATE POLICY "profiles: select own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ==========================================
-- PROJECTS — membership-based access
-- get_my_project_ids() avoids RLS recursion on project_members
-- ==========================================

CREATE POLICY "projects: select as member"
  ON projects FOR SELECT
  USING (id IN (SELECT public.get_my_project_ids()));

-- INSERT is allowed for authenticated users; the webhook (service_role)
-- also uses this path but bypasses RLS entirely
CREATE POLICY "projects: insert authenticated"
  ON projects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "projects: update as member"
  ON projects FOR UPDATE
  USING (id IN (SELECT public.get_my_project_ids()));

-- Only projektleiter may delete a project
CREATE POLICY "projects: delete as projektleiter"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid()
        AND project_members.role = 'projektleiter'
    )
  );

-- ==========================================
-- PROJECT_MEMBERS — own rows only (avoids recursion)
-- INSERT/UPDATE/DELETE are service_role only (no client policies)
-- ==========================================

CREATE POLICY "project_members: select own"
  ON project_members FOR SELECT
  USING (user_id = auth.uid());

-- ==========================================
-- CHAPTERS — project membership required
-- ==========================================

CREATE POLICY "chapters: select as member"
  ON chapters FOR SELECT
  USING (project_id IN (SELECT public.get_my_project_ids()));

CREATE POLICY "chapters: insert as member"
  ON chapters FOR INSERT
  WITH CHECK (project_id IN (SELECT public.get_my_project_ids()));

CREATE POLICY "chapters: update as member"
  ON chapters FOR UPDATE
  USING (project_id IN (SELECT public.get_my_project_ids()));

CREATE POLICY "chapters: delete as member"
  ON chapters FOR DELETE
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ==========================================
-- PROJECT_COVERS — project membership required
-- ==========================================

CREATE POLICY "project_covers: select as member"
  ON project_covers FOR SELECT
  USING (project_id IN (SELECT public.get_my_project_ids()));

CREATE POLICY "project_covers: insert as member"
  ON project_covers FOR INSERT
  WITH CHECK (project_id IN (SELECT public.get_my_project_ids()));

CREATE POLICY "project_covers: update as member"
  ON project_covers FOR UPDATE
  USING (project_id IN (SELECT public.get_my_project_ids()));

-- ==========================================
-- IMPULSE_CATALOG — read-only for all authenticated users
-- ==========================================

CREATE POLICY "impulse_catalog: select authenticated"
  ON impulse_catalog FOR SELECT
  USING (auth.role() = 'authenticated');

-- ==========================================
-- PAYMENTS — own rows only; no client writes
-- ==========================================

CREATE POLICY "payments: select own"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- ==========================================
-- VOICE_SESSIONS — own rows only; no client writes
-- ==========================================

CREATE POLICY "voice_sessions: select own"
  ON voice_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- ==========================================
-- INVITATIONS — readable by project members OR the invited email
-- No client INSERT/UPDATE/DELETE: service_role only
-- ==========================================

CREATE POLICY "invitations: select as member or recipient"
  ON invitations FOR SELECT
  USING (
    project_id IN (SELECT public.get_my_project_ids())
    OR auth.jwt()->>'email' = email
  );
