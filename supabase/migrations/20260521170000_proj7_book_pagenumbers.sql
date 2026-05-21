-- ==========================================
-- PROJ-7: Buchweite Seitenzahl — Live-Anzeige
-- Schema-Ergänzung: chapters.page_count + chapters.start_page
-- mit Trigger-basiertem Recalc für start_page.
-- ==========================================
--
-- Modell (siehe Tech-Design Sektion B):
--   page_count  — Anzahl A5-Seiten dieses Kapitels. Vom Editor beim
--                 Auto-Save geschrieben, wenn sich die Pagination-Engine-
--                 Settle-Zahl ändert. Default 1 — jedes Kapitel füllt
--                 mind. eine Seite (leere Kapitel zeigen die Buch-Seite).
--   start_page  — Buch-Offset (1-indexed). Bei welcher Buch-Seite dieses
--                 Kapitel beginnt. KEIN Application-Code schreibt das
--                 direkt — der unten angelegte Trigger rechnet es bei
--                 jedem relevanten chapters-Write neu (siehe Sektion D).
--
-- Live-Aktualität (Tech-Design Sektion C):
--   Schicht 1 (Browser): start_page ist Konstante während des Tippens,
--     lokale Seitenzahl kennt die Engine — Buch-Zahl = start_page + i.
--   Schicht 2 (DB): Trigger feuert beim Save → recalc von start_page
--     für alle Folge-Kapitel des Projekts in derselben Transaktion.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Spalten hinzufügen
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 1;

-- start_page zunächst NULLable für den Backfill — wird unten NOT NULL.
ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS start_page INTEGER;

-- ──────────────────────────────────────────────────────────────────────
-- 2. CHECK-Constraints (Verteidigung gegen Client-Manipulation)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE chapters
  DROP CONSTRAINT IF EXISTS chapters_page_count_range;
ALTER TABLE chapters
  ADD CONSTRAINT chapters_page_count_range CHECK (page_count BETWEEN 1 AND 999);

ALTER TABLE chapters
  DROP CONSTRAINT IF EXISTS chapters_start_page_positive;
ALTER TABLE chapters
  ADD CONSTRAINT chapters_start_page_positive CHECK (start_page IS NULL OR start_page >= 1);

-- ──────────────────────────────────────────────────────────────────────
-- 3. Recalc-Funktion
-- ──────────────────────────────────────────────────────────────────────
-- Atomarer Rebuild aller start_page-Werte eines Projekts.
-- Berechnung: kumulative Summe der page_count nach sort_order; das erste
-- Kapitel startet bei Buch-Seite 1.
--
-- Ein einziger UPDATE mit Window-Function (LAG / SUM-OVER) ist
-- effizienter als pro-Kapitel-Updates und sub-ms bei realen
-- Projekt-Größen (typisch < 30 Kapitel; spec-Risikoanalyse Sektion J).

CREATE OR REPLACE FUNCTION recalc_chapter_start_pages(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ordered AS (
    SELECT
      id,
      -- Kumulative Summe der vorhergehenden page_count + 1 = Start-Seite
      -- dieses Kapitels. COALESCE(LAG-SUM, 0) für das erste Kapitel.
      1 + COALESCE(
        SUM(page_count) OVER (
          ORDER BY sort_order, created_at, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ) AS new_start_page
    FROM chapters
    WHERE project_id = p_project_id
  )
  UPDATE chapters c
  SET start_page = o.new_start_page
  FROM ordered o
  WHERE c.id = o.id
    AND (c.start_page IS DISTINCT FROM o.new_start_page);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Trigger-Wrapper (statement-level für Performance)
-- ──────────────────────────────────────────────────────────────────────
-- Statement-level + transition tables: ein einziger Recalc pro
-- betroffenem Projekt, egal wie viele Rows in der gleichen Anweisung
-- berührt werden (z. B. Bulk-Reorder beim DnD-Save).
--
-- Granularität: feuert nur bei Mutationen, die start_page-Recalc
-- nötig machen (insert/delete/sort_order/page_count). Title-, Body-,
-- Image-Updates triggern NICHT — keine Performance-Last beim Tippen.

CREATE OR REPLACE FUNCTION trg_chapters_recalc_start_pages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  proj_id UUID;
BEGIN
  -- Alle betroffenen Projekte sammeln (typisch eines, kann bei
  -- Cross-Project-Statements mehr sein — wir iterieren defensiv).
  FOR proj_id IN
    SELECT DISTINCT project_id FROM affected_rows
  LOOP
    PERFORM recalc_chapter_start_pages(proj_id);
  END LOOP;
  RETURN NULL;
END;
$$;

-- INSERT: alle neuen rows betroffen.
DROP TRIGGER IF EXISTS chapters_recalc_after_insert ON chapters;
CREATE TRIGGER chapters_recalc_after_insert
  AFTER INSERT ON chapters
  REFERENCING NEW TABLE AS affected_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_chapters_recalc_start_pages();

-- DELETE: alle gelöschten rows; Projekt-ID ist in OLD.
DROP TRIGGER IF EXISTS chapters_recalc_after_delete ON chapters;
CREATE TRIGGER chapters_recalc_after_delete
  AFTER DELETE ON chapters
  REFERENCING OLD TABLE AS affected_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_chapters_recalc_start_pages();

-- UPDATE: Postgres erlaubt KEINE Spaltenliste (`OF page_count, sort_order`)
-- in Kombination mit Transition-Tables. Der Trigger feuert deshalb bei
-- JEDEM Update. Die Recalc-Funktion ist idempotent — bei title-/body-/
-- image_sections-only-Updates findet sie via `IS DISTINCT FROM`-Guard
-- keine Änderung und schreibt 0 Rows. Kostet ~1ms No-op-Scan pro Save,
-- weit unter dem 50ms-Performance-Budget.
DROP TRIGGER IF EXISTS chapters_recalc_after_update ON chapters;
CREATE TRIGGER chapters_recalc_after_update
  AFTER UPDATE ON chapters
  REFERENCING NEW TABLE AS affected_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_chapters_recalc_start_pages();

-- ──────────────────────────────────────────────────────────────────────
-- 5. Backfill bestehender Kapitel
-- ──────────────────────────────────────────────────────────────────────
-- Für jedes Projekt kumulativ start_page setzen. page_count bleibt auf
-- dem Default 1 — der Editor schreibt beim ersten Öffnen den realen Wert
-- nach. Konservativ; Buch-Reihenfolge bleibt monoton.

DO $$
DECLARE
  p_id UUID;
BEGIN
  FOR p_id IN SELECT DISTINCT project_id FROM chapters LOOP
    PERFORM recalc_chapter_start_pages(p_id);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- 6. start_page NOT NULL setzen
-- ──────────────────────────────────────────────────────────────────────
-- Nach erfolgreichem Backfill darf start_page keinen NULL mehr enthalten.
-- Default 1 gegen Race-Edge-Cases (Insert ohne Trigger-Aufruf, theoretisch
-- nicht möglich — aber Belt-and-Suspenders).

ALTER TABLE chapters
  ALTER COLUMN start_page SET DEFAULT 1;

ALTER TABLE chapters
  ALTER COLUMN start_page SET NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 7. Index für die Trigger-Recalc-Abfrage
-- ──────────────────────────────────────────────────────────────────────
-- Der Recalc liest chapters per (project_id, sort_order, created_at, id).
-- Index beschleunigt das auch bei großen Projekten.

CREATE INDEX IF NOT EXISTS chapters_recalc_lookup
  ON chapters (project_id, sort_order, created_at, id);
