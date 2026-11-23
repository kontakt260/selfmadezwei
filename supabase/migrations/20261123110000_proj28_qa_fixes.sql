-- PROJ-28 QA fixes.
--
-- BUG-1: Members of an expired project could still delete chapters and files
--        through the API. Two additional RESTRICTIVE policies close this.
--        Approved by Jakob on 2026-11-23. No existing policy is changed.
--        Deleting a whole project, leaving and deleting the account stay
--        possible, they do not depend on these two policies.
-- BUG-2: A project that was paid for right after it moved to the trash was
--        still deleted 14 days later. A payment now brings it back, and the
--        purge never removes such a project.
--
-- Production: run AFTER 20261123100000 and BEFORE the code deploy.
-- Running this file moves and deletes nothing.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

-- ---------------------------------------------------------------------------
-- 1. Read-only also means no deleting of content (BUG-1)
-- ---------------------------------------------------------------------------

CREATE POLICY "chapters: delete needs active access"
  ON public.chapters
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (private.project_is_writable(project_id));

CREATE POLICY "project files: delete needs active access"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id NOT IN ('chapter-heroes', 'project-covers', 'project-logos')
    OR private.storage_path_is_writable(name)
  );

-- ---------------------------------------------------------------------------
-- 2. An expired project in the trash that has been paid for (BUG-2)
-- ---------------------------------------------------------------------------

CREATE FUNCTION private.trash_project_was_paid(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.trash_projects AS tp
      JOIN public.project_access AS pa ON pa.project_id = tp.project_id
     WHERE tp.project_id = p_project_id
       AND tp.reason = 'expired'
       AND pa.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION private.trash_project_was_paid(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.trash_project_was_paid(UUID) TO service_role;

-- Called by the payment webhook after the new date is saved.
-- Projects deleted by a person are not brought back: support decides.
CREATE FUNCTION public.retention_restore_paid(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  SELECT tp.reason
    INTO v_reason
    FROM public.trash_projects AS tp
   WHERE tp.project_id = p_project_id
     FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.projects AS pr WHERE pr.id = p_project_id) THEN
      RETURN jsonb_build_object('status', 'not_in_trash');
    END IF;
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  IF v_reason <> 'expired' THEN
    RETURN jsonb_build_object('status', 'deleted_by_customer');
  END IF;

  IF NOT private.trash_project_was_paid(p_project_id) THEN
    RETURN jsonb_build_object('status', 'not_paid');
  END IF;

  BEGIN
    PERFORM public.trash_restore_project(p_project_id);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'lead_required' THEN
      RETURN jsonb_build_object('status', 'lead_required');
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('status', 'restored');
END;
$$;

REVOKE ALL ON FUNCTION public.retention_restore_paid(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retention_restore_paid(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The purge never removes a paid project (BUG-2)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trash_purge_due(p_limit INTEGER DEFAULT 200)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_candidates UUID[];
  v_project_ids UUID[];
  v_chapters INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  SELECT COALESCE(array_agg(due.project_id), '{}')
    INTO v_candidates
    FROM (
      SELECT tp.project_id
        FROM public.trash_projects AS tp
       WHERE tp.purge_at <= now()
         AND NOT private.trash_project_was_paid(tp.project_id)
       ORDER BY tp.purge_at
       LIMIT p_limit
         FOR UPDATE SKIP LOCKED
    ) AS due;

  -- A payment that is being saved right now finishes first and is seen below.
  PERFORM 1
     FROM public.project_access AS pa
    WHERE pa.project_id = ANY(v_candidates)
    ORDER BY pa.project_id
      FOR UPDATE;

  SELECT COALESCE(array_agg(candidate), '{}')
    INTO v_project_ids
    FROM unnest(v_candidates) AS candidate
   WHERE NOT private.trash_project_was_paid(candidate);

  IF cardinality(v_project_ids) > 0 THEN
    INSERT INTO public.storage_cleanup_queue (project_id)
    SELECT unnest(v_project_ids)
    ON CONFLICT (project_id) DO NOTHING;

    DELETE FROM public.projects AS pr
     WHERE pr.id = ANY(v_project_ids);
  END IF;

  WITH due AS (
    SELECT tc.chapter_id
      FROM public.trash_chapters AS tc
     WHERE tc.purge_at <= now()
     ORDER BY tc.purge_at
     LIMIT p_limit
       FOR UPDATE SKIP LOCKED
  ),
  removed AS (
    DELETE FROM public.trash_chapters AS tc
     USING due
     WHERE tc.chapter_id = due.chapter_id
    RETURNING tc.chapter_id, tc.project_id
  ),
  queued AS (
    INSERT INTO public.storage_chapter_cleanup_queue (chapter_id, project_id)
    SELECT removed.chapter_id, removed.project_id FROM removed
    ON CONFLICT (chapter_id) DO NOTHING
  )
  SELECT count(*)::INTEGER INTO v_chapters FROM removed;

  RETURN jsonb_build_object(
    'projects', cardinality(v_project_ids),
    'chapters', v_chapters
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trash_purge_due(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_purge_due(INTEGER) TO service_role;
