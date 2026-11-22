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
5. **Vercel Production-Variablen** setzen (Abschnitt 2), Domain `app.narravit.de` prüfen.
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
| `EMAIL_TEST_RECIPIENT` | `kontakt@narravit.de` | **nicht setzen** | Leitet alle Mails um. Wird in Production zwar ignoriert, soll dort trotzdem fehlen. **Ist Stand 2026-11-22 in Vercel auch für Production gesetzt: vor dem Go-live dort entfernen.** Die Sperre im Code greift nur, wenn `NEXT_PUBLIC_SITE_URL` exakt `https://app.narravit.de` ist. |
| `EMAIL_FROM` | nicht gesetzt (Fallback) | optional | Fallback im Code: `NARRAVIT <no-reply@mail.narravit.de>`. Absender-Name immer in Großbuchstaben, Adresse auf `mail.narravit.de`. |
| `CRON_SECRET` | eigener Zufallswert | **neuer** Zufallswert | Sensitive. Erzeugen: `openssl rand -base64 32`. **Fehlt in Production noch** (Stand 2026-11-22: nur für Preview und Development angelegt). Ohne Wert antwortet der Cron mit 500 und es gehen keine Erinnerungen raus. |

Sicherung im Code: Auf `https://app.narravit.de` (= `NEXT_PUBLIC_SITE_URL` in Production) wird `EMAIL_TEST_RECIPIENT` ignoriert, selbst wenn die Variable versehentlich gesetzt ist.

Entfallen, in Production **nicht** anlegen: `STRIPE_PRICE_ID_VAPI_60`, `VAPI_API_KEY` (Vapi-Rückbau 2026-10-13).

### Weitere Vercel-Einstellungen

- [ ] Domain `app.narravit.de` ist der Production-Domain zugeordnet (DNS siehe Abschnitt 7).
- [ ] Deployment Protection (Vercel-Login) gilt nur für Stage/Preview, **nicht** für Production.
- [ ] Cron `/api/cron/reminders` (täglich 09:00 UTC, `vercel.json`): Vercel führt Crons nur für Deployments der Umgebung „Production" aus. Nach dem ersten Lauf in den Vercel-Logs prüfen, dass er mit 200 antwortet.
- [x] Geklärt (2026-11-22): Stage läuft als „Preview", der Production-Branch ist bereits `main` und `app.narravit.de` zeigt auf dessen Production-Deployment. Stage-Werte gehören in die Umgebung „Preview", die Production-Werte werden separat angelegt. Beim Redeploy von Stage in der Deployment-Liste auf den Branch `stage` achten, dort stehen auch Preview-Deployments von `main`.

---

## 3. Supabase

Stage = Projekt-Ref `kdjhxqitfxnsavhiafdn`. Production = Haupt-Projekt (`main`) — Zuordnung vor dem Umzug im Dashboard bestätigen. Claude hat bewusst **keinen** Zugriff auf Production-Daten — Migrationen in Production spielt der Betreiber ein (Branch-Merge oder SQL-Editor).

### Datenbank

