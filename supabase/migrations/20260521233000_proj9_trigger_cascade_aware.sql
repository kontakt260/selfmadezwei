-- ==========================================
-- PROJ-9 Bug B-1 — Last-PL-Trigger CASCADE-aware machen
-- ==========================================
--
-- Symptom vor Fix: `enforce_last_projektleiter()` blockt CASCADE-DELETEs
-- vom Projekt mit `23514 Letzter Projektleiter kann nicht entfernt werden`.
-- Wenn ein Projektleiter sein eigenes Projekt via PROJ-3 löscht, feuert
-- die FK-ON-DELETE-CASCADE auf `project_members`, und der BEFORE-Trigger
-- wirft die Exception → Transaktion rolled back → Projekt unlöschbar.
--
-- Fix: vor dem PL-Count-Check prüfen, ob das `projects`-Row noch
-- existiert. Wenn nicht → das Projekt wird in derselben Transaktion
-- gelöscht (CASCADE), und die Last-PL-Invariante ist obsolet — wir
-- lassen die Cascade-Delete-Reihe durch.
--
-- Reines Function-Update; keine Trigger-Definition-Änderung nötig.

CREATE OR REPLACE FUNCTION public.enforce_last_projektleiter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  remaining_pl_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- CASCADE-Erkennung: wenn das Projekt nicht mehr existiert, läuft
    -- gerade ein DELETE FROM projects mit CASCADE. Last-PL-Check
    -- übersprungen — sonst blockt der Trigger das Projekt-Delete.
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
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
$func$;
