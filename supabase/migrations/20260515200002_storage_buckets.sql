-- ==========================================
-- PROJ-1: Storage Buckets
-- 4 private buckets + RLS policies on storage.objects
-- Path convention: {project_id}/... (first folder = project_id for membership check)
-- ==========================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('project-logos',  'project-logos',  false, 10485760,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('chapter-heroes', 'chapter-heroes', false, 10485760,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('project-covers', 'project-covers', false, 10485760,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('exports',        'exports',        false, 104857600, ARRAY['application/pdf','application/zip']);

-- ==========================================
-- STORAGE POLICIES
-- Uses get_my_project_ids() to check membership via the first path segment
-- ==========================================

-- project-logos
CREATE POLICY "project-logos: select as member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-logos'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "project-logos: insert as member"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-logos'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "project-logos: update as member"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-logos'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "project-logos: delete as member"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-logos'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

-- chapter-heroes
CREATE POLICY "chapter-heroes: select as member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chapter-heroes'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "chapter-heroes: insert as member"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chapter-heroes'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "chapter-heroes: update as member"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'chapter-heroes'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "chapter-heroes: delete as member"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chapter-heroes'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

-- project-covers
CREATE POLICY "project-covers: select as member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-covers'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "project-covers: insert as member"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-covers'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "project-covers: update as member"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-covers'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

CREATE POLICY "project-covers: delete as member"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-covers'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );

-- exports: server-only upload; members can only read
CREATE POLICY "exports: select as member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exports'
    AND (string_to_array(name, '/'))[1]::uuid IN (SELECT public.get_my_project_ids())
  );
-- No INSERT/UPDATE/DELETE policy for exports — service_role only
