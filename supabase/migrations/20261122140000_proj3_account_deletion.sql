-- PROJ-3: server side flow for deleting an account and for leaving a project.
--
-- Rules (features/PROJ-3-persoenlicher-bereich-konto.md):
--   * Deleting an account is always possible.
--   * A project other people work in is never deleted with an account.
--   * Projects with nobody else in them are deleted after the person saw them.
--   * The only project lead picks a successor among the co-authors.
--
-- Access: service role only. RLS is on for the new tables and they have no
-- policies. Existing RLS policies are not changed.
-- Production: run BEFORE the code deploy. Without these functions the new code
-- refuses to delete an account and nothing is lost.
-- Requires 20261122130000_proj3_project_survives_account_delete.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

-- ---------------------------------------------------------------------------
-- 1. Who wrote in a chapter (for support requests only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.chapter_contributors (
  chapter_id            UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_contributed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chapter_id, user_id)
);

COMMENT ON TABLE public.chapter_contributors IS
  'PROJ-3: who changed the content of a chapter. Support only, members can neither read nor change it. Rows disappear with the account.';

CREATE INDEX idx_chapter_contributors_user
  ON public.chapter_contributors (user_id);

ALTER TABLE public.chapter_contributors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chapter_contributors FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chapter_contributors TO service_role;

-- Must never block saving a chapter, so every error only logs a warning.
CREATE FUNCTION public.record_chapter_contributor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.chapter_contributors (chapter_id, user_id)
    SELECT NEW.id, v_user_id
     WHERE EXISTS (SELECT 1 FROM public.profiles AS pf WHERE pf.id = v_user_id)
    ON CONFLICT (chapter_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'chapter contributor not recorded: %', SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_chapter_contributor() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER chapters_record_contributor_insert
  AFTER INSERT ON public.chapters
  FOR EACH ROW
  WHEN (NEW.body IS NOT NULL)
  EXECUTE FUNCTION public.record_chapter_contributor();

CREATE TRIGGER chapters_record_contributor_update
  AFTER UPDATE ON public.chapters
  FOR EACH ROW
  WHEN (OLD.body IS DISTINCT FROM NEW.body OR OLD.image_sections IS DISTINCT FROM NEW.image_sections)
  EXECUTE FUNCTION public.record_chapter_contributor();

-- ---------------------------------------------------------------------------
-- 2. Files of deleted projects that still have to be removed from storage
-- ---------------------------------------------------------------------------

CREATE TABLE public.storage_cleanup_queue (
  project_id  UUID PRIMARY KEY,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT storage_cleanup_queue_attempts_check CHECK (attempts >= 0)
);

COMMENT ON TABLE public.storage_cleanup_queue IS
  'PROJ-3: deleted projects whose files are not removed yet. Retried by the daily cron. No personal data. Service role only.';

ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storage_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_cleanup_queue TO service_role;

-- ---------------------------------------------------------------------------
-- 3. New mail kind: "you lead this project now"
-- ---------------------------------------------------------------------------

ALTER TABLE public.mail_retry_queue
  DROP CONSTRAINT mail_retry_queue_kind_check,
  ADD CONSTRAINT mail_retry_queue_kind_check CHECK (kind IN (
    'invitation',
    'portal_purchase',
    'guest_purchase',
    'renewal',
    'renewal_info',
    'project_handover'
  ));

-- ---------------------------------------------------------------------------
-- 4. What happens to each project of an account
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.account_deletion_plan(p_user_id UUID, p_email TEXT)
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

REVOKE ALL ON FUNCTION public.account_deletion_plan(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_plan(UUID, TEXT) TO service_role;

-- What the dialog shows. Titles of projects the person is no member of stay hidden.
CREATE FUNCTION public.account_deletion_overview(p_user_id UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'delete', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('projectId', plan.project_id, 'title', plan.title)
               ORDER BY plan.title, plan.project_id
             )
        FROM public.account_deletion_plan(p_user_id, p_email) AS plan
       WHERE plan.will_delete
    ), '[]'::jsonb),
    'keep', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'projectId', plan.project_id,
                 'title', plan.title,
                 'candidates', CASE WHEN plan.needs_successor THEN COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'userId', pm.user_id,
                              'fullName', COALESCE(pf.full_name, ''),
                              'email', COALESCE(pf.email, '')
                            )
                            ORDER BY pm.created_at, pm.id
                          )
                     FROM public.project_members AS pm
                     JOIN public.profiles AS pf ON pf.id = pm.user_id
                    WHERE pm.project_id = plan.project_id
                      AND pm.user_id <> p_user_id
                 ), '[]'::jsonb) ELSE '[]'::jsonb END
               )
               ORDER BY plan.title, plan.project_id
             )
        FROM public.account_deletion_plan(p_user_id, p_email) AS plan
       WHERE NOT plan.will_delete
         AND plan.my_role IS NOT NULL
    ), '[]'::jsonb),
    'otherCount', (
      SELECT count(*)
        FROM public.account_deletion_plan(p_user_id, p_email) AS plan
       WHERE NOT plan.will_delete
         AND plan.my_role IS NULL
    )
  );
