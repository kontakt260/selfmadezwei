# Prod-Umzug — Stage → Production

> **Zweck:** Wir bauen und testen alles auf Stage (`stage-app.narravit.de`). Diese Datei sammelt **jede** Einstellung, die für Production anders sein oder dort noch erledigt werden muss — damit der Umzug am Ende lückenlos klappt.
>
> **Pflege-Regel (Anforderung 2026-10-14):** Wer auf Stage eine Env-Variable, einen Schlüssel, eine Adresse, einen Webhook, eine Supabase-/Stripe-/Resend-Einstellung, eine Domain oder einen Rechtstext anlegt oder ändert, trägt das **im selben Arbeitsschritt** hier ein. Nie Secret-Werte eintragen — nur Name, Ort und was in Production gesetzt werden muss.

**Stand:** 2026-10-14

---

## 1. Ablauf am Umzugstag

Reihenfolge so wählen, dass Production nie halb konfiguriert Kunden sieht:

1. Vorbedingungen aus Abschnitt 9 erfüllt (Rechtstexte, Go-live-Blocker).
2. **Supabase Production** einrichten (Abschnitt 3): Migrationen + Seed, Auth-URLs, SMTP, OAuth — **noch ohne Mail-Vorlagen**.
3. **Stripe Live-Modus** einrichten (Abschnitt 4): Produkte, Webhook, Schlüssel.
4. **Resend** Production-Schlüssel anlegen (Abschnitt 5).
5. **Vercel Production-Variablen** setzen (Abschnitt 2), Domain `app.narravit.de` prüfen. **Pflicht vor dem Merge (PROJ-19):** Der Build von `main` bricht sonst ab, die laufende Version bleibt online. In Production fehlen heute (geprüft 2026-11-22) in dieser Reihenfolge:
   1. Aus Schritt 3: `STRIPE_SECRET_KEY` (Live-Schlüssel), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_INITIAL`, `STRIPE_PRICE_ID_RENEWAL`
   2. Aus Schritt 4: `RESEND_API_KEY`
   3. Neu erzeugen: `CRON_SECRET`
   4. Aus Abschnitt 3: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (echter Schlüssel, kein Testschlüssel)
   5. Nicht Pflicht, sonst nur eine Warnung: `WELCOME_DISCOUNT_CODE`
6. `stage` → `main` mergen (über `/deploy`, nur mit ausdrücklicher Freigabe).
7. **Direkt danach die Supabase-Mail-Vorlagen in Production einsetzen** (Abschnitt 3). Nicht früher: Die neuen Links brauchen den `token_hash`-Teil von `/auth/callback`, den der alte Stand auf `main` nicht kennt (geprüft 2026-11-21). Vor dem Merge wären Registrierung und „Passwort vergessen" in Production kaputt.
8. Smoke-Tests (Abschnitt 10).

---

## 2. Vercel (Projekt `app-narravit`)

### Umgebungsvariablen

Production-Werte in Vercel unter **Settings → Environment Variables** mit Scope **Production** setzen. Secrets als *Sensitive* markieren.

| Variable | Stage | Production | Hinweis |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://stage-app.narravit.de` | `https://app.narravit.de` | Basis für Mail-Links, Stripe-Rückleitung, Auth-Redirects. Kein `/` am Ende. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL des Stage-Projekts (`kdjhxqitfxnsavhiafdn`) | URL des Production-Projekts | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Stage-Anon-Key | Production-Anon-Key | |
| `SUPABASE_SERVICE_ROLE_KEY` | Stage-Service-Role | Production-Service-Role | Sensitive. Nur serverseitig. |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` | Sensitive. |
| `STRIPE_WEBHOOK_SECRET` | Secret des Stage-Webhooks (Test-Modus) | Secret des Live-Webhooks | Sensitive. Jeder Webhook-Endpunkt hat ein eigenes Secret. |
| `STRIPE_PRICE_ID_INITIAL` | Test-Preis | Live-Preis 249 € | Preis-IDs unterscheiden sich zwischen Test und Live. |
| `STRIPE_PRICE_ID_RENEWAL` | Test-Preis | Live-Preis 99 € | |
| `RESEND_API_KEY` | Schlüssel `narravit-app-stage` | eigener Schlüssel `narravit-app-prod` | Sensitive. Sending access, Domain `mail.narravit.de`. |
| `EMAIL_TEST_RECIPIENT` | `kontakt@narravit.de` | **nicht setzen** | Leitet alle Mails um. Wird in Production zwar ignoriert, soll dort trotzdem fehlen. Stand 2026-11-22: von Jakob für Production entfernt, gilt nur noch für Preview und Development (geprüft). |
| `EMAIL_FROM` | nicht gesetzt (Fallback) | optional | Fallback im Code: `NARRAVIT <no-reply@mail.narravit.de>`. Absender-Name immer in Großbuchstaben, Adresse auf `mail.narravit.de`. |
| `CRON_SECRET` | eigener Zufallswert | **neuer** Zufallswert | Sensitive. Erzeugen: `openssl rand -base64 32`. **Fehlt in Production noch** (Stand 2026-11-22: nur für Preview und Development angelegt). Ohne Wert antwortet der Cron mit 500 und es gehen keine Erinnerungen raus. |
| `WELCOME_DISCOUNT_CODE` | `BUCH50` (Stripe-Testmodus) | `BUCH50` (muss im Stripe-Live-Modus existieren) | Kein Secret, steht in der Willkommens-Mail. Ohne Wert erscheint kein Rabatt in der Mail. Muss exakt dem Code in Stripe entsprechen (Abschnitt 4). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | öffentlicher Testschlüssel `1x00000000000000000000AA` | echter Site Key für `app.narravit.de` | PROJ-17. Kein Secret. Der geheime Gegenschlüssel liegt nur in Supabase (Abschnitt 3). **Der Testschlüssel besteht jede Prüfung und darf nie in Production stehen.** Stage: gesetzt (nur Preview). |
| `RATE_LIMIT_DISABLED` | **nicht setzen** | **nicht setzen** | Nur für lokale Entwicklung, schaltet die Limits ab. Wird in Production ignoriert. |

Sicherung im Code: Auf `https://app.narravit.de` (= `NEXT_PUBLIC_SITE_URL` in Production) wird `EMAIL_TEST_RECIPIENT` ignoriert, selbst wenn die Variable versehentlich gesetzt ist.

**Konfigurationsprüfung beim Build (PROJ-19):** Auf Stage und Production bricht der Build ab, wenn ein Pflichtwert fehlt (alle Variablen oben außer `EMAIL_TEST_RECIPIENT`, `EMAIL_FROM`, `WELCOME_DISCOUNT_CODE`, `RATE_LIMIT_DISABLED`). Für den Branch `main` und die Adresse `app.narravit.de` gilt zusätzlich: Adresse exakt `https://app.narravit.de`, Stripe-Live-Schlüssel, kein Turnstile-Testschlüssel, `EMAIL_TEST_RECIPIENT` und `RATE_LIMIT_DISABLED` nicht gesetzt. Auch Preview-Deployments von `main` fallen unter diese strengen Regeln und scheitern mit Stage-Werten, das ist gewollt.

Entfallen, in Production **nicht** anlegen: `STRIPE_PRICE_ID_VAPI_60`, `VAPI_API_KEY` (Vapi-Rückbau 2026-10-13).

### Weitere Vercel-Einstellungen

- [ ] Domain `app.narravit.de` ist der Production-Domain zugeordnet (DNS siehe Abschnitt 7).
- [ ] **Vercel Pro statt Hobby (Pflicht vor dem ersten Verkauf):** Das Projekt läuft auf dem Hobby-Plan (geprüft 2026-11-22). Die Vercel-AGB erlauben Hobby nur „for your personal or non-commercial use", NARRAVIT verkauft aber über die App. Hobby wird nicht nachträglich abgerechnet: Vercel darf solche Projekte laut AGB ohne Vorwarnung abschalten, und bei überschrittenen Kontingenten pausiert die Funktion bis zu 30 Tage. **Entscheidung Jakob (2026-11-22): Wechsel auf Pro kurz vor dem Go-live**, spätestens bevor die Kaufseite öffentlich wird (20 $ im Monat inkl. 20 $ Nutzung; Logs 1 Tag statt 1 Stunde, E-Mail-Support, genaue Cron-Zeiten).
- [ ] **Function-Region in die EU:** Die Server-Funktionen laufen aktuell in `iad1` (Washington, geprüft 2026-11-22), Kundendaten gehen also über die USA. Auf `fra1` (Frankfurt) oder die Region der Supabase-Datenbank umstellen: Settings → Functions → Function Regions. Vorher die Supabase-Region prüfen und das Ergebnis in die Datenschutzerklärung übernehmen.
- [ ] Deployment Protection (Vercel-Login) gilt nur für Stage/Preview, **nicht** für Production.
- [ ] Cron `/api/cron/reminders` (täglich 09:00 UTC, `vercel.json`): Vercel führt Crons nur für Deployments der Umgebung „Production" aus. Nach dem ersten Lauf in den Vercel-Logs prüfen, dass er mit 200 antwortet.
- [x] Geklärt (2026-11-22): Stage läuft als „Preview", der Production-Branch ist bereits `main` und `app.narravit.de` zeigt auf dessen Production-Deployment. Stage-Werte gehören in die Umgebung „Preview", die Production-Werte werden separat angelegt. Beim Redeploy von Stage in der Deployment-Liste auf den Branch `stage` achten, dort stehen auch Preview-Deployments von `main`.

