-- ======================================================================
-- lookup_invitation_by_token nur noch für service_role
-- (Supabase-Linter 0028/0029, Security-Advisor Stage 2026-11-19)
-- ======================================================================
-- Freigabe: Jakob, 2026-11-19 („Änderung 2 soll bitte auch umgesetzt
-- werden.“). Ergänzt 20261119200000_security_advisor_function_hardening,
-- die die Funktion noch offen gelassen hatte.
--
-- Vorher: Die SECURITY-DEFINER-Funktion war per
-- /rest/v1/rpc/lookup_invitation_by_token für jeden mit dem Anon-Key
-- aufrufbar (Token → Projekttitel, eingeladene E-Mail, Rolle, Ablauf,
-- Name der einladenden Person) — am App-Rate-Limiting vorbei.
--
-- Nachher: Nur service_role darf sie ausführen. Die beiden Aufrufer
--   - src/app/einladung/[token]/page.tsx (Einladungsseite)
--   - acceptInvitationAction in
--     src/app/projektuebersicht/[project_id]/members-actions.ts
-- lesen die Einladung seit demselben Commit serverseitig über den
-- Service-Role-Client.
--
-- ┌────────────────────────────────────────────────────────────────────┐
-- │ REIHENFOLGE — Stage UND Production:                                │
-- │ Erst EINSPIELEN, wenn der Code mit dem Service-Role-Lookup         │
-- │ ausgeliefert ist (Stage: Deploy von stage-app abgeschlossen;       │
-- │ Production: Merge stage → main deployt). Andersherum zeigt         │
-- │ /einladung/<token> „Einladung nicht gefunden“, und Einladungen     │
-- │ lassen sich nicht annehmen, bis der Code live ist.                 │
-- └────────────────────────────────────────────────────────────────────┘
--
-- RLS-Policies werden nicht angefasst.
-- ======================================================================

REVOKE EXECUTE ON FUNCTION public.lookup_invitation_by_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lookup_invitation_by_token(TEXT) TO service_role;


-- ──────────────────────────────────────────────────────────────────────
-- Prüfung nach dem Einspielen (lesend, nicht Teil der Migration)
-- ──────────────────────────────────────────────────────────────────────
--   select p.proacl::text
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'lookup_invitation_by_token';
-- Erwartet: kein „=X/“, kein anon, kein authenticated; service_role=X.
-- Danach /einladung/<gültiger Token> abgemeldet öffnen → Vorschau mit
-- Projekttitel.
--
-- Rückweg (nur im Notfall, z. B. wenn die Migration vor dem Code-Deploy
-- eingespielt wurde):
--   GRANT EXECUTE ON FUNCTION public.lookup_invitation_by_token(TEXT) TO anon, authenticated;
