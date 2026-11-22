-- PROJ-3 BUG-7: members must not be able to change the owner of a project.
--
-- The policy "projects: update as member" applies to the whole row, so a
-- co-author could set owner_id. The field grants no access, but ownership is
-- used when an account is deleted and must only change on the server.
--
-- Members can still change everything else, for example the title.
-- The service role and the ON DELETE SET NULL rule are not affected.
-- No RLS policy is changed. Safe with the current app code, can be run at any time.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

CREATE FUNCTION public.protect_project_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND current_user IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'owner_id can only be changed by the server'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_project_owner() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER projects_protect_owner
  BEFORE UPDATE OF owner_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_owner();
