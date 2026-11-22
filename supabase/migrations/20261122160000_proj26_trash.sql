-- PROJ-26: server side trash for chapters and projects.
--
-- Rules (features/PROJ-26-papierkorb.md):
--   * Whatever a customer deletes stays on the server for 14 days.
--   * Customers can neither see, restore nor finally delete it.
--   * Restoring and early final deletion happen through support only.
--   * Deletions by the server are real: account deletion, final deletion and
--     the cleanup after a failed purchase.
--
-- How it works:
--   * A deleted chapter is copied to trash_chapters, then removed as before.
--   * A deleted project stays in place. Its members move to
--     trash_project_members. All RLS policies depend on membership, so nobody
--     can reach the project, its chapters or its files anymore.
--   * Files of a deleted chapter stay in place and are blocked by one
--     additional RESTRICTIVE policy. No existing policy is changed or loosened.
--
-- Production: run AFTER 20261122150000 and BEFORE the code deploy.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

-- ---------------------------------------------------------------------------
-- 1. Schema for helpers that must not be callable through the API
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables. RLS is on and there are no policies: service role only.
-- ---------------------------------------------------------------------------

CREATE TABLE public.trash_projects (
  project_id  UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  deleted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  purge_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);

COMMENT ON TABLE public.trash_projects IS
  'PROJ-26: deleted projects. The project itself stays in place until purge_at. Service role only.';

CREATE TABLE public.trash_project_members (
  project_id    UUID NOT NULL REFERENCES public.trash_projects(project_id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          public.member_role NOT NULL,
  member_since  TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (project_id, user_id)
);

COMMENT ON TABLE public.trash_project_members IS
  'PROJ-26: members of a deleted project. Rows disappear with the account. Service role only.';

CREATE TABLE public.trash_chapters (
  chapter_id    UUID PRIMARY KEY,
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  snapshot      JSONB NOT NULL,
  contributors  JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  purge_at      TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);

COMMENT ON TABLE public.trash_chapters IS
  'PROJ-26: full copies of deleted chapters until purge_at. Service role only.';

CREATE TABLE public.storage_chapter_cleanup_queue (
  chapter_id  UUID PRIMARY KEY,
  project_id  UUID NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT storage_chapter_cleanup_queue_attempts_check CHECK (attempts >= 0)
);

COMMENT ON TABLE public.storage_chapter_cleanup_queue IS
  'PROJ-26: finally deleted chapters whose files are not removed yet. No personal data. Service role only.';

CREATE INDEX idx_trash_projects_purge_at ON public.trash_projects (purge_at);
CREATE INDEX idx_trash_projects_deleted_by ON public.trash_projects (deleted_by);
CREATE INDEX idx_trash_project_members_user ON public.trash_project_members (user_id);
CREATE INDEX idx_trash_chapters_purge_at ON public.trash_chapters (purge_at);
CREATE INDEX idx_trash_chapters_project ON public.trash_chapters (project_id);
CREATE INDEX idx_trash_chapters_deleted_by ON public.trash_chapters (deleted_by);

ALTER TABLE public.trash_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_chapter_cleanup_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.trash_projects,
  public.trash_project_members,
  public.trash_chapters,
  public.storage_chapter_cleanup_queue
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.trash_projects,
  public.trash_project_members,
  public.trash_chapters,
  public.storage_chapter_cleanup_queue
TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Who is calling
-- ---------------------------------------------------------------------------
--
-- The role setting keeps the role of the request inside SECURITY DEFINER
-- functions, while current_user changes to the function owner.

CREATE FUNCTION private.is_customer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(current_setting('role', true), '') IN ('anon', 'authenticated');
$$;

REVOKE ALL ON FUNCTION private.is_customer() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deleting a chapter
-- ---------------------------------------------------------------------------

CREATE FUNCTION private.move_chapter_to_trash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_by UUID;
BEGIN
  IF NOT private.is_customer() THEN
    RETURN OLD;
  END IF;

  SELECT pf.id INTO v_deleted_by
    FROM public.profiles AS pf
   WHERE pf.id = auth.uid();

  INSERT INTO public.trash_chapters (
    chapter_id, project_id, title, snapshot, contributors, deleted_by
  )
  VALUES (
    OLD.id,
    OLD.project_id,
    OLD.title,
    to_jsonb(OLD),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', cc.user_id,
               'first_contributed_at', cc.first_contributed_at
             ))
        FROM public.chapter_contributors AS cc
       WHERE cc.chapter_id = OLD.id
    ), '[]'::jsonb),
    v_deleted_by
  )
  ON CONFLICT (chapter_id) DO NOTHING;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.move_chapter_to_trash() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER chapters_move_to_trash
  BEFORE DELETE ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION private.move_chapter_to_trash();

