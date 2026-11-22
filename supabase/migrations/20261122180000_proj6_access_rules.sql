-- PROJ-6 G6, G14, G15: the database enforces what the app already promises.
--
-- G6:  Members of an expired project could keep writing through the API.
--      Additional RESTRICTIVE policies make an expired project read-only for
--      customers. Reading, deleting, leaving and renewing stay possible.
-- G14: Every account could create projects, also with somebody else as owner.
--      Projects are only created by the server after a payment.
-- G15: A project lead could add any person without an invitation.
--      Members only join through the server (invitation or purchase).
--
-- The app does not use the two removed policies. The service role is not
-- affected by any of this, so purchases, renewals and invitations keep working.
--
-- The SQL editor warns because of DROP POLICY. No data is deleted.
-- Production: run AFTER 20261122170000. Works with the current app code.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

-- ---------------------------------------------------------------------------
-- 1. Is the project still open for changes?
-- ---------------------------------------------------------------------------
--
-- Same rule as isAccessExpired() in the app: no date means not expired.

CREATE FUNCTION private.project_is_writable(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.project_access AS pa
     WHERE pa.project_id = p_project_id
       AND pa.expires_at < now()
  );
$$;

REVOKE ALL ON FUNCTION private.project_is_writable(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_is_writable(UUID) TO authenticated;

-- File paths start with the project id. Other paths are left to the existing
-- policies, which reject them.
CREATE FUNCTION private.storage_path_is_writable(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.project_is_writable(split_part(p_name, '/', 1)::uuid)
    ELSE true
  END;
$$;

REVOKE ALL ON FUNCTION private.storage_path_is_writable(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.storage_path_is_writable(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Expired projects are read-only for customers (G6)
-- ---------------------------------------------------------------------------

CREATE POLICY "chapters: insert needs active access"
  ON public.chapters
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (private.project_is_writable(project_id));

CREATE POLICY "chapters: update needs active access"
  ON public.chapters
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (private.project_is_writable(project_id))
  WITH CHECK (private.project_is_writable(project_id));

CREATE POLICY "projects: update needs active access"
  ON public.projects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (private.project_is_writable(id))
  WITH CHECK (private.project_is_writable(id));

CREATE POLICY "project_covers: insert needs active access"
  ON public.project_covers
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (private.project_is_writable(project_id));

CREATE POLICY "project_covers: update needs active access"
  ON public.project_covers
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (private.project_is_writable(project_id))
  WITH CHECK (private.project_is_writable(project_id));

CREATE POLICY "invitations: insert needs active access"
  ON public.invitations
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (private.project_is_writable(project_id));

CREATE POLICY "project files: upload needs active access"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('chapter-heroes', 'project-covers', 'project-logos')
    OR private.storage_path_is_writable(name)
  );

CREATE POLICY "project files: update needs active access"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id NOT IN ('chapter-heroes', 'project-covers', 'project-logos')
    OR private.storage_path_is_writable(name)
  )
  WITH CHECK (
    bucket_id NOT IN ('chapter-heroes', 'project-covers', 'project-logos')
    OR private.storage_path_is_writable(name)
  );

-- ---------------------------------------------------------------------------
-- 3. Projects and memberships only come from the server (G14, G15)
-- ---------------------------------------------------------------------------

DROP POLICY "projects: insert authenticated" ON public.projects;
DROP POLICY "project_members insert by pl" ON public.project_members;