$$;

REVOKE ALL ON FUNCTION public.account_deletion_overview(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_overview(UUID, TEXT) TO service_role;

-- Data for the mail to a new project lead.
CREATE FUNCTION public.project_handover_details(p_project_id UUID, p_title TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'projectId', p_project_id,
    'title', p_title,
    'to', pf.email,
    'fullName', COALESCE(pf.full_name, '')
  )
  FROM public.profiles AS pf
  WHERE pf.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.project_handover_details(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_handover_details(UUID, TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Everything before the account itself is deleted: all or nothing
-- ---------------------------------------------------------------------------
--
-- Errors the app handles:
--   overview_changed    a project would be deleted that the person did not see
--   successor_required  a project needs a valid successor

CREATE FUNCTION public.prepare_account_deletion(
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

REVOKE ALL ON FUNCTION public.prepare_account_deletion(UUID, TEXT, UUID[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(UUID, TEXT, UUID[], JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Leaving a project
-- ---------------------------------------------------------------------------
--
-- Errors the app handles: not_member, last_member, successor_required

CREATE FUNCTION public.leave_project(
  p_project_id UUID,
  p_user_id UUID,
  p_successor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_title TEXT;
  v_owner UUID;
  v_role public.member_role;
  v_other_members INTEGER;
  v_other_leads INTEGER;
  v_successor UUID;
  v_new_owner UUID;
  v_handover JSONB;
BEGIN
  SELECT pr.title, pr.owner_id
    INTO v_title, v_owner
    FROM public.projects AS pr
   WHERE pr.id = p_project_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  PERFORM 1
     FROM public.project_members AS pm
    WHERE pm.project_id = p_project_id
    ORDER BY pm.id
      FOR UPDATE;

  SELECT pm.role
    INTO v_role
    FROM public.project_members AS pm
   WHERE pm.project_id = p_project_id
     AND pm.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  SELECT count(*)::INTEGER,
         (count(*) FILTER (WHERE pm.role = 'projektleiter'))::INTEGER
    INTO v_other_members, v_other_leads
    FROM public.project_members AS pm
   WHERE pm.project_id = p_project_id
     AND pm.user_id <> p_user_id;

  IF v_role = 'projektleiter' AND v_other_leads = 0 THEN
    IF v_other_members = 0 THEN
      RAISE EXCEPTION 'last_member';
    END IF;

    v_successor := p_successor_user_id;

    IF v_successor IS NULL
       OR v_successor = p_user_id
       OR NOT EXISTS (
         SELECT 1
           FROM public.project_members AS pm
          WHERE pm.project_id = p_project_id
            AND pm.user_id = v_successor
       )
    THEN
      RAISE EXCEPTION 'successor_required';
    END IF;

    UPDATE public.project_members AS pm
       SET role = 'projektleiter'
     WHERE pm.project_id = p_project_id
       AND pm.user_id = v_successor;

    v_handover := public.project_handover_details(p_project_id, v_title, v_successor);
  END IF;

  IF v_owner = p_user_id THEN
    v_new_owner := v_successor;

    IF v_new_owner IS NULL THEN
      SELECT pm.user_id
        INTO v_new_owner
        FROM public.project_members AS pm
       WHERE pm.project_id = p_project_id
         AND pm.user_id <> p_user_id
         AND pm.role = 'projektleiter'
       ORDER BY pm.created_at, pm.id
       LIMIT 1;
    END IF;

    UPDATE public.projects AS pr
       SET owner_id = v_new_owner
     WHERE pr.id = p_project_id;
  END IF;

  DELETE FROM public.project_members AS pm
   WHERE pm.project_id = p_project_id
     AND pm.user_id = p_user_id;

  RETURN jsonb_build_object('handover', v_handover);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_project(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_project(UUID, UUID, UUID) TO service_role;