---

## 3. Supabase

Stage = Projekt-Ref `kdjhxqitfxnsavhiafdn`. Production = Haupt-Projekt (`main`) — Zuordnung vor dem Umzug im Dashboard bestätigen. Claude hat bewusst **keinen** Zugriff auf Production-Daten — Migrationen in Production spielt der Betreiber ein (Branch-Merge oder SQL-Editor).

### Datenbank

- [ ] **Supabase-Tarif:** Jakob zahlt bereits (Stand 2026-11-22). Vor dem Go-live prüfen, dass das Production-Projekt in der bezahlten Organisation liegt und tägliche Backups laufen. Der Free-Tarif hätte keine Backups, pausiert nach 7 Tagen ohne Aktivität und bietet nur 1 GB Dateispeicher.
- [ ] Alle Migrationen aus `supabase/migrations/` in Production angewendet (Stand 2026-11-19: 17 Dateien, letzte `20261119210000_lookup_invitation_service_role_only.sql`). Mit `list_migrations` bzw. im Dashboard gegen das Repo abgleichen.
- [x] Stage: `20261116100000_proj6_purchase_claims.sql` am 2026-11-19 über den SQL-Editor eingespielt und in `supabase_migrations.schema_migrations` vermerkt (Version `20261116100000`). In Production genauso: Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261116100000', 'proj6_purchase_claims');` — ohne die Tabelle werden Gast-Käufe nicht erfasst (Webhook antwortet 500).
- [ ] Migration `20261121100000_proj6_purchase_claim_mail_token.sql` (Spalte `purchase_claims.mail_token_hash` für den persönlichen Einlöse-Link in der Kauf-Mail). **Vor dem Code-Deploy einspielen**, sonst scheitert der Webhook bei Käufen ohne Konto. Keine RLS-Änderung. Stage: am 2026-11-21 eingespielt und geprüft.
- [ ] Migration `20261121110000_proj6_direct_gift.sql` (`projects.owner_id` darf bis zur Annahme eines Geschenks leer sein, neue Spalte `invitations.is_gift`). **Vor dem Code-Deploy einspielen**, sonst scheitern Geschenk-Käufe. Keine RLS-Änderung.
- [ ] Migration `20261122100000_proj11_mail_retry_queue.sql` (neue Tabelle `mail_retry_queue` für Mails, deren Versand gescheitert ist; RLS aktiv, keine Policies, nur Service-Role). **Vor dem Code-Deploy einspielen**, sonst werden gescheiterte Mails nicht nachgeholt. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122100000', 'proj11_mail_retry_queue');`. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261122110000_proj17_rate_limit.sql` (Zähler für die Rate-Limits, RLS aktiv, keine Policies, nur Service-Role). **Zwingend vor dem Code-Deploy einspielen, sonst kann sich niemand anmelden oder registrieren.** Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122110000', 'proj17_rate_limit');`. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Seed `supabase/seed.sql` (15 Erzähl-Impulse) in Production eingespielt; Leitfragen kommen aus der Migration `proj8_impulse_leading_questions`.
- [ ] Storage-Buckets aus `20260515200002_storage_buckets.sql` vorhanden (4 private Buckets).
- [ ] Testdaten **nicht** übernehmen: QA-Konto `qa-test@narravit.de`, Test-Projekte, Test-Zahlungen bleiben auf Stage.
- [ ] Migration `20261119200000_security_advisor_function_hardening.sql` (fester `search_path` für die Zeitstempel-Trigger, Trigger-Funktionen ohne RPC-Recht; Stage: am 2026-11-19 eingespielt und vermerkt — dabei versehentlich in einer Zwischenfassung, die auch die Rechte aus der nächsten Migration schon enthielt). Ohne Abhängigkeit zum Code, kann jederzeit eingespielt werden: Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261119200000', 'security_advisor_function_hardening');`.
- [ ] Migration `20261119210000_lookup_invitation_service_role_only.sql` (`lookup_invitation_by_token` nur noch für `service_role`; Stage: Rechte wirken schon seit 2026-11-19, die Datei nach dem Deploy trotzdem einmal ausführen — harmlos — und die Version vermerken). **Erst einspielen, wenn der Code mit dem Service-Role-Lookup ausgeliefert ist** — auf Stage nach abgeschlossenem Deploy von stage-app, in Production nach dem Merge `stage` → `main` und abgeschlossenem Deploy. Andersherum zeigt `/einladung/<token>` „Einladung nicht gefunden“, und Einladungen lassen sich nicht annehmen. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261119210000', 'lookup_invitation_service_role_only');`. Smoke-Test: Einladungslink abgemeldet öffnen (Vorschau mit Projekttitel) und angemeldet annehmen. Nach beiden Migrationen Dashboard → Advisors → Security: gewollt sind nur `rls_enabled_no_policy` (`mail_log`, `mail_retry_queue`, `purchase_claims`, `rate_limit_counters`), `anon_`/`authenticated_security_definer_function_executable` für die RLS-Hilfsfunktionen `get_my_project_ids`, `am_i_pl_of`, `is_member_of` und `auth_leaked_password_protection` (Dashboard-Schalter unter Auth). Jeder andere Hinweis ist neu und vor dem Go-live zu klären.
- [ ] Migration `20261122120000_proj17_account_exists.sql` (Login-Hinweis „Zu dieser E-Mail gibt es noch kein Konto", Funktion `account_exists` nur für `service_role`). Vor dem Code-Deploy einspielen. Fehlt sie, funktioniert der Login weiter, zeigt aber nur die neutrale Meldung „E-Mail oder Passwort falsch".
- [ ] Migration `20261122130000_proj3_project_survives_account_delete.sql` (ein Projekt bleibt bestehen, wenn das Konto des Eigentümers gelöscht wird). Keine RLS-Änderung, funktioniert auch mit dem alten Code, braucht vorher `20261121110000_proj6_direct_gift.sql`. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122130000', 'proj3_project_survives_account_delete');`. **Folge für den Support:** Die letzte Projektleitung eines Projekts lässt sich danach auch im Supabase-Dashboard nicht mehr löschen (Fehler 23514), solange das Projekt besteht und keine Nachfolge gesetzt ist. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261122140000_proj3_account_deletion.sql` (Löschablauf, Verlassen mit Nachfolge, Tabellen `chapter_contributors` und `storage_cleanup_queue`, RLS aktiv, keine Policies, nur Service-Role). **Vor dem Code-Deploy einspielen**, sonst lässt sich kein Konto löschen und kein Projekt verlassen. Braucht vorher `20261122130000_proj3_project_survives_account_delete.sql`. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122140000', 'proj3_account_deletion');`. Danach sind in den Advisors `rls_enabled_no_policy` für die beiden neuen Tabellen gewollt. Der SQL-Editor zeigt beim Ausführen eine Warnung wegen `DROP CONSTRAINT`; die Migration löscht dabei keine Daten. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261122150000_proj3_protect_project_owner.sql` (Mitglieder können den Eigentümer eines Projekts nicht mehr ändern; keine Änderung an RLS-Policies, funktioniert auch mit dem alten Code). Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122150000', 'proj3_protect_project_owner');`. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261122160000_proj26_trash.sql` (serverseitiger Papierkorb, vier neue Tabellen ohne Kundenzugriff, eine zusätzliche Sperr-Policy für Bilder gelöschter Kapitel, bestehende Policies unverändert). **Nach `20261122150000` und vor dem Code-Deploy einspielen**, sonst scheitern der Papierkorb-Lauf im Cron und die Prüfung wartender Mails. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122160000', 'proj26_trash');`. Danach sind in den Advisors `rls_enabled_no_policy` für die vier neuen Tabellen gewollt. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261122170000_proj26_trash_people.sql` (merkt sich Mitglieder und Mitschreibende gelöschter Kapitel in einer eigenen Tabelle ohne Kundenzugriff, bestehende Policies unverändert). **Nach `20261122160000` und vor dem Code-Deploy einspielen.** Der SQL-Editor warnt wegen `DROP COLUMN`; die Spalte wird vorher kopiert. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122170000', 'proj26_trash_people');`. Danach ist in den Advisors `rls_enabled_no_policy` für die neue Tabelle gewollt. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261122180000_proj6_access_rules.sql` (abgelaufene Projekte sind in der Datenbank schreibgeschützt, Projekte und Mitgliedschaften entstehen nur noch über den Server). **Änderung an RLS, von Jakob am 2026-11-22 freigegeben.** Nach `20261122170000` einspielen, funktioniert mit dem aktuellen Code. Der SQL-Editor warnt wegen `DROP POLICY`; es werden keine Daten gelöscht. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122180000', 'proj6_access_rules');`. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Migration `20261123100000_proj28_retention.sql` (Grund der Löschung im Papierkorb, Schonfristen ohne Kundenzugriff, Löschlauf 90 Tage nach dem Ablauf mit Bremse ab 51 fälligen Projekten). Bestehende RLS-Regeln bleiben unverändert. Nach `20261122180000` und **vor** dem Code-Deploy einspielen. Das Einspielen selbst verschiebt nichts. Der SQL-Editor warnt wegen `DROP FUNCTION`; es werden keine Daten gelöscht. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261123100000', 'proj28_retention');`. **Vor dem ersten Cron-Lauf in Production** mit `SELECT * FROM public.retention_due();` prüfen, welche Projekte sofort fällig wären. Stage: am 2026-11-23 eingespielt und geprüft.
- [ ] Migration `20261123110000_proj28_qa_fixes.sql` (abgelaufene Projekte sperren auch das Löschen von Kapiteln und Dateien, eine Zahlung holt ein wegen Ablauf verschobenes Projekt zurück, der Papierkorb-Lauf löscht kein bezahltes Projekt). **Änderung an RLS, von Jakob am 2026-11-23 freigegeben.** Nach `20261123100000` und **vor** dem Code-Deploy einspielen. Das Einspielen selbst verschiebt und löscht nichts. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261123110000', 'proj28_qa_fixes');`. Stage: am 2026-11-23 eingespielt und geprüft.
- [ ] Migration `20261123120000_proj24_narration.sql` (Erzähl-Einstellungen und kurzlebige Kauf-Vorbereitung, beide per RLS ohne Policies nur für die Service-Role, von Jakob freigegeben). **Vor dem Code-Deploy einspielen**, sonst gehen Kontaktdaten aus dem Onboarding verloren. Der Kauf selbst funktioniert auch ohne sie. Stage: am 2026-11-23 eingespielt, Rechte und RLS geprüft.
- [ ] Migration `20261123130000_proj24_gift_email_draft.sql` (Adresse für die Geschenk-Einladung liegt in der Kauf-Vorbereitung statt bei Stripe, RLS unverändert). Direkt nach `20261123120000_proj24_narration.sql` und **vor dem Code-Deploy** einspielen, sonst startet kein Geschenk „Auch am Computer“ mehr und Erzähl-Kontakte gehen verloren.

