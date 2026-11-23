# PROJ-11: Resend-Transaktionsmails

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-11-resend-transaktionsmails.md).

> ℹ️ **Anpassung 2026-10-13:** Vapi entfällt ([PROJ-12](PROJ-12-audio-erzaehlpipeline.md)). „Mail 3 — Vapi-Paket-Kauf-Bestätigung" (Template, Helper, Webhook-Hook) wurde mit dem PROJ-6-Rückbau entfernt; die Portal-Kauf-Mail und die Welcome-Mail nennen jetzt „per Sprachnachricht erzählen" statt Telefon/10 Stunden. Alle Vapi-Passagen weiter unten sind damit überholt. Die neuen Mails (Erzähl-Aufforderung, Erinnerung, „neues Kapitel erzählt") gehören zu PROJ-12 und nutzen die hier gebaute Infrastruktur.

> ℹ️ **Anpassung 2026-11-19 (Jakob) — Ablauf und Verlängerung an alle Mitglieder.** Verlängern kann jedes Projektmitglied, z. B. auch die beschenkte Person statt der Käuferin. Deshalb muss die Information in beide Richtungen fließen:
> - **Erinnerungen 30 / 7 Tage vor Ablauf** gehen an **alle** Mitglieder des Projekts (Projektleiter und Co-Autoren), nicht mehr nur an Projektleiter (`src/app/api/cron/reminders/route.ts`; Marker in `mail_log` weiter pro Person).
> - **Nach einer Verlängerung** bekommt die Person, die bezahlt hat, die Bestätigung mit Betrag und Rechnung plus den Satz, dass die anderen informiert wurden. **Alle anderen Mitglieder** bekommen eine Info-Mail („[Name] hat den Portal-Zugang für das Projekt „[Projekt]“ um weitere 12 Monate verlängert", neues Ablaufdatum) — ohne Betrag und Rechnung (`RenewalEmail` mit `renewedBy`, `sendRenewalInfoMail`, Webhook `handleRenewal`).
> - Nicht-Mitglieder bekommen nichts: die Käuferin eines Geschenks ohne eigenen Zugang und die erzählende Person ohne Konto (PROJ-12).
> - Figma: Mail 10 um den Hinweissatz ergänzt, neue Mail „10b Verlängerung Info an Mitglieder".

> ℹ️ **Anpassung 2026-11-19 (abends): Mail-Design und Texte aus Figma im Code** (Datei „NARRAVIT Mails“, 01 bis 12, 03b, 10b). Heller Grund, Baum-Logo, Schriftzug NARRAVIT in Merriweather, Überschriften in PT Serif. Bilder kommen immer von `https://app.narravit.de/images/mail/` und erscheinen deshalb erst ab dem Go-live. NARRAVIT ist nicht im Handelsregister eingetragen, der Impressum-Link genügt.

> ℹ️ **Anpassung 2026-11-21 — Zeichenkodierung.** In den Supabase-Mails kamen Umlaute, Anführungszeichen, Striche und der Mittelpunkt kaputt an („f√ºr"). Das HTML **aller** Mails ist jetzt reines ASCII: `src/emails/encoding.ts` wandelt Sonderzeichen in numerische HTML-Codes, angewendet in `sendEmail` und beim Erzeugen von `supabase/templates/`. Klartext-Fassung und Betreff bleiben UTF-8. Geprüft: alle 14 Vorlagen zeigen auch bei absichtlich falscher Kodierung denselben Text.

## Status: Approved
**Created:** 2026-05-22
**Last Updated:** 2026-11-22 (QA Re-Test bestanden, BUG-19 und BUG-20 behoben; offen: Impressum vor dem Go-live)

## Dependencies
- Requires **PROJ-2** (Auth + SSR) — User-Profile mit E-Mail-Adressen als Empfänger; Verifikations-Status als Voraussetzung für Welcome-Mail
- Requires **PROJ-6** (Stripe-Zahlungen) — Webhook-Hook für Portal-/Vapi-/Verlängerungs-Bestätigungen
- Requires **PROJ-9** (Projekt-Mitglieder + Einladungen) — Hook in `createInvitationAction` für Einladungs-Mail
- Soft dependency: **PROJ-3** (Persönlicher Bereich) — Welcome- und Reminder-Mails verlinken in den Bereich

## User Stories
- Als **Eingeladene Person** möchte ich eine Mail mit dem Einladungs-Link bekommen, sobald jemand mich zum Projekt einlädt — ohne dass der Projektleiter den Link manuell weiterleiten muss.
- Als **Käufer** möchte ich nach einer erfolgreichen Stripe-Zahlung (Portal-Erstkauf, Vapi-Paket, Verlängerung) eine Bestätigungs-Mail mit Zahlungsdetails und einem Link zurück in den persönlichen Bereich. (Die in-App-Bestätigungsseite aus PROJ-6 bleibt das sofortige Feedback; die Mail ist der dauerhafte Beleg.)
- Als **neuer Nutzer** möchte ich nach der Account-Erstellung eine Willkommens-Mail mit kurzer Einleitung und Verweis auf den persönlichen Bereich — separat von der reinen Auth-Verifikations-Mail von Supabase.
- Als **Schreibender mit ablaufendem Portal-Zugang** möchte ich 30 Tage und nochmal 7 Tage vor Ablauf an die Verlängerung erinnert werden, damit mir der Portal-Zugang nicht unerwartet wegbricht.
- Als **narravit-Team** möchte ich Mail-Versand-Fehler in Sentry sehen, ohne den User-Flow durch synchrone Fehler zu unterbrechen — Mail-Versand ist Best-Effort.

## Acceptance Criteria

### Allgemein
- [ ] Mail-Versand läuft über **Resend** als Provider.
- [ ] Absender ist `no-reply@narravit.de` — finales Setup (Anzeigename, exakte Adresse, ggf. Reply-To) wird im Resend-Konto konfiguriert; der App-Code liest die From-Adresse aus einer Environment-Variable.
- [ ] Alle Mails sind **deutsch** (Sie-/Du-Form konsistent zu den restlichen Portal-Texten — wird vor Roll-out final abgestimmt).
- [ ] Alle Mails enthalten im Footer: narravit-Logo, Impressum-Link, Kontakt-Hinweis. Kein Unsubscribe-Link (Transaktionsmails sind nicht abbestellbar — gesetzlich erlaubt).
- [ ] **Versand-Modus:** asynchron / Best-Effort. Eine Versand-Aktion blockiert nie den User-Flow. Bei Fehler wird in Sentry geloggt, aber kein User-Feedback gezeigt.
- [ ] Idempotenz: jede Mail wird pro Auslöse-Event genau einmal verschickt (Stripe-Webhook ist schon idempotent; Invitation-Mail wird pro Invitation-Row einmal verschickt; Welcome-Mail wird pro User einmal verschickt; Reminder werden pro `(user, project, days_before)` einmal verschickt).

### Mail 1 — Einladung
- [ ] Trigger: `createInvitationAction` aus PROJ-9 erfolgreich (Invitation-Row angelegt).
- [ ] Empfänger: die eingeladene E-Mail-Adresse (`invitations.email`).
- [ ] Inhalt: Anrede, Hinweis "X hat dich zum Projekt Y eingeladen", Rolle (Projektleiter / Co-Autor), Einladungs-Link (führt zu `/einladung/<token>`), Hinweis auf 14-Tage-Gültigkeit.
- [ ] ~~Step-2-Modal aus PROJ-9 bleibt erhalten und zeigt den Link weiterhin (für manuelle Weiterleitung als Backup)~~ — **Änderung 2026-10-14 (Jakob):** Die Mail ist der einzige Weg. Step 2 bestätigt nur den Versand, ohne Link und ohne „Link kopieren".

### Mail 2 — Portal-Kauf-Bestätigung
- [ ] Trigger: Stripe-Webhook `checkout.session.completed` mit `payment_type = portal_initial` (oder vergleichbarer Identifier aus PROJ-6).
- [ ] Empfänger: die im Stripe-Checkout angegebene Käufer-E-Mail (= `auth.users.email` des Käufers).
- [ ] Inhalt: Anrede, "Willkommen bei narravit — dein Portal-Zugang ist freigeschaltet", Zahlungsdetails (Betrag, Datum, Stripe-Rechnungs-Link falls verfügbar), Hinweis auf 1 Jahr Gültigkeit, "10 Stunden Vapi-Erzählzeit sind inklusive", Link zum persönlichen Bereich.

### Mail 3 — Vapi-Paket-Kauf-Bestätigung
- [ ] Trigger: Stripe-Webhook `checkout.session.completed` mit `payment_type = vapi_minutes`.
- [ ] Empfänger: Käufer-E-Mail.
- [ ] Inhalt: Anrede, "+60 Minuten Vapi-Erzählzeit wurden deinem Projekt hinzugefügt", Projektname, Zahlungsdetails, aktueller Vapi-Minuten-Saldo (sofern aus dem Webhook-Kontext bekannt), Link zur Projektübersicht.

### Mail 4 — Welcome-Mail nach Signup
- [ ] Trigger: Account-Email wurde via Supabase-Auth-Verifikation bestätigt (also **nach** Verifikations-Klick, nicht direkt nach Signup-Submit). Konkrete Hook-Stelle in `/architecture`.
- [ ] Empfänger: die verifizierte E-Mail-Adresse des Accounts.
- [ ] Inhalt: warme Begrüßung, kurze Einführung ("Du kannst jetzt Lebensbücher anlegen, Familienmitglieder einladen, am Telefon oder im Editor schreiben"), Link zum persönlichen Bereich, Kontakt-Hinweis bei Fragen.
- [ ] **Abgrenzung zur Supabase-Verifikations-Mail:** Diese ist technisch ("Klicke hier, um deine E-Mail zu bestätigen") und kommt aus Supabase Auth. Die Welcome-Mail aus PROJ-11 ist inhaltlich (Onboarding) und ist eine **separate Mail**, die erst nach erfolgreicher Verifikation verschickt wird.
- [ ] Pro Account wird die Welcome-Mail genau einmal verschickt (Idempotenz-Marker im `mail_log`).

### Mail 5 — Verlängerungs-Bestätigung (12-Monate-Renewal)
- [ ] Trigger: Stripe-Webhook `checkout.session.completed` mit `payment_type = portal_renewal`.
- [ ] Empfänger: Käufer-E-Mail.
- [ ] Inhalt: Anrede, "Dein Portal-Zugang wurde um 12 Monate verlängert", neues Ablauf-Datum, Zahlungsdetails, Link zum persönlichen Bereich.

### Mail 6 — Reminder 30 Tage vor Ablauf
- [ ] Trigger: täglicher Scheduled Job prüft alle Portal-Zugänge mit `expires_at` zwischen `now + 29 Tage` und `now + 30 Tage`, die noch nicht 30-Tage-erinnert wurden.
- [ ] Empfänger: der Inhaber des Portal-Zugangs (Projektleiter des betreffenden Projekts).
- [ ] Inhalt: ruhiger Hinweis "Dein Portal-Zugang für Projekt Y läuft in 30 Tagen ab — falls du weiter schreiben möchtest, kannst du jetzt verlängern", Ablauf-Datum, Verlängerungs-Link (führt zum Stripe-Checkout der Verlängerung).
- [ ] Pro `(user, project)` wird die 30-Tage-Reminder-Mail genau einmal verschickt (Markierung im `mail_log`).

### Mail 7 — Reminder 7 Tage vor Ablauf
- [ ] Trigger: täglicher Scheduled Job prüft alle Portal-Zugänge mit `expires_at` zwischen `now + 6 Tage` und `now + 7 Tage`, die noch nicht 7-Tage-erinnert wurden.
- [ ] Empfänger: Inhaber des Portal-Zugangs.
- [ ] Inhalt: dringenderer Ton "Nur noch 7 Tage — dein Portal-Zugang läuft am … ab. Verlängere jetzt, um nicht den Zugriff zu verlieren", Ablauf-Datum, Verlängerungs-Link.
- [ ] Pro `(user, project)` wird die 7-Tage-Reminder-Mail genau einmal verschickt.

### Fehlerverhalten
- [ ] Bei Resend-API-Fehler (Timeout, 5xx, Auth-Fehler): Eintrag in Sentry inklusive Mail-Typ, Empfänger (gehasht zur DSGVO-Schonung) und Fehler-Detail. Kein User-sichtbarer Effekt.
- [ ] Bei dauerhaftem Bounce (Empfänger-Adresse existiert nicht): aktuell nur Sentry-Log. Eine separate Bounce-Verarbeitung ist out of scope (siehe Folge-Tickets).
- [ ] Bei Versand-Versuch mit fehlender / ungültiger Empfänger-Adresse: vor dem API-Call abbrechen und Sentry-Warn (kein Resend-Call).
- [ ] Antworten auf no-reply-Mails landen im Posteingang des Resend-Konto-Setups (typisch im Nichts) — Beantwortung von Support-Anliegen läuft über kontakt@narravit.de, das aktiv im Footer der Mails angegeben ist.

## Edge Cases
- **Resend-Quota erschöpft / API down:** Sentry-Eintrag pro Versuch; User-Flows laufen ungestört weiter. Stripe-Webhook ist idempotent — beim nächsten Webhook-Retry (durch Stripe) wird der Mail-Versand erneut versucht (für Stripe-getriggerte Mails). Für Invitation-Mail: kein automatischer Retry; manuelle Weiterleitung des Step-2-Link-Backups deckt den Fall ab.
- **User existiert in Auth, aber profile-Row hat noch keinen full_name:** Mail verwendet Fallback "Hallo," statt personalisiertem "Hallo Maria,".
- **Welcome-Mail an Auth-User, der sich nie verifiziert:** Mail wird **nicht** verschickt. Pro Account ist die Verifikation Voraussetzung.
- **Stripe-Webhook ohne Käufer-E-Mail-Metadaten:** Fallback auf `auth.users.email` des verknüpften Users; falls auch das fehlt, Sentry-Eintrag + keine Mail.
- **User ändert E-Mail nach Account-Erstellung, vor Verlängerungs-Reminder:** Reminder geht an die aktuelle E-Mail-Adresse aus `profiles` zum Zeitpunkt des Versands.
- **Mehrfacher Stripe-Webhook für denselben Event (Stripe-Retry):** Idempotenz im Webhook-Handler verhindert Doppelversand der Mail.
- **30-Tage-Reminder fällt aufs Wochenende oder Feiertag:** Cron läuft täglich, keine Sonderbehandlung — Mail geht am Tag des Match-Fensters raus.
- **Concurrent Run des Reminder-Jobs:** durch Idempotenz-Marker pro `(user, project, days_before)` keine Doppelmails.
- **Reminder für Projekt, das User schon entfernt hat / das gelöscht wurde:** Match-Query prüft Existenz der Projekt-Mitgliedschaft + Projekt; gelöschte Projekte werden ignoriert.
- **User antwortet auf no-reply-Mail:** Antwort verfällt im no-reply-Postfach. Footer der Mails enthält `kontakt@narravit.de` als sichtbare Support-Adresse für tatsächliche Anliegen.
- **DSGVO / Daten-Retention:** Mail-Inhalte enthalten keine sensiblen Daten über das Notwendige hinaus. Logs in Sentry enthalten gehashte oder gekürzte Empfänger-Adressen.
- **HTML-Rendering in alten E-Mail-Clients (Outlook 2010/2013):** Templates werden mit Email-tauglichem HTML/CSS gebaut (tabellenbasiertes Layout, Inline-Styles); konkrete Modellierung in `/architecture`.

## Technical Requirements
- **Resend-API-Key:** wird als `RESEND_API_KEY` in den Environment-Variablen abgelegt (Vercel + lokal); nicht im Client verfügbar.
- **Absender-Domain-Setup:** `narravit.de` muss in Resend als verifizierte Domain mit DKIM + SPF + DMARC eingerichtet sein. Setup-Schritt ist Teil des Roll-out (out of code scope, aber prerequisite). From-Adresse wird im Resend-Konto auf `no-reply@narravit.de` konfiguriert.
- **Server-only:** alle Resend-Aufrufe laufen serverseitig (Server Action, Route Handler, Cron-Job). Niemals aus dem Client.
- **Templates wartbar im Code:** konkrete Modellierung (React-Email-Komponenten vs. HTML-Strings) in `/architecture`.
- **Reminder-Job:** läuft als Scheduled Job (z. B. `pg_cron` oder Supabase Edge Function mit Schedule, konkrete Wahl in `/architecture`). Tägliche Frequenz reicht.
- **Idempotenz-Marker** für Reminder und Welcome: eine eigene kleine Tabelle (z. B. `mail_log` mit `user_id`, `project_id`, `mail_type`, `sent_at`) — Architektur entscheidet das Schema. Stripe-getriggerte Mails brauchen keinen extra Marker (Stripe-Webhook ist bereits idempotent).
- **Observability:** Sentry erfasst alle Versand-Fehler; Resend-Dashboard zeigt Versand-Statistiken pro Mail-Typ (Hash über Mail-Tags).
- **Test-Modus:** in nicht-Produktions-Umgebung (`stage-app.narravit.de`, lokal) Versand entweder an eine Sandbox-Adresse oder über Resend-Testmode, damit Testdaten keine echten Mails auslösen.

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Tech-Entscheidungen (begründet)

1. **Resend SDK + React-Email-Templates** — Resend ist der gewählte Provider; React-Email (`@react-email/components`) ist der natürliche Begleit-Stack: typsichere Komponenten im Repo, Email-tauglicher HTML/CSS-Output, gute Outlook-/Gmail-Kompatibilität durch Standard-tabellenbasiertes Layout.

2. **`mail_log` mit Unique-Constraint** statt Lookup-vor-Insert — eine zusätzliche Tabelle für Welcome + Reminder ist sauberer als ein Flag auf `profiles` oder eine Spalte auf `payments`.

3. **Welcome beim nächsten Server-Render statt Auth-Webhook** — Supabase Auth bietet zwar einen Auth-Webhook-Mechanismus, aber er ist eine zusätzliche Konfiguration mit eigener Fehler-Oberfläche (Webhook-URL erreichbar?

4. **Vercel Cron statt pg_cron für Reminder** — die Reminder-Logik ist Business-Logik (Personalisierung, Template-Rendering, Resend-Aufruf), keine pure SQL-Operation.

5. **Fire-and-forget Versand mit `void` + Sentry-Catch** — Mail-Versand blockiert nie den auslösenden User-Flow.

6. **From-Adresse aus Environment-Variable** — die finale Mail-From-Adresse + Anzeigename werden im Resend-Konto definiert (mit verifiziertem DKIM/SPF/DMARC) und in der App nur aus `EMAIL_FROM` (env var) gelesen.

7. **Test-Modus über Env-Variable** — `EMAIL_TEST_RECIPIENT` (nur in stage/lokal gesetzt) leitet alle Mails an diese eine Adresse um statt an den echten Empfänger.

8. **Empfänger-E-Mail-Hash in Sentry-Logs** — Sentry-Events zeigen den Mail-Typ + ein gehashtes/gekürztes Empfänger-Merkmal (z.

9. **Kein Bounce-Webhook im MVP** — Resend bietet einen Bounce-Webhook, der bei Hard-/Soft-Bounces aufgerufen wird.

10. **Keine eigene Mail-Queue** — `resend` ist selbst eine HTTP-API, Resend übernimmt das Queue-Management providerseitig.

### Spätere Entscheidungen
- **Rabattcode (Jakob, 2026-11-22):** ein fester Stripe-Promotion-Code für alle, 50 € auf den Erstkauf, ohne Ablaufdatum. Ihn bekommen nur Konten, die sich selbst registriert haben, nicht Käufer, beschenkte oder eingeladene Personen.

## Offene Punkte
- BUG-1 (Medium, Go-live-Blocker): Impressum-Link, kommt mit der Webflow-Überarbeitung und steht in der Prod-Checkliste.
- BUG-9 (Low): Welcome- und Kauf-Mail nennen das Erzählen per Sprachnachricht, Mail 03b die Frequenz-Einstellung. Beides ist erst mit PROJ-12 live.
- BUG-10 (Low): hängt an PROJ-17.
- Offen, aber kein Fehler: Stripe-Rabattcode, Mail-Bilder erst ab Go-live, Apple in der Reset-Mail.
- Grenzen des Rabattcodes: Er lässt sich weitergeben. Wer sich vor dem Kauf kostenlos registriert, bekommt ihn. Wer ein Geschenk ohne Konto gekauft hat und sich später registriert, ist nicht als Käufer erkennbar und bekommt ihn ebenfalls.
- Vor dem Roll-out live prüfen: Resend-Domain (DKIM, SPF, DMARC), Versand an eine Test-Adresse, Vercel-Cron. Ein Alarm bei Mail-Ausfällen über Sentry folgt mit PROJ-13.
- Ideen für später: Bounce-Webhook, Einladungs-Inbox, Mehrsprachigkeit, A/B-Tests, PDF-Anhang, abschaltbare Erinnerungen, Sammel-Erinnerung bei mehreren Projekten.
- Versandstatistik und einzelne Mails bleiben im Resend-Dashboard, kein eigenes Dashboard im Portal.
