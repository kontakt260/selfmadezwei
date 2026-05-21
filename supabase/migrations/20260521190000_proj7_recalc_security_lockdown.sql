-- ==========================================
-- PROJ-7 Bug B-1 — recalc-Function Security-Lockdown
-- ==========================================
-- Vor diesem Fix war `recalc_chapter_start_pages(UUID)` als
-- SECURITY DEFINER mit default-`PUBLIC GRANT EXECUTE` exposed —
-- jeder anon-/authenticated-User konnte sie via PostgREST RPC mit
-- beliebiger project_id aufrufen. Real-Impact war null (Funktion
-- schreibt deterministisch korrekte Werte, gibt nichts zurück), aber
-- Defense-in-Depth-Verletzung.
--
-- Lösung:
--   1. EXECUTE-Recht auf recalc_chapter_start_pages strippen — nur
--      noch postgres + service_role dürfen die Funktion direkt aufrufen.
--   2. Trigger-Wrapper trg_chapters_recalc_start_pages auf SECURITY
--      DEFINER hochstufen — damit der Trigger weiterhin die recalc-
--      Funktion ausführen kann, wenn ein authenticated-User ein chapter
--      mutiert. SECURITY DEFINER bedeutet: der Trigger-Body läuft mit
--      den Rechten des Function-Owners (postgres), nicht des
--      mutierenden Users.
--   3. Search-Path explizit auf `public` setzen — verhindert
--      search-path-Injection in SECURITY-DEFINER-Funktionen.

-- ──────────────────────────────────────────────────────────────────────
-- 1. EXECUTE-Recht auf recalc_chapter_start_pages strippen
-- ──────────────────────────────────────────────────────────────────────
-- Wir revoken aus PUBLIC (was anon/authenticated implizit kassieren)
-- UND explizit aus anon/authenticated, falls grants direkt zugewiesen
-- waren.

REVOKE EXECUTE ON FUNCTION public.recalc_chapter_start_pages(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalc_chapter_start_pages(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalc_chapter_start_pages(UUID) FROM authenticated;

-- service_role darf weiterhin — Service-Role-Code (z. B. PROJ-6 Webhook,
-- spätere Bulk-Jobs) muss die Funktion ggf. direkt aufrufen.
GRANT EXECUTE ON FUNCTION public.recalc_chapter_start_pages(UUID) TO service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Trigger-Wrapper auf SECURITY DEFINER hochstufen
-- ──────────────────────────────────────────────────────────────────────
-- Der Trigger-Body läuft danach mit den Rechten des Function-Owners
-- (postgres). Damit kann er recalc_chapter_start_pages aufrufen, auch
-- wenn die ursprünglich mutierende Rolle (z. B. authenticated) das
-- EXECUTE-Recht nicht mehr hat.
--
-- Achtung: Da der Trigger jetzt mit Privilegien läuft, MUSS der
-- search_path explizit gesetzt sein, damit ein böswilliger User keine
-- shadowing-Functions in einem fremden Schema unterbringen kann, die
-- der Trigger dann statt der echten ausführt.

ALTER FUNCTION public.trg_chapters_recalc_start_pages()
  SECURITY DEFINER
  SET search_path = public;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Verify (run-time sanity, kein DDL)
-- ──────────────────────────────────────────────────────────────────────
-- Erwartung nach diesem Migration-Run:
--   anon_can_exec(recalc)        = false
--   authenticated_can_exec(recalc) = false
--   service_role_can_exec(recalc) = true
--   trg ist SECURITY DEFINER
--
-- (Verifikation läuft im QA-Lauf, nicht als Teil der Migration —
-- DO-Block würde nur RAISE NOTICE, das via PostgREST nicht durchkommt.)
