-- ======================================================================
-- Security-Advisor-Hardening für Funktionen (Supabase-Linter 0011, 0028, 0029)
-- ======================================================================
-- Anlass: get_advisors (security) auf Stage, 2026-11-19.
-- Freigabe: Jakob, 2026-11-19 (Punkte Trigger sperren, Hilfsfunktionen
-- offen lassen, search_path festlegen).
--
--   0011 function_search_path_mutable
--        update_updated_at, set_project_access_updated_at
--   0028/0029 anon/authenticated_security_definer_function_executable
--        enforce_last_projektleiter, handle_new_user,
--        trg_chapters_recalc_start_pages, lookup_invitation_by_token,
--        get_my_project_ids, am_i_pl_of, is_member_of
--
-- Was diese Migration macht:
--   1. search_path der beiden Zeitstempel-Trigger-Funktionen fest auf ''.
--   2. Die drei SECURITY-DEFINER-Trigger-Funktionen nicht mehr per
--      /rest/v1/rpc aufrufbar machen.
--
-- Was bewusst bleibt (Advisor-Hinweise sind gewollt):
--   - get_my_project_ids: EXECUTE für anon + authenticated. Die Funktion
--     steckt in Policies „TO public“ auf projects, chapters,
--     project_covers und storage.objects. Postgres prüft EXECUTE beim
--     Start jeder Abfrage, auch für anon — ohne das Recht würde jede
--     anon-Abfrage auf diese Tabellen mit „permission denied for
--     function“ abbrechen statt leer zu bleiben. Die Funktion liefert
--     nur die Projekt-IDs von auth.uid(); für anon ist das eine leere
--     Menge.
--   - am_i_pl_of, is_member_of: EXECUTE für authenticated, weil sie in
--     Policies „TO authenticated“ stecken (invitations, project_members,
--     payments, voice_sessions). anon hat schon heute kein Recht.
--     Beide prüfen nur die eigene Rolle bzw. Mitgliedschaft von
--     auth.uid().
--   - lookup_invitation_by_token: EXECUTE für anon + authenticated, weil
--     die Einladungsseite (/einladung/<token>) und acceptInvitationAction
--     sie mit dem Session-Client aufrufen — auch abgemeldet. Wird in
--     PROJ-19 noch einmal geprüft (Umstellung auf Service-Role-Client).
--
-- RLS-Policies werden nicht angefasst.
-- ======================================================================


-- ──────────────────────────────────────────────────────────────────────
-- 1. search_path fixieren (Lint 0011)
-- ──────────────────────────────────────────────────────────────────────
-- Beide Bodies nutzen nur now() aus pg_catalog, das auch bei leerem
-- search_path gefunden wird.

ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.set_project_access_updated_at() SET search_path = '';


-- ──────────────────────────────────────────────────────────────────────
-- 2. Trigger-Funktionen: kein RPC-Zugriff (Lint 0028/0029)
-- ──────────────────────────────────────────────────────────────────────
-- Postgres prüft EXECUTE auf eine Trigger-Funktion nur bei CREATE
-- TRIGGER, nicht beim Feuern. Die Trigger laufen also unverändert
-- weiter (Registrierung → profiles, Kapitel → Seitenzahlen,
-- Letzter-Projektleiter-Schutz).
-- Rechte gehen aus PUBLIC UND explizit aus anon/authenticated, weil
-- Supabase per Default-Privileges direkt an beide Rollen vergibt.
-- service_role und postgres behalten ihre Rechte.

REVOKE EXECUTE ON FUNCTION public.handle_new_user()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_last_projektleiter()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_chapters_recalc_start_pages() FROM PUBLIC, anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────
-- Prüfung nach dem Einspielen (lesend, nicht Teil der Migration)
-- ──────────────────────────────────────────────────────────────────────
--   select p.proname, p.proconfig, p.proacl::text
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('update_updated_at', 'set_project_access_updated_at',
--                       'handle_new_user', 'enforce_last_projektleiter',
--                       'trg_chapters_recalc_start_pages');
-- Erwartet: proconfig = {search_path=""} bei den ersten beiden;
-- bei den letzten drei in proacl kein „=X/“, kein anon, kein authenticated.
--
-- Rückweg (nur im Notfall):
--   ALTER FUNCTION public.update_updated_at() RESET search_path;
--   ALTER FUNCTION public.set_project_access_updated_at() RESET search_path;
--   GRANT EXECUTE ON FUNCTION public.handle_new_user(),
--     public.enforce_last_projektleiter(),
--     public.trg_chapters_recalc_start_pages() TO PUBLIC, anon, authenticated;
