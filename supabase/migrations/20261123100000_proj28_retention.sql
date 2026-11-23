-- PROJ-28: expired projects move to the trash 90 days after expiry.
--
-- Rules (features/PROJ-28-aufbewahrung-automatische-loeschung.md):
--   * Delete date = expires_at + 90 days. It is calculated, never stored.
--   * Due projects move to the trash from PROJ-26. The existing purge removes
--     them 14 days later, including their files.
--   * Safety brake: with more than 50 due projects nothing moves at all.
--     Support can release one run by confirming the exact number.
--   * A payment always wins. Each project is checked again under a lock.
--   * After a restore by support the members get 14 days to renew.
--   * Customers can neither start nor postpone any of this.
--
-- No existing RLS policy is changed.
--
-- Production: run AFTER 20261122180000 and BEFORE the code deploy.
-- Running this file moves nothing. Only the daily cron does.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

-- ---------------------------------------------------------------------------
-- 1. Why a project is in the trash
-- ---------------------------------------------------------------------------

ALTER TABLE public.trash_projects
  ADD COLUMN reason TEXT NOT NULL DEFAULT 'customer',
  ADD CONSTRAINT trash_projects_reason_check CHECK (reason IN ('customer', 'expired'));

COMMENT ON COLUMN public.trash_projects.reason IS
  'PROJ-28: customer = deleted by a person, expired = moved by the daily retention run.';

-- ---------------------------------------------------------------------------
-- 2. Holds. RLS is on and there are no policies: service role only.
-- ---------------------------------------------------------------------------

CREATE TABLE public.project_retention_holds (
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  hold_until  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, reason),
  CONSTRAINT project_retention_holds_reason_check
    CHECK (reason IN ('support_restore', 'print_order'))
);

COMMENT ON TABLE public.project_retention_holds IS
  'PROJ-28: the retention run leaves a project alone until hold_until. No personal data. Service role only.';

ALTER TABLE public.project_retention_holds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_retention_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_retention_holds TO service_role;

CREATE INDEX IF NOT EXISTS idx_project_access_expires_at
  ON public.project_access (expires_at);

