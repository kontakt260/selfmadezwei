-- PROJ-32: Book font (one font for the whole book).
--
-- projects.book_font
--   Font of the whole book, from a fixed list. Default PT Serif, so existing
--   books look unchanged.
--
-- chapters.page_count_font
--   Font the stored page_count was measured with. NULL means the count was
--   measured before PROJ-32, i.e. with PT Serif. Nullable on purpose: chapters
--   restored from the trash (PROJ-26) come back through jsonb_populate_record
--   from older snapshots that do not have this key.
--   A page_count whose font differs from the book font is outdated and gets
--   measured again in the browser (Neusatz, PROJ-32 step 3).
--
-- No new RLS policies: members already update projects and chapters
-- ("update as member" plus "update needs active access", which blocks the
-- read-only mode of PROJ-28). The server action checks the list as well.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS book_font text NOT NULL DEFAULT 'pt-serif';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_book_font_known;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_book_font_known
  CHECK (book_font IN ('pt-serif', 'garamond', 'baskerville', 'pagella', 'heros', 'atkinson'));

COMMENT ON COLUMN public.projects.book_font IS
  'PROJ-32: font of the whole book, fixed list, default pt-serif.';

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS page_count_font text;

ALTER TABLE public.chapters
  DROP CONSTRAINT IF EXISTS chapters_page_count_font_known;
ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_page_count_font_known
  CHECK (
    page_count_font IS NULL
    OR page_count_font IN ('pt-serif', 'garamond', 'baskerville', 'pagella', 'heros', 'atkinson')
  );

COMMENT ON COLUMN public.chapters.page_count_font IS
  'PROJ-32: font the page_count was measured with; NULL means pt-serif (before PROJ-32).';
