-- PROJ-26 BUG-1 and BUG-2: who belonged to a deleted chapter.
--
-- BUG-1: Support only saw the current members of a project. Somebody removed
-- from the project after (or right before) the deletion could not be recognized.
-- BUG-2: The list of contributors was stored as JSON and kept the user id after
-- the account was deleted.
--
-- Now every person is one row in trash_chapter_people. The row disappears with
-- the account. Service role only, RLS is on and there are no policies.
-- No existing RLS policy is changed.
--
-- The SQL editor warns because of DROP COLUMN. The column is copied first, and
-- the only data in it is the list of contributors of chapters in the trash.
--
-- Production: run AFTER 20261122160000 and BEFORE the code deploy.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

-- ---------------------------------------------------------------------------
-- 1. New table
-- ---------------------------------------------------------------------------

CREATE TABLE public.trash_chapter_people (
  chapter_id            UUID NOT NULL REFERENCES public.trash_chapters(chapter_id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  was_member            BOOLEAN NOT NULL DEFAULT false,
  first_contributed_at  TIMESTAMPTZ,

  PRIMARY KEY (chapter_id, user_id)
);

COMMENT ON TABLE public.trash_chapter_people IS
  'PROJ-26: members at the time of deletion and contributors of a deleted chapter. Rows disappear with the account. Service role only.';

CREATE INDEX idx_trash_chapter_people_user ON public.trash_chapter_people (user_id);

ALTER TABLE public.trash_chapter_people ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.trash_chapter_people FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trash_chapter_people TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Move what is already in the trash
-- ---------------------------------------------------------------------------

INSERT INTO public.trash_chapter_people (chapter_id, user_id, first_contributed_at)
SELECT tc.chapter_id,
       (person ->> 'user_id')::uuid,
       (person ->> 'first_contributed_at')::timestamptz
  FROM public.trash_chapters AS tc
 CROSS JOIN LATERAL jsonb_array_elements(tc.contributors) AS person
 WHERE EXISTS (
   SELECT 1 FROM public.profiles AS pf WHERE pf.id = (person ->> 'user_id')::uuid
 )
ON CONFLICT (chapter_id, user_id) DO NOTHING;

-- Older entries did not record the members. Today's members are the best match.
INSERT INTO public.trash_chapter_people (chapter_id, user_id, was_member)
SELECT tc.chapter_id, members.user_id, true
  FROM public.trash_chapters AS tc
 CROSS JOIN LATERAL (
   SELECT pm.user_id FROM public.project_members AS pm WHERE pm.project_id = tc.project_id
   UNION
   SELECT tm.user_id FROM public.trash_project_members AS tm WHERE tm.project_id = tc.project_id
 ) AS members
 WHERE EXISTS (SELECT 1 FROM public.profiles AS pf WHERE pf.id = members.user_id)
ON CONFLICT (chapter_id, user_id) DO UPDATE SET was_member = true;

-- ---------------------------------------------------------------------------
-- 3. Deleting a chapter records the people
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.move_chapter_to_trash()
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

  INSERT INTO public.trash_chapters (chapter_id, project_id, title, snapshot, deleted_by)
  VALUES (OLD.id, OLD.project_id, OLD.title, to_jsonb(OLD), v_deleted_by)
  ON CONFLICT (chapter_id) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.trash_chapter_people (chapter_id, user_id, was_member, first_contributed_at)
    SELECT OLD.id, people.user_id, bool_or(people.was_member), max(people.contributed_at)
      FROM (
        SELECT pm.user_id, true AS was_member, NULL::timestamptz AS contributed_at
          FROM public.project_members AS pm
         WHERE pm.project_id = OLD.project_id
        UNION ALL
        SELECT cc.user_id, false, cc.first_contributed_at
          FROM public.chapter_contributors AS cc
         WHERE cc.chapter_id = OLD.id
      ) AS people
     WHERE EXISTS (SELECT 1 FROM public.profiles AS pf WHERE pf.id = people.user_id)
     GROUP BY people.user_id;
  END IF;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Restoring a chapter reads the new table
-- ---------------------------------------------------------------------------

ALTER TABLE public.trash_chapters DROP COLUMN contributors;

CREATE OR REPLACE FUNCTION public.trash_restore_chapter(p_chapter_id UUID)
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
  SELECT p_chapter_id, person.user_id, person.first_contributed_at
    FROM public.trash_chapter_people AS person
   WHERE person.chapter_id = p_chapter_id
     AND person.first_contributed_at IS NOT NULL
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

-- ---------------------------------------------------------------------------
-- 5. Support search shows members and people who wrote in the content
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
  SELECT p.kind, p.id, p.pid, p.item_title, p.proj_title,
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

REVOKE ALL ON FUNCTION public.trash_find(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_find(TEXT) TO service_role;