-- A customer must not take over the id of a deleted chapter and must not move
-- a chapter into another project.
CREATE FUNCTION private.guard_chapter_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_customer() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM public.trash_chapters AS tc WHERE tc.chapter_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'chapter id is not available' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id THEN
    RAISE EXCEPTION 'a chapter cannot change its id or project' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_chapter_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER chapters_guard_identity
  BEFORE INSERT OR UPDATE OF id, project_id ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_chapter_identity();

-- ---------------------------------------------------------------------------
-- 5. Files of deleted chapters
-- ---------------------------------------------------------------------------

CREATE FUNCTION private.chapter_file_in_trash(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.trash_chapters AS tc
     WHERE tc.chapter_id::text = lower(split_part(p_name, '/', 2))
  );
$$;

REVOKE ALL ON FUNCTION private.chapter_file_in_trash(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.chapter_file_in_trash(TEXT) TO authenticated;

CREATE POLICY "chapter-heroes: blocked while chapter is deleted"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (bucket_id <> 'chapter-heroes' OR NOT private.chapter_file_in_trash(name))
  WITH CHECK (bucket_id <> 'chapter-heroes' OR NOT private.chapter_file_in_trash(name));

-- ---------------------------------------------------------------------------
-- 6. Deleting a project
-- ---------------------------------------------------------------------------

CREATE FUNCTION private.move_project_to_trash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_by UUID;
BEGIN
  IF NOT private.is_customer() THEN
    RETURN OLD;
  END IF;

  SELECT pf.id INTO v_deleted_by
    FROM public.profiles AS pf
   WHERE pf.id = auth.uid();

  INSERT INTO public.trash_projects (project_id, deleted_by)
  VALUES (OLD.id, v_deleted_by)
  ON CONFLICT (project_id) DO NOTHING;

  INSERT INTO public.trash_project_members (project_id, user_id, role, member_since)
  SELECT pm.project_id, pm.user_id, pm.role, pm.created_at
    FROM public.project_members AS pm
   WHERE pm.project_id = OLD.id
  ON CONFLICT (project_id, user_id) DO NOTHING;

  DELETE FROM public.project_members AS pm
   WHERE pm.project_id = OLD.id;

  -- Cancels the real delete. The caller sees a normal result without an error.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.move_project_to_trash() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER projects_move_to_trash
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION private.move_project_to_trash();

-- Nobody joins a deleted project, not even through the server (invitations).
-- The lock waits for a delete that is still running on the same project.
CREATE FUNCTION private.block_member_of_deleted_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
     FROM public.projects AS pr
    WHERE pr.id = NEW.project_id
      FOR KEY SHARE;

  IF EXISTS (
    SELECT 1 FROM public.trash_projects AS tp WHERE tp.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'project_in_trash' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.block_member_of_deleted_project() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER project_members_block_deleted_project
  BEFORE INSERT ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION private.block_member_of_deleted_project();

-- The protection of the last project lead must let the move to the trash pass.
CREATE OR REPLACE FUNCTION public.enforce_last_projektleiter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  remaining_pl_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
      RETURN OLD;
    END IF;

    IF EXISTS (SELECT 1 FROM trash_projects WHERE project_id = OLD.project_id) THEN
      RETURN OLD;
    END IF;

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
$$;

-- Invitations to a deleted project behave like invalid links.
CREATE OR REPLACE FUNCTION public.lookup_invitation_by_token(p_token text)
RETURNS TABLE(
  invitation_id uuid,
  project_id uuid,
  project_title text,
  email text,
  role member_role,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  inviter_full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    AND NOT EXISTS (
      SELECT 1 FROM trash_projects AS tp WHERE tp.project_id = i.project_id
    )
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. Account deletion
-- ---------------------------------------------------------------------------
--
-- Deleted projects have no members in project_members anymore. Without this
-- change the plan would take a shared deleted project for a solo project.

CREATE OR REPLACE FUNCTION public.account_deletion_plan(p_user_id UUID, p_email TEXT)
RETURNS TABLE (
  project_id       UUID,
  title            TEXT,
  my_role          public.member_role,
  is_owner         BOOLEAN,
  other_members    INTEGER,
  other_leads      INTEGER,
  has_open_gift    BOOLEAN,
  will_delete      BOOLEAN,
  needs_successor  BOOLEAN,
  waits_for_gift   BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT pm.project_id AS id, pm.role
      FROM public.project_members AS pm
     WHERE pm.user_id = p_user_id
    UNION ALL
    SELECT pr.id, NULL::public.member_role
      FROM public.projects AS pr
     WHERE pr.owner_id = p_user_id
       AND NOT EXISTS (
         SELECT 1
           FROM public.project_members AS pm
          WHERE pm.project_id = pr.id
            AND pm.user_id = p_user_id
       )
  ),
  facts AS (
    SELECT
      mine.id,
      pr.title AS project_title,
      mine.role AS role_of_user,
      COALESCE(pr.owner_id = p_user_id, false) AS owned,
      (SELECT count(*)::INTEGER
         FROM public.project_members AS pm
        WHERE pm.project_id = mine.id
          AND pm.user_id <> p_user_id) AS others,
      (SELECT count(*)::INTEGER
         FROM public.project_members AS pm
        WHERE pm.project_id = mine.id
          AND pm.user_id <> p_user_id
          AND pm.role = 'projektleiter') AS leads,
      EXISTS (
        SELECT 1
          FROM public.invitations AS inv
         WHERE inv.project_id = mine.id
           AND inv.is_gift
           AND inv.accepted_at IS NULL
           AND inv.expires_at > now()
           AND lower(inv.email) <> lower(COALESCE(p_email, ''))
      ) AS open_gift
    FROM mine
    JOIN public.projects AS pr ON pr.id = mine.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.trash_projects AS tp WHERE tp.project_id = mine.id
    )
  )
  SELECT
    f.id,
    f.project_title,
    f.role_of_user,
    f.owned,
    f.others,
    f.leads,
    f.open_gift,
    (f.others = 0 AND NOT f.open_gift),
    COALESCE(f.role_of_user = 'projektleiter' AND f.others > 0 AND f.leads = 0, false),
    COALESCE(f.role_of_user = 'projektleiter' AND f.others = 0 AND f.open_gift, false)
  FROM facts AS f;
$$;

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(
  p_user_id UUID,
  p_email TEXT,
  p_confirmed_delete UUID[],
  p_successors JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_delete_ids UUID[] := '{}';
  v_trash_ids UUID[] := '{}';
  v_handovers JSONB := '[]'::jsonb;
  v_successor UUID;
  v_new_owner UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  -- Locks stop people from joining or leaving these projects meanwhile.
  PERFORM 1
     FROM public.projects AS pr
    WHERE pr.owner_id = p_user_id
       OR pr.id IN (
         SELECT pm.project_id
           FROM public.project_members AS pm
          WHERE pm.user_id = p_user_id
       )
       OR pr.id IN (
         SELECT tm.project_id
           FROM public.trash_project_members AS tm
          WHERE tm.user_id = p_user_id
       )
    ORDER BY pr.id
      FOR UPDATE;

  PERFORM 1
     FROM public.project_members AS pm
    WHERE pm.project_id IN (
      SELECT plan.project_id
        FROM public.account_deletion_plan(p_user_id, p_email) AS plan
    )
    ORDER BY pm.id
      FOR UPDATE;

  FOR v_row IN
    SELECT * FROM public.account_deletion_plan(p_user_id, p_email)
  LOOP
    IF v_row.will_delete THEN
      IF NOT COALESCE(v_row.project_id = ANY(p_confirmed_delete), false) THEN
        RAISE EXCEPTION 'overview_changed';
      END IF;
      v_delete_ids := array_append(v_delete_ids, v_row.project_id);
      CONTINUE;
    END IF;

    v_successor := NULL;

    IF v_row.needs_successor THEN
      v_successor := (p_successors ->> v_row.project_id::text)::uuid;

      IF v_successor IS NULL
         OR v_successor = p_user_id
         OR NOT EXISTS (
           SELECT 1
             FROM public.project_members AS pm
            WHERE pm.project_id = v_row.project_id
              AND pm.user_id = v_successor
         )
      THEN
        RAISE EXCEPTION 'successor_required';
      END IF;

      UPDATE public.project_members AS pm
         SET role = 'projektleiter'
       WHERE pm.project_id = v_row.project_id
         AND pm.user_id = v_successor;

      v_handovers := v_handovers || jsonb_build_array(
        public.project_handover_details(v_row.project_id, v_row.title, v_successor)
      );
    END IF;

    -- Nobody else is in the project yet, but a paid gift waits to be accepted:
    -- the recipient becomes project lead, so the membership can end.
    IF v_row.waits_for_gift THEN
      UPDATE public.invitations AS inv
         SET role = 'projektleiter'
       WHERE inv.project_id = v_row.project_id
         AND inv.is_gift
         AND inv.accepted_at IS NULL
         AND inv.expires_at > now()
         AND lower(inv.email) <> lower(COALESCE(p_email, ''));

      UPDATE public.project_members AS pm
         SET role = 'co_author'
       WHERE pm.project_id = v_row.project_id
         AND pm.user_id = p_user_id;
    END IF;

    IF v_row.is_owner THEN
      v_new_owner := v_successor;

      IF v_new_owner IS NULL THEN
        SELECT pm.user_id
          INTO v_new_owner
          FROM public.project_members AS pm
         WHERE pm.project_id = v_row.project_id
           AND pm.user_id <> p_user_id
           AND pm.role = 'projektleiter'
         ORDER BY pm.created_at, pm.id
         LIMIT 1;
      END IF;

      UPDATE public.projects AS pr
         SET owner_id = v_new_owner
       WHERE pr.id = v_row.project_id;
    END IF;
  END LOOP;

  -- PROJ-26: deleted projects with nobody else in them go with the account.
  -- Deleted projects other people belong to stay until their date.
  SELECT COALESCE(array_agg(tm.project_id ORDER BY tm.project_id), '{}')
    INTO v_trash_ids
    FROM public.trash_project_members AS tm
   WHERE tm.user_id = p_user_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.trash_project_members AS other
        WHERE other.project_id = tm.project_id
          AND other.user_id <> p_user_id
     );

  v_delete_ids := v_delete_ids || v_trash_ids;

  IF cardinality(v_delete_ids) > 0 THEN
    INSERT INTO public.storage_cleanup_queue (project_id)
    SELECT unnest(v_delete_ids)
    ON CONFLICT (project_id) DO NOTHING;

    DELETE FROM public.projects AS pr
     WHERE pr.id = ANY(v_delete_ids);
  END IF;

  -- Redeemed purchases no longer need the buyer's details. Open purchases stay,
  -- otherwise a paid purchase could never be redeemed.
  UPDATE public.purchase_claims AS pc
     SET buyer_email = NULL,
         metadata = '{}'::jsonb
   WHERE pc.claimed_by = p_user_id
     AND pc.claimed_at IS NOT NULL;

  -- Invitations to this address. An open gift stays valid, it was paid for.
  IF COALESCE(p_email, '') <> '' THEN
    DELETE FROM public.invitations AS inv
     WHERE lower(inv.email) = lower(p_email)
       AND (inv.accepted_at IS NOT NULL OR NOT inv.is_gift);
  END IF;

  RETURN jsonb_build_object(
    'deletedProjectIds', to_jsonb(v_delete_ids),
    'handovers', v_handovers
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Final deletion (daily cron)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.trash_purge_due(p_limit INTEGER DEFAULT 200)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_project_ids UUID[];
  v_chapters INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  SELECT COALESCE(array_agg(due.project_id), '{}')
    INTO v_project_ids
    FROM (
      SELECT tp.project_id
        FROM public.trash_projects AS tp
       WHERE tp.purge_at <= now()
       ORDER BY tp.purge_at
       LIMIT p_limit
         FOR UPDATE SKIP LOCKED
    ) AS due;

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

-- ---------------------------------------------------------------------------
-- 9. Support (SQL editor, see docs/production/support-papierkorb.md)
-- ---------------------------------------------------------------------------

-- Never returns the text of a chapter.
CREATE FUNCTION public.trash_find(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  item_type         TEXT,
  item_id           UUID,
  project_id        UUID,
  title             TEXT,
  project_title     TEXT,
  deleted_at        TIMESTAMPTZ,
  purge_at          TIMESTAMPTZ,
  deleted_by_email  TEXT,
  member_emails     TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH items AS (
    SELECT 'project'::text AS kind, tp.project_id AS id, tp.project_id AS pid,
           pr.title AS item_title, pr.title AS proj_title,
           tp.deleted_at AS del_at, tp.purge_at AS pur_at, tp.deleted_by AS del_by
      FROM public.trash_projects AS tp
      JOIN public.projects AS pr ON pr.id = tp.project_id
    UNION ALL
    SELECT 'chapter'::text, tc.chapter_id, tc.project_id,
           tc.title, pr.title,
           tc.deleted_at, tc.purge_at, tc.deleted_by
      FROM public.trash_chapters AS tc
      JOIN public.projects AS pr ON pr.id = tc.project_id
  ),
  people AS (
    SELECT
      i.*,
      deleter.email AS del_email,
      (
        SELECT string_agg(DISTINCT pf.email, ', ')
          FROM (
            SELECT pm.user_id FROM public.project_members AS pm WHERE pm.project_id = i.pid
            UNION
            SELECT tm.user_id FROM public.trash_project_members AS tm WHERE tm.project_id = i.pid
          ) AS m
          JOIN public.profiles AS pf ON pf.id = m.user_id
      ) AS emails
    FROM items AS i
    LEFT JOIN public.profiles AS deleter ON deleter.id = i.del_by
  )
  SELECT p.kind, p.id, p.pid, p.item_title, p.proj_title,
         p.del_at, p.pur_at, p.del_email, p.emails
    FROM people AS p
   WHERE COALESCE(btrim(p_search), '') = ''
      OR strpos(
           lower(concat_ws(' ', p.item_title, p.proj_title, p.emails, p.del_email)),
           lower(btrim(p_search))
         ) > 0
   ORDER BY p.del_at DESC
   LIMIT 100;
$$;

CREATE FUNCTION public.trash_restore_chapter(p_chapter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_entry public.trash_chapters;
  v_chapter public.chapters;
  v_moved_to_end BOOLEAN := false;
BEGIN
  SELECT * INTO v_entry
    FROM public.trash_chapters AS tc
   WHERE tc.chapter_id = p_chapter_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_trash';
  END IF;

  PERFORM 1
     FROM public.projects AS pr
    WHERE pr.id = v_entry.project_id
      FOR KEY SHARE;

  IF EXISTS (
    SELECT 1 FROM public.trash_projects AS tp WHERE tp.project_id = v_entry.project_id
  ) THEN
    RAISE EXCEPTION 'project_in_trash';
  END IF;

  v_chapter := jsonb_populate_record(NULL::public.chapters, v_entry.snapshot);

  IF v_chapter.source_impulse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.impulse_catalog AS ic WHERE ic.id = v_chapter.source_impulse_id
  ) THEN
    v_chapter.source_impulse_id := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.chapters AS c
     WHERE c.project_id = v_chapter.project_id
       AND c.sort_order = v_chapter.sort_order
  ) THEN
    SELECT COALESCE(max(c.sort_order), -1) + 1
      INTO v_chapter.sort_order
      FROM public.chapters AS c
     WHERE c.project_id = v_chapter.project_id;
    v_moved_to_end := true;
  END IF;

  INSERT INTO public.chapters SELECT (v_chapter).*;

  INSERT INTO public.chapter_contributors (chapter_id, user_id, first_contributed_at)
  SELECT p_chapter_id,
         (person ->> 'user_id')::uuid,
         (person ->> 'first_contributed_at')::timestamptz
    FROM jsonb_array_elements(v_entry.contributors) AS person
   WHERE EXISTS (
     SELECT 1 FROM public.profiles AS pf WHERE pf.id = (person ->> 'user_id')::uuid
   )
  ON CONFLICT (chapter_id, user_id) DO NOTHING;

  DELETE FROM public.trash_chapters AS tc
   WHERE tc.chapter_id = p_chapter_id;

  RETURN jsonb_build_object(
    'chapterId', p_chapter_id,
    'projectId', v_entry.project_id,
    'title', v_entry.title,
    'movedToEnd', v_moved_to_end
  );
END;
$$;

CREATE FUNCTION public.trash_restore_project(p_project_id UUID, p_new_lead UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_members JSONB;
  v_first_lead UUID;
  v_count INTEGER;
BEGIN
  PERFORM 1
     FROM public.trash_projects AS tp
    WHERE tp.project_id = p_project_id
      FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_trash';
  END IF;

  IF p_new_lead IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.trash_project_members AS tm
     WHERE tm.project_id = p_project_id
       AND tm.user_id = p_new_lead
  ) THEN
    RAISE EXCEPTION 'lead_not_member';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', tm.user_id,
           'role', CASE WHEN tm.user_id = p_new_lead THEN 'projektleiter' ELSE tm.role::text END,
           'member_since', tm.member_since
         ) ORDER BY tm.member_since, tm.user_id), '[]'::jsonb),
         count(*)::INTEGER
    INTO v_members, v_count
    FROM public.trash_project_members AS tm
   WHERE tm.project_id = p_project_id;

  SELECT (person ->> 'user_id')::uuid
    INTO v_first_lead
    FROM jsonb_array_elements(v_members) AS person
   WHERE person ->> 'role' = 'projektleiter'
   LIMIT 1;

  IF v_first_lead IS NULL THEN
    RAISE EXCEPTION 'lead_required';
  END IF;

  -- First remove the trash entry, otherwise the new members would be refused.
  DELETE FROM public.trash_projects AS tp
   WHERE tp.project_id = p_project_id;

  INSERT INTO public.project_members (project_id, user_id, role, created_at)
  SELECT p_project_id,
         (person ->> 'user_id')::uuid,
         (person ->> 'role')::public.member_role,
         (person ->> 'member_since')::timestamptz
    FROM jsonb_array_elements(v_members) AS person;

  UPDATE public.projects AS pr
     SET owner_id = v_first_lead
   WHERE pr.id = p_project_id
     AND pr.owner_id IS NULL;

  RETURN jsonb_build_object('projectId', p_project_id, 'members', v_count);