-- ---------------------------------------------------------------------------
-- 3. Which projects are due
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.retention_due(p_project_id UUID DEFAULT NULL)
RETURNS TABLE (
  project_id     UUID,
  expires_at     TIMESTAMPTZ,
  delete_due_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pa.project_id, pa.expires_at, pa.expires_at + interval '90 days'
    FROM public.project_access AS pa
   WHERE pa.expires_at <= now() - interval '90 days'
     AND (p_project_id IS NULL OR pa.project_id = p_project_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.trash_projects AS tp WHERE tp.project_id = pa.project_id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.project_retention_holds AS h
        WHERE h.project_id = pa.project_id
          AND h.hold_until > now()
     )
   ORDER BY pa.expires_at, pa.project_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. The daily run
-- ---------------------------------------------------------------------------
--
-- p_confirm_count is for support only: the exact number of due projects after
-- a manual check. It is a one time release, nothing is stored.

CREATE FUNCTION public.retention_move_due(p_confirm_count INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit CONSTANT INTEGER := 50;
  v_due UUID[];
  v_total INTEGER;
  v_id UUID;
  v_moved INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed INTEGER := 0;
BEGIN
  IF p_confirm_count IS NOT NULL AND p_confirm_count < 1 THEN
    RAISE EXCEPTION 'invalid_confirmation';
  END IF;

  SELECT COALESCE(array_agg(d.project_id ORDER BY d.expires_at, d.project_id), '{}'),
         count(*)::INTEGER
    INTO v_due, v_total
    FROM public.retention_due() AS d;

  IF (p_confirm_count IS NULL AND v_total > v_limit)
     OR (p_confirm_count IS NOT NULL AND p_confirm_count <> v_total)
  THEN
    RETURN jsonb_build_object(
      'due', v_total, 'moved', 0, 'skipped', 0, 'failed', 0, 'braked', true
    );
  END IF;

  FOREACH v_id IN ARRAY v_due LOOP
    -- Own block: an error on one project does not stop the others.
    BEGIN
      -- A running payment or deletion goes first. The next run checks again.
      PERFORM 1
         FROM public.projects AS pr
        WHERE pr.id = v_id
          FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      PERFORM 1
         FROM public.project_access AS pa
        WHERE pa.project_id = v_id
          FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Checked again under the lock: a payment may have arrived just now.
      IF NOT EXISTS (SELECT 1 FROM public.retention_due(v_id)) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.trash_projects (project_id, reason)
      VALUES (v_id, 'expired');

      INSERT INTO public.trash_project_members (project_id, user_id, role, member_since)
      SELECT pm.project_id, pm.user_id, pm.role, pm.created_at
        FROM public.project_members AS pm
       WHERE pm.project_id = v_id;

      DELETE FROM public.project_members AS pm
       WHERE pm.project_id = v_id;

      v_moved := v_moved + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'retention_move_failed project=% sqlstate=%', v_id, SQLSTATE;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'due', v_total,
    'moved', v_moved,
    'skipped', v_skipped,
    'failed', v_failed,
    'braked', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Restore by support gives 14 days to renew
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trash_restore_project(p_project_id UUID, p_new_lead UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_members JSONB;
  v_first_lead UUID;
  v_count INTEGER;
  v_expires TIMESTAMPTZ;
  v_hold_until TIMESTAMPTZ;
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

  -- PROJ-28: without a hold the next run would move the project right back.
  SELECT pa.expires_at
    INTO v_expires
    FROM public.project_access AS pa
   WHERE pa.project_id = p_project_id;

  IF v_expires IS NOT NULL
     AND v_expires + interval '90 days' < now() + interval '14 days'
  THEN
    v_hold_until := now() + interval '14 days';

    INSERT INTO public.project_retention_holds AS h (project_id, reason, hold_until)
    VALUES (p_project_id, 'support_restore', v_hold_until)
    ON CONFLICT (project_id, reason)
    DO UPDATE SET hold_until = GREATEST(h.hold_until, EXCLUDED.hold_until);
  END IF;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'members', v_count,
    'holdUntil', v_hold_until
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Support search shows the reason
-- ---------------------------------------------------------------------------

DROP FUNCTION public.trash_find(TEXT);

-- Never returns the text of a chapter.
CREATE FUNCTION public.trash_find(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  item_type           TEXT,
  item_id             UUID,
  project_id          UUID,
  title               TEXT,
  project_title       TEXT,
  delete_reason       TEXT,
  deleted_at          TIMESTAMPTZ,
  purge_at            TIMESTAMPTZ,
  deleted_by_email    TEXT,
  member_emails       TEXT,
  contributor_emails  TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH items AS (
    SELECT 'project'::text AS kind, tp.project_id AS id, tp.project_id AS pid,
           pr.title AS item_title, pr.title AS proj_title, tp.reason AS why,
           tp.deleted_at AS del_at, tp.purge_at AS pur_at, tp.deleted_by AS del_by
      FROM public.trash_projects AS tp
      JOIN public.projects AS pr ON pr.id = tp.project_id
    UNION ALL
    SELECT 'chapter'::text, tc.chapter_id, tc.project_id,
           tc.title, pr.title, 'customer'::text,
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
            UNION
            SELECT cp.user_id
              FROM public.trash_chapter_people AS cp
             WHERE cp.chapter_id = i.id
               AND cp.was_member
          ) AS m
          JOIN public.profiles AS pf ON pf.id = m.user_id
      ) AS emails,
      (
        SELECT string_agg(DISTINCT pf.email, ', ')
          FROM (
            SELECT cp.user_id
              FROM public.trash_chapter_people AS cp
             WHERE cp.chapter_id = i.id
               AND cp.first_contributed_at IS NOT NULL
            UNION
            SELECT cc.user_id
              FROM public.chapter_contributors AS cc
              JOIN public.chapters AS c ON c.id = cc.chapter_id
             WHERE i.kind = 'project'
               AND c.project_id = i.pid
            UNION
            SELECT cp.user_id
              FROM public.trash_chapter_people AS cp
              JOIN public.trash_chapters AS tc ON tc.chapter_id = cp.chapter_id
             WHERE i.kind = 'project'
               AND tc.project_id = i.pid
               AND cp.first_contributed_at IS NOT NULL
          ) AS w
          JOIN public.profiles AS pf ON pf.id = w.user_id
      ) AS writer_emails
    FROM items AS i
    LEFT JOIN public.profiles AS deleter ON deleter.id = i.del_by
  )
  SELECT p.kind, p.id, p.pid, p.item_title, p.proj_title, p.why,
         p.del_at, p.pur_at, p.del_email, p.emails, p.writer_emails
    FROM people AS p
   WHERE COALESCE(btrim(p_search), '') = ''
      OR strpos(
           lower(concat_ws(' ', p.item_title, p.proj_title, p.emails, p.writer_emails, p.del_email)),
           lower(btrim(p_search))
         ) > 0
   ORDER BY p.del_at DESC
   LIMIT 100;
$$;

-- ---------------------------------------------------------------------------
-- 7. Nobody but the server and support may call these
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.retention_due(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_move_due(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_find(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trash_restore_project(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.retention_due(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.retention_move_due(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_find(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trash_restore_project(UUID, UUID) TO service_role;
