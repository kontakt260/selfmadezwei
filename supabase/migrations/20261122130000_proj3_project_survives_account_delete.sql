-- PROJ-3: deleting an account must never delete a project other people work in.
--
-- Before: projects.owner_id was ON DELETE CASCADE. When the owner deleted the
-- account, the whole project went with it, including chapters of other members.
-- After: the owner is set to NULL and the project stays.
--
-- Side effect (wanted): enforce_last_projektleiter now really protects a project.
-- Deleting the last project lead fails with error 23514 until a successor exists
-- or the project itself was deleted. This also applies to deleting a user in the
-- Supabase dashboard.
--
-- No RLS change. Safe with the current app code, can be run at any time.
-- Requires 20261121110000_proj6_direct_gift (owner_id may be NULL).
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'projects'
       AND column_name = 'owner_id'
       AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'projects.owner_id is still NOT NULL. Run 20261121110000_proj6_direct_gift first.';
  END IF;
END
$$;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_owner_id_fkey,
  ADD CONSTRAINT projects_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.owner_id IS
  'Owner of the project. NULL for a gift without own access until the recipient accepts, or after the owner deleted the account. Grants no access on its own.';