### Auth → URL Configuration

- [ ] Site URL: `https://app.narravit.de`
- [ ] Redirect URLs: `https://app.narravit.de/auth/callback**` (die App leitet alle Mail- und OAuth-Links über `/auth/callback?next=…`). Fehlt der Eintrag, sind die Links in den Bestätigungs- und Passwort-Mails kaputt, weil die Vorlagen `&token_hash=…` an die Adresse anhängen und Supabase dann auf die Site URL ohne `?` zurückfällt.

### Auth → SMTP (Mails über Resend)

- [ ] Custom SMTP aktiv: Host `smtp.resend.com`, Port 465, User `resend`, Passwort = eigener Resend-Schlüssel für Supabase-Production (nicht den App-Schlüssel teilen).
- [ ] Absender-Name **`NARRAVIT`** (Großbuchstaben, wie die App-Mails), Absender-Adresse wie auf Stage (auf `mail.narravit.de`).
- [ ] Mail-Rate-Limit unter Auth → Rate Limits passend setzen (mit eigenem SMTP frei wählbar): 300 pro Stunde wie auf Stage. Es gilt für das ganze Projekt: Ist es erreicht, schlagen weitere Registrierungen und Passwort-Resets fehl.

### Auth → Passwort-Sicherheit

- [ ] „Leaked password protection" einschalten (Abgleich mit HaveIBeenPwned, erst ab Supabase Pro verfügbar). Auf Stage laut Supabase-Advisor am 2026-11-19 aus.

### Auth → Rate Limits und CAPTCHA (PROJ-17)

- [ ] **Cloudflare Turnstile für Production anlegen:** Widget für `app.narravit.de`, Modus „Managed". Site Key nach Vercel, Secret Key nach Supabase. Cloudflare in die Datenschutzerklärung aufnehmen.
- [ ] **Authentication → Rate Limits anheben**, weil alle App-Anfragen von der Server-IP kommen: Registrierung und Anmeldung 300 pro 5 Minuten, Token (Passwort-Login und Refresh) 1000 pro 5 Minuten, Token-Prüfung 300 pro 5 Minuten. Die feinen Limits pro Kunde macht die App.
- [ ] **Authentication → Bot and Abuse Protection → CAPTCHA einschalten** (Cloudflare Turnstile, Secret Key eintragen). **Erst wenn der Code live ist**, sonst kann sich niemand mehr anmelden. Stage nutzt den öffentlichen Test-Secret-Key `1x0000000000000000000000000000000AA` (am 2026-11-22 eingeschaltet und geprüft, Auth-Limits ebenfalls gesetzt), Production den echten.
- [ ] **Kein `sb_secret_…`-Key für Auth-Aufrufe der App:** Supabase überspringt das CAPTCHA bei Admin-Rechten.

### Auth → Email Templates

- [ ] „Confirm signup" und „Reset password" aus `supabase/templates/` einsetzen (erzeugt aus `src/emails/auth/`). **Stage:** am 2026-11-21 von Jakob eingesetzt. **Production:** erst beim Umzug, direkt nach dem Merge (Abschnitt 1, Schritt 7). Nach jeder Änderung an `src/emails/` mit `UPDATE_AUTH_TEMPLATES=1 npx vitest run src/emails/auth` neu erzeugen und neu einsetzen. Die Fassung vom 2026-11-22 ergänzt nur den Umbruch langer Wörter: Auf Stage muss sie nicht neu eingesetzt werden, Production bekommt beim Umzug die aktuelle Datei.
- [ ] Die Vorlagen laden das Logo von `https://app.narravit.de/images/mail/` (siehe Abschnitt 5) — auf Stage erscheint es erst, wenn Production live ist.
- [ ] **Nur die aktuelle Fassung einsetzen:** Seit 2026-11-21 sind die Vorlagen reines ASCII, Umlaute stehen als HTML-Codes (`&#252;`). Vorher kamen sie beim Einsetzen auf Stage kaputt an („f√ºr" statt „für"). Kopieren mit `pbcopy < supabase/templates/<datei>.html`, danach eine Testmail prüfen.
- [ ] Ohne diese Vorlagen funktionieren Mail-Links nur im selben Browser (PKCE-Code statt Token-Hash) — für Production Pflicht.

### Auth → Providers