END;
$$;

-- Files are removed by the next cron run.
CREATE FUNCTION public.trash_delete_chapter_now(p_chapter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  DELETE FROM public.trash_chapters AS tc
   WHERE tc.chapter_id = p_chapter_id
  RETURNING tc.project_id INTO v_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_trash';
  END IF;

  INSERT INTO public.storage_chapter_cleanup_queue (chapter_id, project_id)
  VALUES (p_chapter_id, v_project_id)
  ON CONFLICT (chapter_id) DO NOTHING;

  RETURN jsonb_build_object('chapterId', p_chapter_id, 'deleted', true);
END;
$$;

CREATE FUNCTION public.trash_delete_project_now(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
     FROM public.trash_projects AS tp
    WHERE tp.project_id = p_project_id
      FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_trash';
  END IF;

  INSERT INTO public.storage_cleanup_queue (project_id)
  VALUES (p_project_id)
  ON CONFLICT (project_id) DO NOTHING;

  DELETE FROM public.projects AS pr
   WHERE pr.id = p_project_id;

  RETURN jsonb_build_object('projectId', p_project_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.trash_purge_due(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_find(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_restore_chapter(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_restore_project(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_delete_chapter_now(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_delete_project_now(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.trash_purge_due(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_find(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_restore_chapter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_restore_project(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_delete_chapter_now(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_delete_project_now(UUID) TO service_role;