- [ ] Alle Migrationen aus `supabase/migrations/` in Production angewendet (Stand 2026-11-19: 17 Dateien, letzte `20261119210000_lookup_invitation_service_role_only.sql`). Mit `list_migrations` bzw. im Dashboard gegen das Repo abgleichen.
- [x] Stage: `20261116100000_proj6_purchase_claims.sql` am 2026-11-19 über den SQL-Editor eingespielt und in `supabase_migrations.schema_migrations` vermerkt (Version `20261116100000`). In Production genauso: Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261116100000', 'proj6_purchase_claims');` — ohne die Tabelle werden Gast-Käufe nicht erfasst (Webhook antwortet 500).
- [ ] Migration `20261121100000_proj6_purchase_claim_mail_token.sql` (Spalte `purchase_claims.mail_token_hash` für den persönlichen Einlöse-Link in der Kauf-Mail). **Vor dem Code-Deploy einspielen**, sonst scheitert der Webhook bei Käufen ohne Konto. Keine RLS-Änderung. Stage: am 2026-11-21 eingespielt und geprüft.
- [ ] Migration `20261121110000_proj6_direct_gift.sql` (`projects.owner_id` darf bis zur Annahme eines Geschenks leer sein, neue Spalte `invitations.is_gift`). **Vor dem Code-Deploy einspielen**, sonst scheitern Geschenk-Käufe. Keine RLS-Änderung.
- [ ] Migration `20261122100000_proj11_mail_retry_queue.sql` (neue Tabelle `mail_retry_queue` für Mails, deren Versand gescheitert ist; RLS aktiv, keine Policies, nur Service-Role). **Vor dem Code-Deploy einspielen**, sonst werden gescheiterte Mails nicht nachgeholt. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261122100000', 'proj11_mail_retry_queue');`. Stage: am 2026-11-22 eingespielt und geprüft.
- [ ] Seed `supabase/seed.sql` (15 Erzähl-Impulse) in Production eingespielt; Leitfragen kommen aus der Migration `proj8_impulse_leading_questions`.
- [ ] Storage-Buckets aus `20260515200002_storage_buckets.sql` vorhanden (4 private Buckets).
- [ ] Testdaten **nicht** übernehmen: QA-Konto `qa-test@narravit.de`, Test-Projekte, Test-Zahlungen bleiben auf Stage.
- [ ] Migration `20261119200000_security_advisor_function_hardening.sql` (fester `search_path` für die Zeitstempel-Trigger, Trigger-Funktionen ohne RPC-Recht; Stage: am 2026-11-19 eingespielt und vermerkt — dabei versehentlich in einer Zwischenfassung, die auch die Rechte aus der nächsten Migration schon enthielt). Ohne Abhängigkeit zum Code, kann jederzeit eingespielt werden: Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261119200000', 'security_advisor_function_hardening');`.
- [ ] Migration `20261119210000_lookup_invitation_service_role_only.sql` (`lookup_invitation_by_token` nur noch für `service_role`; Stage: Rechte wirken schon seit 2026-11-19, die Datei nach dem Deploy trotzdem einmal ausführen — harmlos — und die Version vermerken). **Erst einspielen, wenn der Code mit dem Service-Role-Lookup ausgeliefert ist** — auf Stage nach abgeschlossenem Deploy von stage-app, in Production nach dem Merge `stage` → `main` und abgeschlossenem Deploy. Andersherum zeigt `/einladung/<token>` „Einladung nicht gefunden“, und Einladungen lassen sich nicht annehmen. Datei im SQL-Editor ausführen, dann `insert into supabase_migrations.schema_migrations (version, name) values ('20261119210000', 'lookup_invitation_service_role_only');`. Smoke-Test: Einladungslink abgemeldet öffnen (Vorschau mit Projekttitel) und angemeldet annehmen. Nach beiden Migrationen Dashboard → Advisors → Security: gewollt sind nur `rls_enabled_no_policy` (`mail_log`, `mail_retry_queue`, `purchase_claims`), `anon_`/`authenticated_security_definer_function_executable` für die RLS-Hilfsfunktionen `get_my_project_ids`, `am_i_pl_of`, `is_member_of` und `auth_leaked_password_protection` (Dashboard-Schalter unter Auth). Jeder andere Hinweis ist neu und vor dem Go-live zu klären.

### Auth → URL Configuration

- [ ] Site URL: `https://app.narravit.de`
- [ ] Redirect URLs: `https://app.narravit.de/auth/callback**` (die App leitet alle Mail- und OAuth-Links über `/auth/callback?next=…`). Fehlt der Eintrag, sind die Links in den Bestätigungs- und Passwort-Mails kaputt, weil die Vorlagen `&token_hash=…` an die Adresse anhängen und Supabase dann auf die Site URL ohne `?` zurückfällt.

### Auth → SMTP (Mails über Resend)

- [ ] Custom SMTP aktiv: Host `smtp.resend.com`, Port 465, User `resend`, Passwort = eigener Resend-Schlüssel für Supabase-Production (nicht den App-Schlüssel teilen).
- [ ] Absender-Name **`NARRAVIT`** (Großbuchstaben, wie die App-Mails), Absender-Adresse wie auf Stage (auf `mail.narravit.de`).
- [ ] Mail-Rate-Limit unter Auth → Rate Limits passend setzen (mit eigenem SMTP frei wählbar).

### Auth → Passwort-Sicherheit

- [ ] „Leaked password protection" einschalten (Abgleich mit HaveIBeenPwned). Auf Stage laut Supabase-Advisor am 2026-11-19 aus.

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
- [ ] Promotion-Codes/Coupons im Live-Modus anlegen, falls gewünscht (Checkout erlaubt Codes: `allow_promotion_codes: true`).
- [ ] Checkout-Einstellungen: Links zu AGB und Datenschutz hinterlegen.
- [ ] MwSt.: Stripe Tax aktivieren oder Preise ausdrücklich als Brutto-Endpreise führen (offene Entscheidung).
- [ ] Rechnungen: Checkout erzeugt derzeit keine Rechnungen; die Kauf-Mail zeigt den Rechnungs-Link nur, wenn eine Rechnung existiert (offene Entscheidung, PROJ-11 BUG-7). Der Bereich „Rechnungen" im persönlichen Bereich ist noch ein Platzhalter. **Entscheidung (Jakob, 2026-11-21): vor dem Go-live einbauen, Rechnungen laufen nur über Stripe.** Stripe erzeugt sie im Checkout (`invoice_creation`) und schickt sie an die Checkout-Adresse, das deckt auch Käufe ohne Konto ab. Vorher klären: Steuerstatus (Kleinunternehmer oder Umsatzsteuer), Absenderdaten in Stripe, Kosten und ob für Kunden aus Österreich und der Schweiz die Adresse im Checkout abgefragt werden muss.

