-- ==========================================================================
-- PROJ-34: Delayed cleanup of removed chapter photos
--
-- A removed photo stays in storage for 14 days, so that undo and a second
-- writer cannot break a chapter. The database notices which files a saved
-- chapter no longer uses, and takes them off the list again when they return.
-- The daily cron deletes due files after checking them once more.
--
-- Existing RLS policies do not change. The new table has RLS enabled and no
-- policies: only the service role can use it. No chapter is rewritten.
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. List of removed photos
-- ---------------------------------------------------------------------------

CREATE TABLE public.storage_image_cleanup_queue (
  storage_path  TEXT PRIMARY KEY,
  chapter_id    UUID NOT NULL,
  project_id    UUID NOT NULL,
  delete_after  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  attempts      SMALLINT NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT storage_image_cleanup_queue_attempts_check CHECK (attempts >= 0),
  -- The cleanup runs with full rights. It may only ever reach a file directly
  -- inside the folder of its own chapter.
  CONSTRAINT storage_image_cleanup_queue_own_folder CHECK (
    storage_path ~ (
      '^' || project_id::text || '/' || chapter_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$'
    )
  )
);

COMMENT ON TABLE public.storage_image_cleanup_queue IS
  'PROJ-34: chapter photos no saved chapter uses any more, deleted after delete_after. No personal data. Service role only.';

CREATE INDEX idx_storage_image_cleanup_due
  ON public.storage_image_cleanup_queue (delete_after);
CREATE INDEX idx_storage_image_cleanup_chapter
  ON public.storage_image_cleanup_queue (chapter_id);

ALTER TABLE public.storage_image_cleanup_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storage_image_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_image_cleanup_queue TO service_role;

-- ---------------------------------------------------------------------------
-- 2. All file paths of a chapter's image data
-- ---------------------------------------------------------------------------
--
-- Members can write this JSON directly, so unexpected shapes must not raise an
-- error here: that would block saving the chapter.

CREATE FUNCTION private.chapter_image_paths(p_sections JSONB)
RETURNS TABLE (storage_path TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH sections AS (
    SELECT p_sections -> 'start' AS section
    UNION ALL
    SELECT p_sections -> 'end'
    UNION ALL
    SELECT entry.value
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(p_sections -> 'inline') = 'object' THEN p_sections -> 'inline'
          ELSE '{}'::jsonb
        END
      ) AS entry
  ),
  images AS (
    SELECT photo.value AS image
      FROM sections AS s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(s.section -> 'images') = 'array' THEN s.section -> 'images'
          ELSE '[]'::jsonb
        END
      ) AS photo
  )
  SELECT DISTINCT i.image ->> 'storage_path'
    FROM images AS i
   WHERE jsonb_typeof(i.image) = 'object'
     AND jsonb_typeof(i.image -> 'storage_path') = 'string';
$$;

REVOKE ALL ON FUNCTION private.chapter_image_paths(JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Keep the list in step with every saved chapter
-- ---------------------------------------------------------------------------

CREATE FUNCTION private.queue_removed_chapter_images()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_own_file TEXT := '^' || NEW.project_id::text || '/' || NEW.id::text
    || '/[A-Za-z0-9][A-Za-z0-9._-]*$';
BEGIN
  -- A file that is in use again must not be deleted.
  DELETE FROM public.storage_image_cleanup_queue AS q
   WHERE q.chapter_id = NEW.id
     AND q.storage_path IN (
       SELECT current_file.storage_path
         FROM private.chapter_image_paths(NEW.image_sections) AS current_file
     );

  -- Paths outside the own chapter folder are never listed.
  INSERT INTO public.storage_image_cleanup_queue (storage_path, chapter_id, project_id)
  SELECT removed.storage_path, NEW.id, NEW.project_id
    FROM private.chapter_image_paths(OLD.image_sections) AS removed
   WHERE removed.storage_path ~ v_own_file
     AND NOT EXISTS (
       SELECT 1
         FROM private.chapter_image_paths(NEW.image_sections) AS current_file
        WHERE current_file.storage_path = removed.storage_path
     )
  ON CONFLICT (storage_path) DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_removed_chapter_images() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER chapters_queue_removed_images
  AFTER UPDATE OF image_sections ON public.chapters
  FOR EACH ROW
  WHEN (OLD.image_sections IS DISTINCT FROM NEW.image_sections)
  EXECUTE FUNCTION private.queue_removed_chapter_images();