- [ ] **Google:** Provider aktiv; im Google-Cloud-OAuth-Client die Callback-URL des Production-Projekts (`https://<prod-ref>.supabase.co/auth/v1/callback`) als autorisierte Weiterleitungs-URI eintragen; OAuth-Zustimmungsbildschirm veröffentlicht („In production"), sonst nur Testnutzer.
- [ ] **Facebook:** Provider aktiv; in der Meta-App die Production-Callback-URL eintragen; App in den Live-Modus schalten (verlangt Datenschutz-URL und Datenlöschungs-URL).
- [ ] **Apple:** noch nicht gebaut (eigenes Ticket); später hier ergänzen. Die Vorlage „Reset password" nennt seit 2026-11-19 bereits „Apple, Google oder Facebook" — ohne Apple-Anmeldung zum Go-live den Satz anpassen.

---

## 4. Stripe

Stage läuft im **Test-Modus**. Production braucht den **Live-Modus** — alle Objekte dort neu anlegen.

- [ ] Stripe-Konto für Live-Zahlungen aktiviert (Unternehmensdaten, Bankkonto).
- [ ] Produkte im Live-Modus: „Portal-Zugang" **249 €** und „Portal-Zugang Verlängerung" **99 €** (Einmalzahlung). Hinweis: Der Test-Preis für den Erstkauf stand zuletzt auf 199 €.
- [ ] Kein Vapi-Produkt anlegen (archiviert).
- [ ] Webhook-Endpunkt im Live-Modus: `https://app.narravit.de/api/stripe/webhook`, Events `checkout.session.completed` **und** `checkout.session.async_payment_succeeded` → Secret in `STRIPE_WEBHOOK_SECRET`. Ohne das zweite Event bekommen Kunden mit verzögerter Zahlart (z. B. SEPA-Lastschrift) nach dem Geldeingang keinen Zugang.
- [ ] **Stage (Testmodus):** dasselbe zweite Event am Stage-Webhook-Endpunkt ergänzen (seit 2026-11-21 nötig).
- [ ] **Nur Stage:** Die Vercel-Deployment-Protection beantwortet Aufrufe ohne Freigabe mit 302 (geprüft 2026-11-21), Stripe wertet das als Fehler. Die Stage-Webhook-URL braucht deshalb `?x-vercel-protection-bypass=<Secret>` (Vercel → Settings → Deployment Protection → Protection Bypass for Automation). In Production gibt es keinen Schutz und keinen Parameter: Die Live-URL bleibt ohne Zusatz.
- [ ] **Coupon `BUCH50` im Live-Modus anlegen** (Test- und Live-Modus sind in Stripe getrennt, der Checkout erlaubt Codes über `allow_promotion_codes: true`): Coupon über **50 €** in EUR, Dauer „einmalig", **nur für das Live-Produkt „Portal-Zugang" (249 €)**, sonst gilt er auch für die Verlängerung über 99 €. Dazu der Promotion-Code `BUCH50` ohne Ablaufdatum, derselbe Wert in `WELCOME_DISCOUNT_CODE` (Production). Danach einmal im Live-Checkout prüfen, dass der Preis auf 199 € sinkt und der Code bei der Verlängerung abgelehnt wird. Ändert sich die Höhe, auch `WELCOME_DISCOUNT_LABEL` in `src/lib/email/welcome-discount.ts` anpassen.
- [ ] **Stage:** Der Code `BUCH50` zieht im Testmodus 50 € ab (Live-Test am 2026-11-22 bestanden). Noch prüfen, dass er nur für das Produkt „Portal-Zugang" gilt und kein Ablaufdatum hat. Die Mail nennt fest „50 € Rabatt".
- [ ] Checkout-Einstellungen: Links zu AGB und Datenschutz hinterlegen.
- [ ] MwSt.: **Entscheidung (Jakob, 2026-11-23): Kleinunternehmer nach § 19 UStG.** Stripe Tax bleibt aus, weder Stripe noch Rechnungen weisen Umsatzsteuer aus. Grenzen im Blick behalten: 25.000 € Umsatz im Vorjahr, 100.000 € im laufenden Jahr. Von der Steuerberatung bestätigen lassen. **Österreich:** Bis 10.000 € Verkäufe in andere EU-Länder pro Jahr gilt die deutsche Regelung (§ 3c Abs. 4 UStG), sofern das Buch aus Deutschland versendet wird. Darüber braucht es das Meldeverfahren nach § 19a UStG oder eine Umsatzsteuer-Registrierung. **Schweiz:** Versand, Zoll und Steuer mit der Druckerei klären, bis dahin nicht aktiv anbieten.
- [ ] Rechnungen: Checkout erzeugt derzeit keine Rechnungen; die Kauf-Mail zeigt den Rechnungs-Link nur, wenn eine Rechnung existiert (offene Entscheidung, PROJ-11 BUG-7). Der Bereich „Rechnungen" im persönlichen Bereich ist noch ein Platzhalter. **Entscheidung (Jakob, 2026-11-21): vor dem Go-live einbauen, Rechnungen laufen nur über Stripe.** Stripe erzeugt sie im Checkout (`invoice_creation`) und schickt sie an die Checkout-Adresse, das deckt auch Käufe ohne Konto ab. Auf jede Rechnung gehört der Hinweis „Steuerfrei als Kleinunternehmer gemäß § 19 UStG" (§ 33, § 34a UStDV). Vorher klären: Absenderdaten in Stripe (voller Name und Anschrift) und ob für Kunden aus Österreich und der Schweiz die Adresse im Checkout abgefragt werden muss. **Stand 2026-11-23:** Stripe berechnet 0,4 % pro Rechnung, höchstens 2 USD, also etwa 1,00 € beim Erstkauf (249 €) und 0,40 € bei der Verlängerung (99 €). Rechnungen bis 250 € brutto sind Kleinbetragsrechnungen (§ 33 UStDV) und brauchen keine Kundenadresse. NARRAVIT muss seine Rechnungen 8 Jahre aufbewahren (§ 14b UStG), deshalb regelmäßig aus Stripe exportieren oder eine Buchhaltung anbinden, mit Steuerberatung bestätigen. **Vorschlag, von Jakob noch zu bestätigen:** Die Tabelle im persönlichen Bereich entfällt, dort steht nur der Hinweis auf die Mail und den Support. Falls sie doch kommt: Rechnungs-Links nicht in `payments` speichern, weil alle Projektmitglieder diese Zeilen lesen dürfen.

---

## 5. Resend (Transaktionsmails)

- [ ] Domain `mail.narravit.de` ist verifiziert (DKIM `resend._domainkey.mail.narravit.de`, SPF/MX auf `send.mail.narravit.de`) — gilt für Stage und Production. Die Hauptdomain `narravit.de` ist **nicht** in Resend eingerichtet; Absender dort würden abgelehnt.
- [ ] Eigener API-Schlüssel `narravit-app-prod` (Sending access, nur `mail.narravit.de`) → Vercel `RESEND_API_KEY` (Production).
- [ ] Eigener Schlüssel für Supabase-SMTP in Production (Abschnitt 3).
- [ ] **Resend-Tarif prüfen:** Der Free-Tarif erlaubt 100 Mails pro Tag und 3.000 pro Monat (Stand 2026-11-22). Ein Neukunde löst 3 bis 5 Mails aus, das reicht also nur für etwa 20 bis 30 Neukunden am Tag. **Entscheidung Jakob (2026-11-22): Start im Free-Tarif.** Auf Pro wechseln (20 $ im Monat, 50.000 Mails, kein Tageslimit), sobald sich das Tageslimit nähert oder vor einer größeren Aktion.
- [ ] Stage-Schlüssel bleiben auf Stage; beim Umzug nicht wiederverwenden.
- [ ] Suppression-Liste prüfen: Adressen aus Tests (z. B. `qa-test@narravit.de`) stehen dort; echte Kundenadressen dürfen nicht darauf landen.
- [ ] **Bilder in Mails** (Logo im Kopf jeder Mail, Strandfoto in der Willkommens-Mail) liegen in `public/images/mail/` und werden **immer** von `https://app.narravit.de/images/mail/…` geladen (`MAIL_ASSETS_URL` in `src/emails/Layout.tsx`), auch in Stage-Mails und Supabase-Vorlagen. Grund: Stage ist per Vercel-Deployment-Protection gesperrt, Mail-Programme kämen dort nicht an die Bilder. **Stand 2026-11-19:** `app.narravit.de` liefert diese App noch nicht aus (`/images/…` → 404), deshalb zeigen Mails bis zum Go-live keine Bilder (das Layout bleibt intakt, der Schriftzug „NARRAVIT" steht als Text da). Nach dem Umzug prüfen: `https://app.narravit.de/images/mail/narravit-logo.png` und `…/willkommen-strand.jpg` liefern 200.
- [ ] **Gescheiterte Mails:** Der tägliche Cron holt sie aus `mail_retry_queue` bis zu dreimal nach. Klappt das nicht, geht ein Hinweis ohne Empfängerdaten an `kontakt@narravit.de`, dieses Postfach muss also gelesen werden. Scheitert auch der Hinweis, versucht der nächste Lauf beides erneut. Nach dem angekommenen Hinweis stehen Empfänger und Fehler noch 30 Tage in der Tabelle. Eine Kontolöschung entfernt die Mails an diese Person und ihren Namen aus Mails an andere. Die Speicherung in die Datenschutzerklärung aufnehmen.

---

## 6. Mail-Adressen

| Zweck | Adresse | Wo eingetragen |
|---|---|---|
| Absender App-Mails | `NARRAVIT <no-reply@mail.narravit.de>` | Code-Fallback bzw. `EMAIL_FROM` |
| Absender Supabase-Auth-Mails | Name `NARRAVIT`, Adresse auf `mail.narravit.de` | Supabase → Auth → SMTP |
| Support / Kontakt in allen Mails | `kontakt@narravit.de` | `src/emails/Layout.tsx` (Footer), Willkommens-Mail |
| Test-Empfänger Stage | `kontakt@narravit.de` | Vercel `EMAIL_TEST_RECIPIENT` (nur Stage) |

`narravit.de` selbst läuft über Google Workspace (Postfach `kontakt@`) — unabhängig von Resend.

---

## 7. Domains & DNS

- [ ] `app.narravit.de` → Vercel (Production).
- [ ] `stage-app.narravit.de` bleibt auf Stage.
- [ ] Website `narravit.de` / `www.narravit.de`: liefert Stand 2026-10-14 überall 404 (Webflow nicht veröffentlicht). Vor Go-live muss sie erreichbar sein, falls Mails oder App dorthin verlinken.
- [ ] Landingpage: Button „Jetzt kaufen" verlinkt auf `https://app.narravit.de/onboarding` (optional `?for=self` / `?for=gift`) — **nicht** auf `/registrieren`. Der Kauf läuft ohne Anmeldung; das Konto wird nach dem Checkout angelegt (PROJ-6, 2026-11-16). Auf Stage entsprechend `https://stage-app.narravit.de/onboarding`.

---

## 8. Rechtliches

- [ ] Impressum — liegt auf der Webflow-Website unter `https://www.narravit.de/impressum`. Der Footer jeder Mail (App-Mails und Supabase-Vorlagen) verlinkt **fest** dorthin, auf Stage wie in Production; die Seite muss also erreichbar und vollständig sein (PROJ-11 BUG-1). **Stand 2026-11-23:** liefert noch 404, ebenso die Startseite auf `narravit.de` und `www.narravit.de`. Die Domains zeigen auf Webflow, die Version auf `narravit-24f326.webflow.io` läuft. Beim Veröffentlichen in Webflow beide Domains mit auswählen.
- [x] Pflichtangaben in Mails: NARRAVIT ist **nicht** im Handelsregister eingetragen (Jakob, 2026-11-19). Die Geschäftsbrief-Pflichtangaben (§ 37a HGB, § 35a GmbHG) gelten damit nicht, der Impressum-Link im Fuß jeder Mail genügt; der Platzhalter ist aus den Supabase-Vorlagen entfernt. **Neu prüfen, falls sich die Rechtsform ändert** (Eintragung, UG/GmbH) — dann gehören Firma, Rechtsform, Sitz, Registergericht, Registernummer und ggf. Geschäftsführung in **jede** geschäftliche Mail (`src/emails/Layout.tsx`).
- [ ] **Rechtsform (Jakob, 2026-11-23):** voraussichtlich Einzelunternehmen, keine UG. Impressum und Stripe-Rechnungen brauchen den vollständigen Namen und eine ladungsfähige Anschrift. Steuerstatus: Kleinunternehmer (§ 19 UStG). Auf der Webflow-Seite noch korrigieren: Kontakt nennt „NARRAVIT GmbH, Musterstraße 42, Berlin", Über uns nennt „Geschäftsführer".
- [ ] **Aufbewahrung 90 Tage:** Die Erinnerungs-Mails 08/09 und das Zugangsfeld im Lesemodus versprechen, dass Inhalte nach Ablauf noch 90 Tage gespeichert und dann **endgültig gelöscht** werden (`CONTENT_RETENTION_DAYS`). Die Löschung ist noch nicht gebaut und steht nicht in AGB/Datenschutz. **Entscheidung Jakob (2026-11-22):** Projekte laufen mit dem Projektzugang aus, umgesetzt in PROJ-28 (auch nie angenommene Geschenke, PROJ-3 BUG-4). Keine neuen Mails. Das Projekt bleibt 90 Tage im Lesemodus sichtbar, kommt dann in den Papierkorb und ist nach 104 Tagen endgültig gelöscht. Die Datenschutzerklärung muss diese Speicherdauer nennen.
- [ ] Datenschutzerklärung (auch für Facebook-App und Stripe-Checkout nötig).
- [ ] **Datenschutzerklärung nennt die 14 Tage aus PROJ-26:** Gelöschte Kapitel und Projekte bleiben bis zu 14 Tage gespeichert (Art. 13 Abs. 2 lit. a DSGVO).
- [ ] **Lösch-Dialoge anwaltlich prüfen (PROJ-26):** Sie sagen „unwiderruflich" und „Eine Wiederherstellung ist nicht möglich", obwohl der Support 14 Tage lang wiederherstellen kann. Jakob lässt den Text vorerst so (2026-11-22). Risiko: Transparenzgebot, Art. 5 Abs. 1 lit. a DSGVO. Alternative steht in der PROJ-26-Spec.
- [ ] Datenschutzerklärung nennt den Kauf ohne Konto: Speicherung der Checkout-E-Mail-Adresse bis zur Konto-Anlage (`purchase_claims`) und das technisch notwendige Cookie `nv_kauf` (Zuordnung des Kaufs, 60 Tage).
- [ ] AGB und Widerrufsbelehrung für den Kauf.
- [ ] **AGB nach Rollen (Jakob, 2026-11-22):** Käufer, Projektleitung, Co-Autor, beschenkte Person und später die erzählende Person ohne Konto (PROJ-12) haben unterschiedliche Rechte und Pflichten. Die AGB regeln mindestens, wer Vertragspartner ist, wer einladen, übergeben und löschen darf und was mit Beiträgen nach dem Verlassen oder der Kontolöschung passiert. Für gemeinsame Projekte: einfaches, auf dieses Buch begrenztes Nutzungsrecht, die Nutzungsarten ausdrücklich nennen (speichern, bearbeiten, drucken). Das Urheberrecht selbst bleibt bei der Person, die den Text geschrieben hat (§ 29 UrhG). Anwaltlich prüfen lassen.
- [ ] **Zustimmung zu den AGB einbauen:** Heute stimmt niemand Bedingungen zu, weder bei der Registrierung noch beim Kauf noch beim Annehmen einer Einladung (geprüft 2026-11-22). Ohne wirksame Einbeziehung (§ 305 Abs. 2 BGB) gilt die Nutzungsrechte-Klausel nicht, vor allem nicht für Co-Autoren, die selbst nichts gekauft haben.
- [ ] **Anfragen zu Löschung und Kopie über den Support:** Sonderfälle wie das Entfernen eigener Texte aus einem gemeinsamen Projekt oder eine Kopie der eigenen Inhalte werden auf Anfrage geklärt. Antwort binnen eines Monats (Art. 12 DSGVO), Entscheidung und Begründung dokumentieren, bei einer Ablehnung auf das Beschwerderecht hinweisen. Die AGB können Löschung und Kopie nach Art. 15, 17 und 20 DSGVO nicht ausschließen. Eine Kopie umfasst die eigenen Texte und selbst hochgeladenen Bilder in einem gängigen Format, die erste ist kostenlos; druckfertige Dateien, Satz, Layout und Cover gehören nicht dazu. Die Datenschutzerklärung muss diese Rechte nennen (Art. 13 DSGVO), der Lösch-Dialog nicht.
- [ ] **Kontaktdaten Dritter (PROJ-24, PROJ-12):** Käufer geben beim Geschenk E-Mail oder Handynummer der beschenkten Person an, ein Einverständnis-Häkchen gibt es nicht (Jakob, 2026-11-23). Anwaltlich klären: Service oder Werbung (§ 7 Abs. 2 Nr. 2 UWG), Haftung für den von Dritten ausgelösten Versand (BGH I ZR 208/12), Information spätestens mit der ersten Nachricht (Art. 14 DSGVO). Datenschutzerklärung ergänzen.
- [ ] **Leistung im Preis (Jakob, 2026-11-23):** Die 249 € enthalten das erste gedruckte Hardcover-Buch. Website, AGB, Kaufschritt und PROJ-16 müssen dasselbe sagen, die Druckkosten sind mit der Druckerei abzusichern.
- [ ] **Ablehnen und Widerrufen in Erzähl-Aufforderungen (PROJ-12):** Die erzählende Person muss ab der ersten Nachricht ablehnen und widerrufen können (Jakob, 2026-11-23). Ohne diese Funktion darf der Versand nicht live gehen.

---

## 9. Go-live-Blocker (Features)

- [ ] **Keine Bypass-Tokens in Production (Jakob, 2026-11-22, Pflicht vor dem Go-live):** `x-vercel-protection-bypass` darf in keiner Production-URL und keiner Production-Einstellung stehen. Prüfen:
  - Stripe Live-Webhook lautet exakt `https://app.narravit.de/api/stripe/webhook`, ohne Parameter.
  - `app.narravit.de` liegt nicht hinter der Vercel-Deployment-Protection, ein Bypass ist dort also gar nicht nötig.
  - Keine Bypass-Werte in den Production-Variablen, in Supabase, Resend oder anderen Diensten.
  - `git grep -n "x-vercel-protection-bypass" -- src` liefert nichts.
  - Der Stage-Webhook in Stripe (Testmodus) ist von den Live-Endpunkten getrennt. Ein auf Stage genutzter Bypass-Wert wird nach dem Umzug in Vercel widerrufen, falls Stage ihn nicht mehr braucht.
- [ ] PROJ-17 Rate-Limiting für Auth-Endpunkte: Migration (Abschnitt 3), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Abschnitt 2), Auth-Limits und CAPTCHA (Abschnitt 3). **CAPTCHA in Production erst einschalten, wenn der Code live ist.** Eine spätere Content-Security-Policy (PROJ-19) muss `https://challenges.cloudflare.com` für Skripte und Frames erlauben.
- [ ] **PROJ-3 Konto-Löschen neu (Pflicht vor dem Go-live):** Heute kann eine Kontolöschung ganze Projekte anderer Personen vernichten. Regeln stehen in der PROJ-3-Spec.
- [ ] **PROJ-26 Papierkorb (Jakob, 2026-11-22):** 14 Tage für alle gelöschten Kapitel und Projekte, nur serverseitig und ohne Hinweis im Interface. Wiederherstellen geht nur über den Support, Ablauf in `docs/production/support-papierkorb.md`. Das endgültige Löschen entfernt auch die Bilder aus dem Speicher (löst PROJ-19 BUG-2). QA bestanden (Approved), zwei Migrationen vor dem Code-Deploy einspielen.
- [ ] **PROJ-27 Zustimmung zu den AGB (Jakob, 2026-11-22):** bei Registrierung, Kauf und Annahme einer Einladung. Wird als letztes Feature vor dem Go-live gebaut, bei Bedarf zuerst mit Platzhaltern. Jakob lässt die AGB anwaltlich beraten. **Live nur mit dem finalen Text.** Spec fehlt noch, siehe Abschnitt 8.
- [ ] **Zugriffsregeln in Production (PROJ-6 G6, G14, G15):** Auf Stage geschlossen. In Production greifen sie erst mit Migration `20261122180000_proj6_access_rules.sql` (Abschnitt 3). Ohne sie bleiben abgelaufene Projekte über die API beschreibbar.
- [ ] **PROJ-28 Aufbewahrung, Lesemodus und automatische Löschung:** Nach Ablauf bleibt das Projekt 90 Tage lesbar, danach kommt es in den Papierkorb und ist nach weiteren 14 Tagen endgültig gelöscht. Die Erinnerungsmails bekommen dafür korrekte Texte. Lesemodus und Löschlauf sind gebaut, QA bestanden (Approved), alle 6 Bugs behoben. Vor dem Go-live den Lesemodus einmal in Safari prüfen. **Beides nur gemeinsam live nehmen**, weil das Zugangsfeld die Löschung ankündigt. Die Migration aus Abschnitt 3 muss vor dem Code-Deploy eingespielt sein. Greift die Bremse, geht täglich ein Hinweis an `kontakt@narravit.de`, Ablauf in `docs/production/support-papierkorb.md`, Abschnitt 7. Figma-Frames 08 und 09 noch auf den neuen Mailtext bringen.
- [ ] PROJ-19 Production-Hardening (Security-Header, Konfigurationsprüfung beim Build, zentrale App-Adresse). Eine erneute Identitätsprüfung vor dem Konto-Löschen wird nicht gebaut (Jakob, 2026-11-23), es bleibt bei `LÖSCHEN`.
- [ ] **Webflow bettet die App nicht per iframe ein (PROJ-19):** Die App verbietet das Einbetten. Im Custom Code der Website steht kein iframe (geprüft 2026-11-22). Embed-Elemente auf den Seiten ließen sich so nicht prüfen, deshalb nach der Veröffentlichung der Website einmal durchklicken.
- [ ] **Content-Security-Policy scharf schalten (PROJ-19):** Aktiv ist nur der kleine Kern, der Rest läuft im Beobachtungsmodus. Nach echtem Betrieb die Meldungen auswerten (Anbindung mit PROJ-13) und dann entscheiden. Meldungen zu `vercel.live` auf Stage kommen von der Vercel-Werkzeugleiste auf Preview-Deployments und gehören nicht in die Regel.
- [ ] PROJ-12 Audio-Erzählen live, sonst Mail-Texte zum „Erzählen per Sprachnachricht" anpassen (PROJ-11 BUG-9). Bringt SMS-Anbieter (seven.io) und Transkriptions-/LLM-Schlüssel mit — dann hier ergänzen.
- [ ] **PROJ-29 Webflow-Seite:** auf `narravit.de` und `www.narravit.de` veröffentlichen. Schriften lokal hosten, sie laden derzeit extern von Google (`fonts.googleapis.com`, `ajax.googleapis.com`). Cookie-Banner nur nötig, wenn Tracking oder Marketing dazukommt, dann vor dem Laden einwilligen lassen. Meta-Beschreibungen ergänzen, „per Telefon" in der Startseiten-Beschreibung ersetzen, Open-Graph-Bilder und strukturierte Daten setzen, die Seite „Not live" aus der Sitemap nehmen.
- [ ] **PROJ-22 Druck-Karte (Jakob, 2026-11-23):** Die Karte „Buch in den Druck geben" in der Projektübersicht ist bis PROJ-16 ein Platzhalter mit gesperrten Buttons. Sie darf so nicht live gehen: Vor dem Go-live ist PROJ-16 fertig, oder die Karte wird für Production ausgeblendet.
- [ ] **PROJ-22 in Safari und Firefox ansehen:** Automatisiert ist das neue Design nur in Chromium geprüft, WebKit startet auf dem Entwicklungs-Mac nicht. Startseite, Projektübersicht und Persönlichen Bereich vor dem Go-live einmal in beiden Browsern und auf einem echten iPad öffnen.
- [ ] **PROJ-24 in Safari und Firefox ansehen:** Das Onboarding ist automatisiert nur in Chromium geprüft. Vor dem Go-live alle Schritte in beiden Browsern durchgehen, vor allem die Handynummer und die Rückkehr nach einem Stripe-Abbruch.
- [ ] **Interne Kennungen in Kundentexten entfernen:** In der Projektübersicht stehen noch „(PROJ-12)" bei „Erzählen per Sprachnachricht" und „(PROJ-6)" beim Projektzugang vor der ersten Zahlung. Beide Texte vor dem Go-live ersetzen.
- [ ] **PROJ-24 und PROJ-12 nur gemeinsam live:** Das neue Onboarding fragt Kontaktdaten für Erzähl-Impulse ab. Ohne den Versand aus PROJ-12 würde es Nachrichten versprechen, die nie ankommen. Migration `20261123120000_proj24_narration.sql` in Production vor dem Code-Deploy einspielen.
- [ ] **Stripe-Produkt prüfen (PROJ-24):** Produktname und Beschreibung im Stripe-Testmodus und im Live-Modus müssen das erste gedruckte Hardcover-Buch nennen, weil sie auf Checkout und Rechnung erscheinen.
- [ ] **Server-Region Frankfurt in Production prüfen (PROJ-30):** `vercel.json` legt die Funktionen auf `fra1`, direkt neben die Datenbank (`eu-central-1`). Auf Stage ist das aktiv, Production bekommt es mit dem Merge auf `main`. Danach im Deployment prüfen, dass die Funktionen in `fra1` laufen, und den Standort in der Datenschutzerklärung korrekt nennen.
- [ ] PROJ-13 Fehler-Monitoring (Sentry) — dann `SENTRY_DSN` o. ä. hier ergänzen.
- [ ] PROJ-12 Paket „Erzähl-Einstellungen": Onboarding-Schritt „Wie soll [Name] die wöchentlichen Erzähl-Impulse erhalten? — Telefon, E-Mail oder beides" samt Kontaktdaten, plus Sektion in der Projektübersicht. Ohne ihn fehlen bei Geschenk-Käufen die Kontaktdaten der erzählenden Person (Jakob, 2026-11-19).
- [x] Mail-Design aus Figma (Datei „NARRAVIT Mails") in `src/emails/` übertragen; Logo dafür hosten. Erledigt 2026-11-19 (Bilder siehe Abschnitt 5).

---

## 10. Smoke-Tests nach dem Umzug

- [ ] Registrierung mit E-Mail: Bestätigungs-Mail kommt an, Link funktioniert auch in einem anderen Browser, Willkommens-Mail kommt.
- [ ] Anmeldung, Registrierung und „Passwort vergessen" mit dem echten Turnstile-Schlüssel, auch einmal auf dem Smartphone.
- [ ] Sechs falsche Passwörter hintereinander: Beim sechsten erscheint „Zu viele Versuche".
- [ ] Direkter Aufruf der Supabase-Anmeldung mit gefälschtem CAPTCHA-Token wird abgelehnt (`captcha_failed`). Auf Stage ist das nicht prüfbar, weil der Test-Secret jedes Token akzeptiert.
- [ ] Das Login-Limit lässt sich nicht mit einem selbst gesetzten `X-Forwarded-For`-Header umgehen: sechs falsche Anmeldungen mit wechselndem Header, die sechste zeigt „Zu viele Versuche". Das bestätigt, dass Vercel den Header überschreibt (PROJ-17).
- [ ] Anmeldung mit Google und mit Facebook.
- [ ] „Passwort vergessen" für ein E-Mail-Konto und für ein Google-Konto.
- [ ] Echter Kauf (kleiner Betrag per Promotion-Code oder sofortige Erstattung): Projekt entsteht, Kauf-Mail kommt, Webhook in Stripe als zugestellt markiert.
- [ ] Kauf **ohne Konto** von der Landingpage: Checkout ohne Anmeldung, Mail „Konto anlegen" kommt an, nach der Registrierung ist das Projekt da. Zusätzlich einmal mit abweichender E-Mail-Adresse im selben Browser und einmal über den Mail-Link auf einem anderen Gerät.
- [ ] Geschenk-Kauf „Auch am Computer schreiben": Einladung an die beschenkte Person kommt an.
- [ ] Geschenk-Kauf **ohne Konto**: Einladung an die beschenkte Person kommt an, sobald der Käufer sein Konto angelegt hat.
- [ ] Einladung über „Nutzer hinzufügen" kommt an.
- [ ] Cron: In Vercel unter Settings → Cron Jobs ist `/api/cron/reminders` eingetragen (täglich 9:00 UTC, erscheint erst nach dem Merge auf `main`); `CRON_SECRET` ist in Production gesetzt. Einmal über **Run** auslösen, in den Logs muss 200 stehen.
- [ ] Löschlauf (PROJ-28): Die Antwort des ersten Cron-Laufs enthält `retention` mit `braked: false` und `failed: 0`. Lesemodus eines abgelaufenen Testprojekts einmal in Safari öffnen.
- [ ] Verlängerung eines abgelaufenen Testprojekts mit echtem Checkout: Projekt ist danach sofort wieder bearbeitbar (PROJ-28).
- [ ] Mail-Links zeigen auf `app.narravit.de`, nicht auf `stage-app`.
- [ ] In Stripe (Live) steht beim Webhook kein `x-vercel-protection-bypass` in der URL (Abschnitt 9).
- [ ] Logo und Willkommens-Foto werden in den Mails angezeigt (Abschnitt 5).
- [ ] Sicherheits-Header: `curl -I https://app.narravit.de/anmelden` zeigt `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` ohne `preload` und kein `X-Powered-By`.
- [ ] Konto-Löschen mit zwei Testkonten in einem gemeinsamen Projekt: Die Nachfolge bekommt die Mail, das Projekt und alle Kapitel bleiben, das gelöschte Konto kann sich nicht mehr anmelden.

---

## Änderungsprotokoll

| Datum | Eintrag |
|---|---|
| 2026-11-23 | PROJ-24 Approved: echter Stripe-Testkauf auf Stage bestanden. Offen vor dem Go-live: Prüfung in Safari und Firefox. |
| 2026-11-23 | PROJ-24 QA-Fixes: Migration `20261123130000_proj24_gift_email_draft.sql`, auf Stage und Production jeweils vor dem Code-Deploy einspielen. Die E-Mail der beschenkten Person geht nicht mehr an Stripe. Keine neuen Env-Werte, keine neuen Stripe-Events. |
| 2026-11-23 | PROJ-24 Backend: Migration `20261123120000_proj24_narration.sql`, auf Stage und Production jeweils vor dem Code-Deploy einspielen. Keine neuen Env-Werte, keine neuen Stripe-Events. |
| 2026-11-23 | PROJ-30: Vercel-Funktionen per `vercel.json` von `iad1` nach `fra1` verlegt, zuerst nur auf Stage. |
| 2026-11-23 | PROJ-24 Anpassungen: Einverständnis-Häkchen entfernt, Ablehnen und Widerrufen ab der ersten Nachricht als Go-live-Blocker für PROJ-12 eingetragen. |
| 2026-11-23 | PROJ-24 Frontend: neues Paket `libphonenumber-js`. Der Schritt „Erzähl-Impulse" speichert bis zum Backend noch nichts. Keine Migration, keine neuen Env-Werte. |
| 2026-11-23 | PROJ-24 Tech Design: gemeinsamer Go-live mit PROJ-12 und Stripe-Produkttext ergänzt. |
| 2026-11-23 | PROJ-24 spezifiziert: Kontaktdaten Dritter und Leistung im Preis als Rechtspunkte ergänzt. |
| 2026-11-23 | PROJ-22 QA: Prüfung in Safari und Firefox als Go-live-Punkt ergänzt. |
| 2026-11-23 | PROJ-22 Frontend: Druck-Karte als Go-live-Blocker eingetragen, interne Kennungen in zwei Kundentexten vermerkt. Keine Migration, keine neuen Env-Werte. |
| 2026-11-23 | PROJ-22 spezifiziert. Umsatzsteuer für Österreich und Schweiz ergänzt. |
| 2026-11-23 | Rechtsform: voraussichtlich Einzelunternehmen, Kleinunternehmer nach § 19 UStG. Stripe Tax bleibt aus, Rechnungs-Hinweis ergänzt, falsche Firmenangaben auf Webflow vermerkt. |
| 2026-11-23 | PROJ-29: Umfang und Befunde zur Webflow-Seite ergänzt (Schriften, Cookies, SEO, Sitemap). |
| 2026-11-23 | Rechnungen: Kosten, Kleinbetragsrechnung und Aufbewahrung ergänzt. Neues Roadmap-Projekt PROJ-29 für die Webflow-Seite. |
| 2026-11-23 | PROJ-19 Abschnitt I verworfen: keine Identitätsprüfung vor dem Konto-Löschen, keine neue Mail, keine Migration. Risiko von Jakob bewusst akzeptiert. |
| 2026-11-23 | PROJ-28 Approved: alle 6 QA-Bugs behoben und auf Stage nachgetestet, beide Migrationen dort aktiv. Zwei neue Smoke-Tests in Abschnitt 10. |
| 2026-11-23 | PROJ-28 QA-Fixes: neue Migration `20261123110000_proj28_qa_fixes.sql` (vor dem Code-Deploy, RLS-Änderung von Jakob freigegeben). Kein neuer Env-Wert. |
| 2026-11-23 | PROJ-28 QA: 21 von 24 Kriterien, 6 Bugs (2 High, 1 Medium, 3 Low), Status In Review. Kein neuer Env-Wert. |
| 2026-11-23 | PROJ-28 Backend: neue Migration `20261123100000_proj28_retention.sql` (vor dem Code-Deploy), Löschlauf im täglichen Cron, interne Hinweis-Mail bei greifender Bremse, Support-Anleitung Abschnitt 7. Kein neuer Env-Wert. |
| 2026-11-23 | PROJ-28 Frontend gebaut: Lesemodus statt Umleitung, neue Mailtexte. Keine Migration und kein neuer Env-Wert in diesem Schritt. Nur zusammen mit dem Backend live nehmen. |
| 2026-11-22 | PROJ-28 spezifiziert: keine neuen Mails, 90 Tage Lesemodus, danach Papierkorb, endgültig nach 104 Tagen. Neu für den Go-live: Speicherdauer in der Datenschutzerklärung. Kein neuer Env-Wert. |
| 2026-11-22 | Zugriffsregeln nachgeschärft (PROJ-6 G6, G14, G15): neue Migration `20261122180000_proj6_access_rules.sql`, auf Stage aktiv und geprüft. Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-27 AGB-Zustimmung ans Ende verschoben (Jakob): zuerst anwaltliche Beratung, Ablauf bei Bedarf mit Platzhaltern, live nur mit finalem Text. |
| 2026-11-22 | PROJ-26 QA-Fixes: neue Migration `20261122170000_proj26_trash_people.sql` (vor dem Code-Deploy). Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-26 Backend: neue Migration `20261122160000_proj26_trash.sql` (vor dem Code-Deploy), Support-Anleitung `docs/production/support-papierkorb.md`, interne Hinweis-Mail bei Zahlung für ein gelöschtes Projekt. Der tägliche Cron löscht fällige Inhalte endgültig. Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-26 spezifiziert: serverseitiger Papierkorb, Wiederherstellen nur über den Support. Neu für den Go-live: 14 Tage in der Datenschutzerklärung, anwaltliche Prüfung der Lösch-Dialoge, Support-Ablauf. Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-19 auf Stage geprüft (`391f93d`): Alle Sicherheits-Header stimmen, Turnstile lädt unter der CSP. Die einzigen CSP-Meldungen betreffen `vercel.live` (nur Preview). Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-19 gebaut: Sicherheits-Header, Konfigurationsprüfung beim Build, zentrale App-Adresse. **Die sieben fehlenden Production-Werte müssen vor dem Merge auf `main` stehen** (Abschnitt 1, Schritt 5). Keine Migration, keine neue Variable. |
| 2026-11-22 | PROJ-3 BUG-7: neue Migration `20261122150000_proj3_protect_project_owner.sql`. Neuer Go-live-Blocker PROJ-28 (Aufbewahrung), Identitätsprüfung vor dem Konto-Löschen wandert zu PROJ-19. Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-3: neue Migration `20261122140000_proj3_account_deletion.sql` (vor dem Code-Deploy), neue Mail „Sie leiten jetzt dieses Projekt", der tägliche Cron räumt zusätzlich Dateien gelöschter Projekte auf. Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-3: neue Migration `20261122130000_proj3_project_survives_account_delete.sql`, schließt die Lücke beim Konto-Löschen. Kein neuer Env-Wert. |
| 2026-11-22 | Rechtliches ergänzt (Konto-Löschen, PROJ-3): AGB nach Rollen, Zustimmung zu den AGB fehlt noch in Registrierung, Kauf und Einladung, Support-Ablauf für Lösch- und Kopie-Anfragen. Neue Go-live-Blocker: PROJ-3 Konto-Löschen, PROJ-26 Papierkorb, PROJ-27 AGB-Zustimmung. Kein neuer Env-Wert. |
| 2026-11-22 | PROJ-17 Approved. Neue Prüfung nach dem Go-live: Login-Limit gegen gefälschten `X-Forwarded-For`-Header. |
| 2026-11-22 | PROJ-17 BUG-4: Neue Migration `20261122120000_proj17_account_exists.sql` für den Login-Hinweis „kein Konto" (Entscheidung Jakob). Keine neue Variable. |
| 2026-11-22 | Tarife entschieden (Jakob): Supabase wird bereits bezahlt, Vercel Pro kurz vor dem Go-live, Cloudflare Turnstile und Resend starten im Free-Tarif. |
| 2026-11-22 | Mail-Kontingent ergänzt: Resend-Tarif vor dem Go-live prüfen, Vorschlag für das Supabase-Mail-Limit. |
| 2026-11-22 | PROJ-17 gebaut: Migration `20261122110000_proj17_rate_limit.sql` (vor dem Code-Deploy), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Auth-Limits anheben, CAPTCHA nach dem Deploy einschalten. Die geplante IP-Weitergabe per Secret Key entfällt. |
| 2026-11-22 | Neue Go-live-Pflichten: Vercel Pro statt Hobby (kommerzielle Nutzung), Function-Region von `iad1` in die EU. PROJ-17 Tech Design: Zähler in Supabase, Cloudflare Turnstile. |
| 2026-11-22 | PROJ-11 BUG-19/20: Der Support-Hinweis wird bis zur Zustellung wiederholt, die Kontolöschung räumt `mail_retry_queue` auf. Keine neue Migration, kein neuer Env-Wert. |
| 2026-11-22 | Willkommens-Rabatt: neue Env-Variable `WELCOME_DISCOUNT_CODE` = `BUCH50` (Stage und Production). Der Coupon über 50 € nur für den Erstkauf muss im Stripe-Live-Modus noch angelegt werden. `EMAIL_TEST_RECIPIENT` von Jakob für Production entfernt (geprüft). |
| 2026-11-22 | PROJ-11 BUG-13: neue Migration `20261122100000_proj11_mail_retry_queue.sql`, auf Stage und Production jeweils **vor** dem Code-Deploy. Gescheiterte Mails werden täglich nachgeholt, Hinweis an `kontakt@narravit.de`. Kein neuer Env-Wert. |
| 2026-11-22 | QA PROJ-11: `EMAIL_TEST_RECIPIENT` ist in Vercel auch für Production gesetzt und muss dort entfernt werden. `RESEND_API_KEY` und `CRON_SECRET` fehlen in Production noch. Hinweis zu den Redirect URLs ergänzt. |
| 2026-11-22 | Reminder-Cron auf Stage von Hand erfolgreich ausgelöst. `CRON_SECRET` existiert in Vercel nur für Preview und Development und muss vor dem Go-live für Production angelegt werden. Geklärt: Stage läuft als Preview, Production-Branch ist `main`. |
| 2026-11-22 | Go-live-Blocker ergänzt: keine Bypass-Tokens in Production-URLs oder -Einstellungen. `CRON_SECRET` auf Stage von Jakob neu gesetzt. Kein neuer Env-Wert. |
| 2026-11-21 | Cron: `/api/cron` ist von der Middleware ausgenommen (wurde auf `/anmelden` umgeleitet). Vercel führt Cron-Jobs nur für Production-Deployments aus und liest sie aus `vercel.json`; `main` hat die Datei noch nicht, deshalb erscheint unter Settings → Cron Jobs erst nach dem Merge ein Eintrag. Kein neuer Env-Wert. |
| 2026-11-21 | Geschenk ohne eigenen Zugang läuft ohne Konto: Projekt und Einladung entstehen direkt nach der Zahlung. Neue Migration `20261121110000_proj6_direct_gift.sql`, auf Stage und Production jeweils **vor** dem Code-Deploy. Kein neuer Env-Wert. |
| 2026-11-21 | Persönlicher Einlöse-Link in der Kauf-Mail (`/kauf-zuordnen`): neue Migration `20261121100000_proj6_purchase_claim_mail_token.sql`, auf Stage und Production jeweils **vor** dem Code-Deploy einspielen. Kein neuer Env-Wert. |
| 2026-11-21 | Das HTML aller Mails (App-Mails und Supabase-Vorlagen) ist jetzt reines ASCII, Umlaute und Sonderzeichen stehen als HTML-Codes, weil sie auf Stage kaputt ankamen. Supabase-Vorlagen auf Stage eingesetzt; in Production erst direkt nach dem Merge (Abschnitt 1, Schritt 7). Stage-Webhook-URL braucht den Vercel-Bypass-Parameter (Abschnitt 4). |
| 2026-11-21 | PROJ-6-Fixes: Stripe-Webhook braucht zusätzlich das Event `checkout.session.async_payment_succeeded` (Stage und Production, Abschnitt 4). Keine Migration, kein neuer Env-Wert. |
| 2026-11-19 | Kein Handelsregistereintrag → keine Pflichtangaben in Mails, Impressum-Link genügt. Platzhalter aus den Supabase-Vorlagen entfernt, Vorlagen neu erzeugt (vor dem Einsetzen auf Stage die neue Fassung nehmen). Kein neuer Env-Wert. |
| 2026-11-19 | Mail-Design und -Texte aus Figma im Code. Neu: Bilder in Mails, fest von `https://app.narravit.de/images/mail/` geladen (Stage ist geschützt) — vor dem Go-live ohne Bilder. Supabase-Vorlagen neu erzeugt, können auf Stage eingesetzt werden. Offene Rechtsfragen ergänzt: Pflichtangaben je nach Rechtsform, 90-Tage-Aussage in den Erinnerungen; Impressum liefert weiter 404. Kein neuer Env-Wert. |
| 2026-11-19 | Go-live-Blocker ergänzt: PROJ-12 Erzähl-Einstellungen (Onboarding + Projektübersicht), Mail-Design aus Figma. Kaufbestätigung „nur erzählen" am selben Tag erledigt (Mail 03 mit Namen). Geschenk ohne eigenen Zugang bleibt wie gebaut (kein Blocker). Supabase-Vorlagen setzt Jakob selbst nach der Design-Übertragung. Migration `purchase_claims` auf Stage eingespielt; Anleitung für Production ergänzt. „Leaked password protection" für Production aufgenommen. Kein neuer Env-Wert. |
| 2026-11-19 | Security-Advisor (Funktionen): Migration `20261119200000_security_advisor_function_hardening.sql` legt den `search_path` der Zeitstempel-Trigger fest und sperrt die drei SECURITY-DEFINER-Trigger-Funktionen für RPC-Aufrufe. Migration `20261119210000_lookup_invitation_service_role_only.sql` gibt `lookup_invitation_by_token` nur noch für `service_role` frei; Einladungsseite und Einladungs-Annahme lesen dafür über den Service-Role-Client. Die zweite Migration erst nach dem Code-Deploy einspielen (Stage und Production). Gewollte Advisor-Hinweise: Abschnitt Datenbank. Kein neuer Env-Wert. |
| 2026-11-18 | Impressum-Link in allen Mails fest auf `https://www.narravit.de/impressum` (Webflow) statt `<SITE_URL>/impressum`; die Supabase-Vorlagen in `supabase/templates/` enthalten ihn jetzt auch und müssen beim Einsetzen in der neuen Fassung verwendet werden. Kein neuer Env-Wert. |
| 2026-11-16 | Kauf ohne Konto (PROJ-6): neue Migration `20261116100000_proj6_purchase_claims.sql` (auf Stage noch einzuspielen), Landingpage-Button muss auf `/onboarding` zeigen, Datenschutz-Hinweis zu Checkout-Adresse und Cookie `nv_kauf`, zwei neue Smoke-Tests. Kein neuer Env-Wert. |
| 2026-10-14 | Absender-Name überall `NARRAVIT` in Großbuchstaben (App-Mails im Code; Supabase-SMTP auf Stage und Production manuell). |
| 2026-10-14 | Test-Empfänger-Sperre hängt an der Site-URL statt an `VERCEL_ENV` (Stage kann in Vercel als „Production" laufen); offene Frage zur Vercel-Umgebung von Stage ergänzt. |
| 2026-10-14 | Datei angelegt mit dem Stand aus PROJ-1, -2, -6, -11 (Env-Variablen, Supabase-Auth, Stripe, Resend, Rechtliches). Stage-Mail-Variablen `RESEND_API_KEY`, `CRON_SECRET`, `EMAIL_TEST_RECIPIENT` werden eingerichtet. |
