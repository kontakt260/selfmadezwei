-- ==========================================
-- PROJ-9 Refine — Rollen sind nach Einladungs-Annahme fest
-- ==========================================
--
-- Produktentscheidung 2026-05-21: einmal vergeben, bleibt die Rolle
-- (Projektleiter oder Co-Autor) eines Mitglieds für die Lebensdauer der
-- Mitgliedschaft fest. Soll eine Person eine andere Rolle bekommen,
-- muss sie entfernt und neu eingeladen werden.
--
-- Konkrete DB-Änderungen:
-- 1. UPDATE-Policy auf project_members entfernen → authenticated darf
--    Rolle nicht mehr ändern.
-- 2. UPDATE-Trigger zum Last-PL-Schutz entfällt — er war nur für den
--    Degrade-Pfad nötig, der nun verriegelt ist.
-- 3. DELETE-Trigger bleibt unverändert: Last-PL-Schutz beim Entfernen
--    eines Members ist weiterhin gewünscht.
--
-- Service-Role behält weiterhin Schreibrechte (RLS-bypass) — für
-- spätere Admin-Tools oder Daten-Migrationen.

DROP POLICY IF EXISTS "project_members update by pl" ON project_members;
DROP TRIGGER IF EXISTS project_members_enforce_last_pl_upd ON project_members;

-- enforce_last_projektleiter() bleibt — wird vom DELETE-Trigger gebraucht.
-- Der UPDATE-Zweig in der Function wird nie mehr gefeuert, aber wir
-- lassen ihn als toter Code drin für mögliche Wieder-Einführung.
