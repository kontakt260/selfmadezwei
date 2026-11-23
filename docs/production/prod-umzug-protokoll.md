# Prod-Umzug: Änderungsprotokoll

Verlauf aller Änderungen an der Checkliste [prod-umzug.md](prod-umzug.md). Neue Einträge kommen oben in die Tabelle. Nur Name, Ort und Stage- oder Prod-Wert, niemals Secret-Werte.

| Datum | Eintrag |
|---|---|
| 2026-11-23 | PROJ-31 QA: Neue lokale Variable `E2E_QA_PASSWORD` nur für die Tests in `.env.local`, nicht in Vercel setzen. Das QA-Konto bleibt auf Stage. Für Production ist nichts zu tun. |
| 2026-11-23 | PROJ-31: Änderungsprotokoll in diese eigene Datei ausgelagert. Für Production ist dadurch nichts zu tun. |
| 2026-11-23 | PROJ-30 QA-Fixes: Datenverlust bei langsamem Speichern, Seitenzahl auf dem Handy, Cover beim Verlassen, Ladeansicht und deutsche 404-Seite behoben. Keine weitere Migration, keine neuen Env-Werte. |
| 2026-11-23 | PROJ-30 Backend: Migration `20261123140000_proj30_word_count.sql`, auf Stage und Production jeweils vor dem Code-Deploy einspielen. Keine neuen Env-Werte. |
| 2026-11-23 | PROJ-30 Tech Design: Datenverlust durch die Zurück-Taste im Editor als Go-live-Blocker eingetragen. Geplant ist eine kleine Migration für die Wortzahl, noch nicht gebaut. |
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