---

## 5. Resend (Transaktionsmails)

- [ ] Domain `mail.narravit.de` ist verifiziert (DKIM `resend._domainkey.mail.narravit.de`, SPF/MX auf `send.mail.narravit.de`) — gilt für Stage und Production. Die Hauptdomain `narravit.de` ist **nicht** in Resend eingerichtet; Absender dort würden abgelehnt.
- [ ] Eigener API-Schlüssel `narravit-app-prod` (Sending access, nur `mail.narravit.de`) → Vercel `RESEND_API_KEY` (Production).
- [ ] Eigener Schlüssel für Supabase-SMTP in Production (Abschnitt 3).
- [ ] Stage-Schlüssel bleiben auf Stage; beim Umzug nicht wiederverwenden.
- [ ] Suppression-Liste prüfen: Adressen aus Tests (z. B. `qa-test@narravit.de`) stehen dort; echte Kundenadressen dürfen nicht darauf landen.
- [ ] **Bilder in Mails** (Logo im Kopf jeder Mail, Strandfoto in der Willkommens-Mail) liegen in `public/images/mail/` und werden **immer** von `https://app.narravit.de/images/mail/…` geladen (`MAIL_ASSETS_URL` in `src/emails/Layout.tsx`), auch in Stage-Mails und Supabase-Vorlagen. Grund: Stage ist per Vercel-Deployment-Protection gesperrt, Mail-Programme kämen dort nicht an die Bilder. **Stand 2026-11-19:** `app.narravit.de` liefert diese App noch nicht aus (`/images/…` → 404), deshalb zeigen Mails bis zum Go-live keine Bilder (das Layout bleibt intakt, der Schriftzug „NARRAVIT" steht als Text da). Nach dem Umzug prüfen: `https://app.narravit.de/images/mail/narravit-logo.png` und `…/willkommen-strand.jpg` liefern 200.
- [ ] **Gescheiterte Mails:** Der tägliche Cron holt sie aus `mail_retry_queue` bis zu dreimal nach. Klappt das nicht, geht ein Hinweis ohne Empfängerdaten an `kontakt@narravit.de`, dieses Postfach muss also gelesen werden. Empfänger und Fehler stehen dann in der Tabelle und werden nach 30 Tagen automatisch gelöscht. Die Speicherung in die Datenschutzerklärung aufnehmen.

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

- [ ] Impressum — liegt auf der Webflow-Website unter `https://www.narravit.de/impressum`. Der Footer jeder Mail (App-Mails und Supabase-Vorlagen) verlinkt **fest** dorthin, auf Stage wie in Production; die Seite muss also erreichbar und vollständig sein (PROJ-11 BUG-1). **Stand 2026-11-19:** liefert noch 404.
- [x] Pflichtangaben in Mails: NARRAVIT ist **nicht** im Handelsregister eingetragen (Jakob, 2026-11-19). Die Geschäftsbrief-Pflichtangaben (§ 37a HGB, § 35a GmbHG) gelten damit nicht, der Impressum-Link im Fuß jeder Mail genügt; der Platzhalter ist aus den Supabase-Vorlagen entfernt. **Neu prüfen, falls sich die Rechtsform ändert** (Eintragung, UG/GmbH) — dann gehören Firma, Rechtsform, Sitz, Registergericht, Registernummer und ggf. Geschäftsführung in **jede** geschäftliche Mail (`src/emails/Layout.tsx`).
- [ ] **Aufbewahrung 90 Tage:** Die Erinnerungs-Mails 08/09 und die Seite „Zugang abgelaufen" versprechen, dass Inhalte nach Ablauf noch 90 Tage gespeichert und dann **endgültig gelöscht** werden (`CONTENT_RETENTION_DAYS`). Die Löschung ist noch nicht gebaut und steht nicht in AGB/Datenschutz — vor Go-live festlegen und umsetzen oder den Satz anpassen.
- [ ] Datenschutzerklärung (auch für Facebook-App und Stripe-Checkout nötig).
- [ ] Datenschutzerklärung nennt den Kauf ohne Konto: Speicherung der Checkout-E-Mail-Adresse bis zur Konto-Anlage (`purchase_claims`) und das technisch notwendige Cookie `nv_kauf` (Zuordnung des Kaufs, 60 Tage).
- [ ] AGB und Widerrufsbelehrung für den Kauf.
- [ ] Kein Abmelde-Link in Erzähl-Aufforderungen (Produktentscheidung) — rechtlich prüfen lassen (PROJ-12).

---

## 9. Go-live-Blocker (Features)

- [ ] **Keine Bypass-Tokens in Production (Jakob, 2026-11-22, Pflicht vor dem Go-live):** `x-vercel-protection-bypass` darf in keiner Production-URL und keiner Production-Einstellung stehen. Prüfen:
  - Stripe Live-Webhook lautet exakt `https://app.narravit.de/api/stripe/webhook`, ohne Parameter.
  - `app.narravit.de` liegt nicht hinter der Vercel-Deployment-Protection, ein Bypass ist dort also gar nicht nötig.
  - Keine Bypass-Werte in den Production-Variablen, in Supabase, Resend oder anderen Diensten.
  - `git grep -n "x-vercel-protection-bypass" -- src` liefert nichts.
  - Der Stage-Webhook in Stripe (Testmodus) ist von den Live-Endpunkten getrennt. Ein auf Stage genutzter Bypass-Wert wird nach dem Umzug in Vercel widerrufen, falls Stage ihn nicht mehr braucht.
- [ ] PROJ-17 Rate-Limiting für Auth-Endpunkte (bringt eigene Env-Variablen mit — dann hier ergänzen).
- [ ] PROJ-19 Production-Hardening (Security-Header, Env-Prüfung beim Start).
- [ ] PROJ-12 Audio-Erzählen live, sonst Mail-Texte zum „Erzählen per Sprachnachricht" anpassen (PROJ-11 BUG-9). Bringt SMS-Anbieter (seven.io) und Transkriptions-/LLM-Schlüssel mit — dann hier ergänzen.
- [ ] PROJ-13 Fehler-Monitoring (Sentry) — dann `SENTRY_DSN` o. ä. hier ergänzen.
- [ ] PROJ-12 Paket „Erzähl-Einstellungen": Onboarding-Schritt „Wie soll [Name] die wöchentlichen Erzähl-Impulse erhalten? — Telefon, E-Mail oder beides" samt Kontaktdaten und Einverständnis, plus Sektion in der Projektübersicht. Ohne ihn fehlen bei Geschenk-Käufen die Kontaktdaten der erzählenden Person (Jakob, 2026-11-19).
- [x] Mail-Design aus Figma (Datei „NARRAVIT Mails") in `src/emails/` übertragen; Logo dafür hosten. Erledigt 2026-11-19 (Bilder siehe Abschnitt 5).

---

## 10. Smoke-Tests nach dem Umzug

- [ ] Registrierung mit E-Mail: Bestätigungs-Mail kommt an, Link funktioniert auch in einem anderen Browser, Willkommens-Mail kommt.
- [ ] Anmeldung mit Google und mit Facebook.
- [ ] „Passwort vergessen" für ein E-Mail-Konto und für ein Google-Konto.
- [ ] Echter Kauf (kleiner Betrag per Promotion-Code oder sofortige Erstattung): Projekt entsteht, Kauf-Mail kommt, Webhook in Stripe als zugestellt markiert.
- [ ] Kauf **ohne Konto** von der Landingpage: Checkout ohne Anmeldung, Mail „Konto anlegen" kommt an, nach der Registrierung ist das Projekt da. Zusätzlich einmal mit abweichender E-Mail-Adresse im selben Browser und einmal über den Mail-Link auf einem anderen Gerät.
- [ ] Geschenk-Kauf „Auch am Computer schreiben": Einladung an die beschenkte Person kommt an.
- [ ] Geschenk-Kauf **ohne Konto**: Einladung an die beschenkte Person kommt an, sobald der Käufer sein Konto angelegt hat.
- [ ] Einladung über „Nutzer hinzufügen" kommt an.
- [ ] Cron: In Vercel unter Settings → Cron Jobs ist `/api/cron/reminders` eingetragen (täglich 9:00 UTC, erscheint erst nach dem Merge auf `main`); `CRON_SECRET` ist in Production gesetzt. Einmal über **Run** auslösen, in den Logs muss 200 stehen.
- [ ] Mail-Links zeigen auf `app.narravit.de`, nicht auf `stage-app`.
- [ ] In Stripe (Live) steht beim Webhook kein `x-vercel-protection-bypass` in der URL (Abschnitt 9).
- [ ] Logo und Willkommens-Foto werden in den Mails angezeigt (Abschnitt 5).

---

## Änderungsprotokoll

| Datum | Eintrag |
|---|---|
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
